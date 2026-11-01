/** Lazy operation-owned native batch readers with serialized exchanges and deterministic cleanup. */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { assertGitNotCanceled, bindGitProcessCancellation } from "./process-cancellation.js";
import { GitProcessError, normalizeGitRejection, type GitInvocation } from "./process-error.js";
import type { RawGitResult } from "./exec.js";
import { GitBatchOutput } from "./batch-output.js";

/** Fully bound native invocation supplied by the ordinary raw Git adapter. */
export interface GitBatchReadInvocation {
  args: string[]; cwd: string; env: NodeJS.ProcessEnv; maxBuffer: number; input: Uint8Array; signal?: AbortSignal; onStart?: () => void;
}

/** An operation owns its readers; no child or repository state is shared with later operations. */
export class GitBatchReadScope {
  private readonly readers = new Map<string, NativeBatchReader>();
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  /** Reuse only an exactly matching repository, environment, arguments, and output bound. */
  run(input: GitBatchReadInvocation): Promise<RawGitResult> {
    if (this.closed) return Promise.reject(new Error("The Git batch read scope is closed"));
    const pending = this.queue.then(async () => {
      const key = JSON.stringify([input.cwd, input.args, Object.entries(input.env).sort(([a], [b]) => a.localeCompare(b)), input.maxBuffer]);
      let reader = this.readers.get(key);
      if (!reader) { reader = new NativeBatchReader(input); this.readers.set(key, reader); }
      try { return await reader.read(input); }
      catch (error) {
        this.readers.delete(key);
        await reader.close(true);
        throw error;
      }
    });
    this.queue = pending.catch(() => undefined);
    return pending;
  }

  /** Drain queued exchanges and release readers while allowing later exchanges to reopen them. */
  reset(): Promise<void> {
    const pending = this.queue.then(() => this.closeReaders());
    this.queue = pending.catch(() => undefined);
    return pending;
  }

  /** End stdin and await every direct child, releasing pack handles before returning. */
  async close(): Promise<void> {
    this.closed = true;
    await this.reset();
  }

  private async closeReaders(): Promise<void> {
    const results = await Promise.allSettled([...this.readers.values()].map((reader) => reader.close()));
    this.readers.clear();
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
}

class NativeBatchReader {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly output: GitBatchOutput;
  private readonly invocation: GitInvocation;
  private readonly finished: Promise<GitProcessError | undefined>;
  private readonly failed: Promise<GitProcessError>;
  private fail!: (error: GitProcessError) => void;
  private stderr: Buffer[] = [];
  private stderrBytes = 0;
  private stopped = false;

  constructor(input: GitBatchReadInvocation) {
    this.invocation = { command: "git", args: input.args };
    assertGitNotCanceled(input.signal, this.invocation);
    this.failed = new Promise((resolve) => { this.fail = resolve; });
    input.onStart?.();
    this.child = spawn("git", input.args, { cwd: input.cwd, env: input.env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    this.output = new GitBatchOutput(this.child.stdout, input.maxBuffer, this.invocation);
    let spawnError: GitProcessError | undefined;
    this.child.on("error", (error) => { spawnError = normalizeGitRejection(error, this.invocation); this.fail(spawnError); });
    // A write meets a closed pipe once Git exits; its exit status and stderr, reported at close, explain the failure.
    this.child.stdin.on("error", (error) => {
      void this.finished.then((exit) => { if (exit === undefined) this.fail(normalizeGitRejection(error, this.invocation)); });
    });
    this.child.stderr.on("data", (bytes: Buffer) => {
      this.stderrBytes += bytes.length;
      if (this.stderrBytes > input.maxBuffer) {
        this.fail(new GitProcessError({ ...this.invocation, kind: "output-limit", isMaxBuffer: true }));
        this.child.kill("SIGKILL");
      } else this.stderr.push(bytes);
    });
    this.finished = new Promise((resolve) => this.child.on("close", (exitCode, signal) => {
      const error = spawnError ?? (exitCode === 0 ? undefined : new GitProcessError({ ...this.invocation,
        kind: "nonzero-exit", exitCode: exitCode ?? undefined, signal: signal ?? undefined,
        stderr: Buffer.concat(this.stderr).toString("utf8") }));
      resolve(error);
      if (error) this.fail(error);
    }));
  }

  async read(input: GitBatchReadInvocation): Promise<RawGitResult> {
    assertGitNotCanceled(input.signal, this.invocation);
    const cancellation = { requested: false };
    let finishCancellation!: (descendantsUnconfirmed: boolean) => void;
    const cancellationFinished = new Promise<boolean>((resolve) => { finishCancellation = resolve; });
    const canceledError = (descendantsUnconfirmed: boolean) => new GitProcessError({ ...this.invocation, kind: "canceled", isCanceled: true, descendantsUnconfirmed });
    const dispose = bindGitProcessCancellation(this.child, input.signal, () => { cancellation.requested = true; }, (unconfirmed) => {
      this.fail(canceledError(unconfirmed));
      finishCancellation(unconfirmed);
    });
    this.stderr = []; this.stderrBytes = 0;
    try {
      this.child.stdin.write(input.input);
      const stdout = await Promise.race([this.output.read(input.input), this.failed.then((error) => { throw error; })]);
      if (cancellation.requested) throw canceledError(await cancellationFinished);
      return { stdout, stderr: Buffer.concat(this.stderr) };
    } catch (error) {
      if (cancellation.requested) throw canceledError(await cancellationFinished);
      // EOF may race the close event carrying Git's actual exit status.
      if (this.child.stdout.readableEnded) throw await this.finished ?? normalizeGitRejection(error, this.invocation);
      throw normalizeGitRejection(error, this.invocation);
    } finally { await dispose(); }
  }

  async close(force = false): Promise<void> {
    if (!this.stopped) {
      this.stopped = true;
      if (force) { this.child.kill("SIGKILL"); this.child.stdout.destroy(); this.child.stderr.destroy(); }
      else {
        this.child.stdin.end();
        try { await this.output.finish(); }
        catch (error) {
          this.child.kill("SIGKILL"); this.child.stdout.destroy(); this.child.stderr.destroy();
          await this.finished;
          throw normalizeGitRejection(error, this.invocation);
        }
      }
    }
    const error = await this.finished;
    if (error && !force) throw error;
  }
}
