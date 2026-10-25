/** Cancellation of Git processes and their descendants without changing spawn policy. */

import { execFile, type ChildProcess } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";

import { GitProcessError, normalizeGitRejection, type GitInvocation } from "./process-error.js";

/** Refuse an already canceled invocation before it can start a process. */
export function assertGitNotCanceled(signal: AbortSignal | undefined, invocation: GitInvocation): void {
  if (signal?.aborted) {
    throw new GitProcessError({ ...invocation, kind: "canceled", isCanceled: true, cause: signal.reason });
  }
}

function kill(pid: number): void {
  try { process.kill(pid, "SIGKILL"); } catch { /* A process may have exited since the snapshot. */ }
}

function runUtilityOnce(command: string, args: string[], timeout: number): Promise<string | null> {
  return new Promise((resolve) => {
    const child = execFile(command, args, { timeout }, (error, stdout) => {
      resolve(error ? null : stdout);
    });
    child.stdin?.end();
  });
}

/** Run a process utility, retrying once so a transient spawn or timeout failure does not leave the tree unconfirmed. */
async function runCancellationUtility(command: string, args: string[], timeout: number): Promise<string | null> {
  return await runUtilityOnce(command, args, timeout) ?? await runUtilityOnce(command, args, timeout);
}

/** Linux's own process table, read when `ps` is absent or fails; null when it cannot be read either. */
async function readProcessTable(): Promise<number[][] | null> {
  const entries = await readdir("/proc").catch(() => null);
  if (!entries) return null;
  const rows = await Promise.all(entries.filter((entry) => /^\d+$/u.test(entry)).map(async (entry) => {
    const stat = await readFile(`/proc/${entry}/stat`, "utf8").catch(() => null);
    // The command name may hold spaces and parentheses; the state and parent follow its last closing parenthesis.
    const parent = stat?.slice(stat.lastIndexOf(")") + 2).split(" ")[1];
    return parent === undefined ? [] : [[Number(entry), Number(parent)]];
  }));
  return rows.flat();
}

async function snapshotProcesses(): Promise<number[][] | null> {
  const snapshot = await runCancellationUtility("ps", ["-A", "-o", "pid=,ppid="], 250);
  if (snapshot === null) return process.platform === "linux" ? readProcessTable() : null;
  return snapshot.trim().split("\n").map((line) => line.trim().split(/\s+/u).map(Number));
}

/** End the process's descendants, returning whether the platform's utility confirmed the tree. */
async function endDescendants(pid: number, active: () => boolean): Promise<boolean> {
  if (process.platform === "win32") return await runCancellationUtility("taskkill", ["/PID", String(pid), "/T", "/F"], 500) !== null;
  const rows = await snapshotProcesses();
  if (!rows || !active()) return rows !== null;
  const descendants = [pid];
  for (let index = 0; index < descendants.length; index += 1) {
    for (const [child, parent] of rows) {
      if (parent === descendants[index] && child !== undefined && child > 0) descendants.push(child);
    }
  }
  for (const child of descendants.slice(1).reverse()) kill(child);
  return true;
}

/** Bind abort to descendant-first termination, reporting an unconfirmed tree; dispose when the process settles. */
export function bindGitProcessCancellation(
  child: Pick<ChildProcess, "pid" | "kill">,
  signal: AbortSignal | undefined,
  markCanceled: () => void,
  finishCancellation: (descendantsUnconfirmed: boolean) => void = () => undefined,
): () => void {
  let active = true;
  const abort = (): void => {
    markCanceled();
    void (async () => {
      const confirmed = child.pid === undefined || await endDescendants(child.pid, () => active);
      if (!active) return;
      finishCancellation(!confirmed);
      child.kill("SIGKILL");
    })();
  };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  return () => {
    active = false;
    signal?.removeEventListener("abort", abort);
  };
}

/** Await an execa process, delaying its direct-child abort until descendants have been ended. */
export async function runCancelableGitProcess<T>(
  start: (signal: AbortSignal | undefined) => Pick<ChildProcess, "pid" | "kill">
    & Partial<Pick<ChildProcess, "stdout" | "stderr">> & PromiseLike<T>,
  signal: AbortSignal | undefined,
  invocation: GitInvocation,
): Promise<T> {
  assertGitNotCanceled(signal, invocation);
  const controller = new AbortController();
  const child = start(signal === undefined ? undefined : controller.signal);
  const cancellation = { requested: false, descendantsUnconfirmed: false };
  const dispose = bindGitProcessCancellation(child, signal, () => { cancellation.requested = true; }, (unconfirmed) => {
    cancellation.descendantsUnconfirmed = unconfirmed;
    controller.abort();
    // A surviving process may still hold inherited pipes after the direct child has exited or been killed.
    child.stdout?.destroy();
    child.stderr?.destroy();
  });
  try {
    const result = await child;
    if (cancellation.requested) {
      throw new GitProcessError({ ...invocation, kind: "canceled", isCanceled: true, descendantsUnconfirmed: cancellation.descendantsUnconfirmed });
    }
    return result;
  } catch (error) {
    if (!cancellation.requested) throw error;
    const failure = normalizeGitRejection(error, invocation);
    throw new GitProcessError({
      ...invocation, kind: "canceled", isCanceled: true, exitCode: failure.exitCode, signal: failure.signal,
      stdout: failure.stdout, stderr: failure.stderr, descendantsUnconfirmed: cancellation.descendantsUnconfirmed, cause: error,
    });
  } finally {
    dispose();
  }
}
