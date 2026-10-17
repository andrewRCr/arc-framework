/** Full-jitter retry waits measured against the operation's remaining deadline. */

import type { RefBackendContext } from "./context.js";

/** Wait without retaining publication locks and report only time before expiration. */
export async function waitForPushRetry(context: RefBackendContext, retryCount: number, lastPushMs: number): Promise<number> {
  const deadline = context.syncDeadline;
  const started = context.clock().getTime();
  if (deadline?.signal.aborted || started >= (deadline?.end ?? Infinity)) return 0;
  const limit = lastPushMs === 0 ? 0 : Math.min(10_000, lastPushMs * 2 ** retryCount);
  const wait = context.random() * limit;
  const signal = deadline?.signal ?? new AbortController().signal;
  try { await context.sleep.wait(wait, signal); }
  catch (error) { if (!signal.aborted) throw error; }
  return Math.max(0, Math.min(context.clock().getTime(), deadline?.end ?? Infinity) - started);
}
