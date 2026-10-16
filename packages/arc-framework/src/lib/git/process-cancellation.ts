/** Cancellation of Git processes and their descendants without changing spawn policy. */

import { execFile, type ChildProcess } from "node:child_process";

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

function runCancellationUtility(command: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve) => {
    const child = execFile(command, args, { timeout }, (error, stdout) => {
      resolve(error ? "" : stdout);
    });
    child.stdin?.end();
  });
}

async function endDescendants(pid: number, active: () => boolean): Promise<void> {
  if (process.platform === "win32") {
    await runCancellationUtility("taskkill", ["/PID", String(pid), "/T", "/F"], 500);
    return;
  }
  const snapshot = await runCancellationUtility("ps", ["-A", "-o", "pid=,ppid="], 250);
  if (!active()) return;
  const rows = snapshot.trim().split("\n").map((line) => line.trim().split(/\s+/u).map(Number));
  const descendants = [pid];
  for (let index = 0; index < descendants.length; index += 1) {
    for (const [child, parent] of rows) {
      if (parent === descendants[index] && child !== undefined && child > 0) descendants.push(child);
    }
  }
  for (const child of descendants.slice(1).reverse()) kill(child);
}

/** Bind abort to descendant-first termination; dispose when the process settles. */
export function bindGitProcessCancellation(
  child: Pick<ChildProcess, "pid" | "kill">,
  signal: AbortSignal | undefined,
  markCanceled: () => void,
  finishCancellation: () => void = () => undefined,
): () => void {
  let active = true;
  const abort = (): void => {
    markCanceled();
    void (async () => {
      if (child.pid !== undefined) await endDescendants(child.pid, () => active);
      if (!active) return;
      finishCancellation();
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
  start: (signal: AbortSignal | undefined) => Pick<ChildProcess, "pid" | "kill"> & PromiseLike<T>,
  signal: AbortSignal | undefined,
  invocation: GitInvocation,
): Promise<T> {
  assertGitNotCanceled(signal, invocation);
  const controller = new AbortController();
  const child = start(signal === undefined ? undefined : controller.signal);
  const cancellation = { requested: false };
  const dispose = bindGitProcessCancellation(
    child, signal, () => { cancellation.requested = true; }, () => { controller.abort(); },
  );
  try {
    const result = await child;
    if (cancellation.requested) throw new GitProcessError({ ...invocation, kind: "canceled", isCanceled: true });
    return result;
  } catch (error) {
    if (!cancellation.requested) throw error;
    const failure = normalizeGitRejection(error, invocation);
    throw new GitProcessError({
      ...invocation, kind: "canceled", isCanceled: true, exitCode: failure.exitCode, signal: failure.signal,
      stdout: failure.stdout, stderr: failure.stderr, cause: error,
    });
  } finally {
    dispose();
  }
}
