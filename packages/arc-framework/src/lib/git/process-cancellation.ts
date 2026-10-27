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

function kill(pid: number): boolean {
  try { process.kill(pid, "SIGKILL"); return true; }
  catch (error) { return typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH"; }
}

function runUtilityOnce(command: string, args: string[], timeout: number): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false, child: ChildProcess | undefined;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(value);
    };
    const deadline = setTimeout(() => { finish(null); disposeUtility(child); }, timeout);
    try {
      child = execFile(command, args, { timeout }, (error, stdout) => { finish(error ? null : stdout); });
      child.stdin?.end();
    } catch { finish(null); disposeUtility(child); }
  });
}

function disposeUtility(child: ChildProcess | undefined): void {
  try { child?.kill("SIGKILL"); } catch { /* The attempt remains unconfirmed when its utility cannot be ended. */ }
  child?.stdin?.destroy();
  child?.stdout?.destroy();
  child?.stderr?.destroy();
  child?.unref();
}

/** Run a process utility, retrying once so a transient spawn or timeout failure does not leave the tree unconfirmed. */
async function runCancellationUtility(command: string, args: string[], timeout: number, active: () => boolean): Promise<string | null> {
  if (!active()) return null;
  const result = await runUtilityOnce(command, args, timeout);
  return result ?? (active() ? await runUtilityOnce(command, args, timeout) : null);
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

async function snapshotProcesses(active: () => boolean): Promise<number[][] | null> {
  const snapshot = await runCancellationUtility("ps", ["-A", "-o", "pid=,ppid="], 250, active);
  if (!active()) return null;
  if (snapshot === null) return process.platform === "linux" ? readProcessTable() : null;
  return snapshot.trim().split("\n").map((line) => line.trim().split(/\s+/u).map(Number));
}

/** End the process's descendants, returning whether the platform's utility confirmed the tree. */
async function endDescendants(pid: number, active: () => boolean): Promise<boolean> {
  if (process.platform === "win32") return await runCancellationUtility("taskkill", ["/PID", String(pid), "/T", "/F"], 500, active) !== null;
  const rows = await snapshotProcesses(active);
  if (!rows || !active() || !rows.some(([process]) => process === pid)) return false;
  const descendants = [pid];
  for (let index = 0; index < descendants.length; index += 1) {
    for (const [child, parent] of rows) {
      if (parent === descendants[index] && child !== undefined && child > 0) descendants.push(child);
    }
  }
  let confirmed = true;
  for (const child of descendants.slice(1).reverse()) {
    if (!active()) return false;
    if (!kill(child)) confirmed = false;
  }
  return confirmed;
}

/** Bind abort to descendant-first termination; await disposal to finish any accepted cancellation. */
export function bindGitProcessCancellation(
  child: Pick<ChildProcess, "pid" | "kill">,
  signal: AbortSignal | undefined,
  markCanceled: () => void,
  finishCancellation: (descendantsUnconfirmed: boolean) => void = () => undefined,
): () => Promise<void> {
  let active = true;
  const isActive = (): boolean => active;
  let completion: Promise<void> | undefined;
  const abort = (): void => {
    if (!active || completion) return;
    markCanceled();
    completion = (async () => {
      const confirmed = child.pid === undefined || await endDescendants(child.pid, () => active).catch(() => false);
      if (!isActive()) return;
      finishCancellation(!confirmed);
      if (isActive()) child.kill("SIGKILL");
    })();
  };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  return async () => {
    if (completion) await completion;
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
    await dispose();
    if (cancellation.requested) {
      const output = normalizeGitRejection(result, invocation);
      throw new GitProcessError({ ...invocation, kind: "canceled", isCanceled: true,
        stdout: output.stdout, stderr: output.stderr, descendantsUnconfirmed: cancellation.descendantsUnconfirmed });
    }
    return result;
  } catch (error) {
    await dispose();
    if (!cancellation.requested) throw error;
    const failure = normalizeGitRejection(error, invocation);
    throw new GitProcessError({
      ...invocation, kind: "canceled", isCanceled: true, exitCode: failure.exitCode, signal: failure.signal,
      stdout: failure.stdout, stderr: failure.stderr, descendantsUnconfirmed: cancellation.descendantsUnconfirmed, cause: error,
    });
  } finally {
    await dispose();
  }
}
