/** One cancellable operation bound shared by a sync loop and its nested pulls. */

import type { RefBackendContext } from "./context.js";
import { DEFAULT_MAX_WAIT_MS } from "../../advisory-lock.js";

/** Bound Git calls and lock waits without restarting the timer for a nested pull. */
export async function withRefSyncDeadline<T>(context: RefBackendContext, operation: (scoped: RefBackendContext) => Promise<T>): Promise<T> {
  if (context.syncDeadline) return operation(context);
  const timer = new AbortController(), deadline = new AbortController();
  const end = context.clock().getTime() + 120_000;
  const bound = context.sleep.bound(120_000, timer.signal).then(() => { if (!timer.signal.aborted) deadline.abort(); });
  try { return await operation(bindDeadline(context, { signal: deadline.signal, end })); }
  finally { timer.abort(); await bound; }
}

/** Detect expiration between attempts as well as inside an executor call. */
export function refSyncDeadlineExpired(context: RefBackendContext): boolean {
  return context.syncDeadline !== undefined
    && (context.syncDeadline.signal.aborted || context.clock().getTime() >= context.syncDeadline.end);
}

function bindDeadline(context: RefBackendContext, deadline: NonNullable<RefBackendContext["syncDeadline"]>): RefBackendContext {
  const repository = context.repository ? { ...context.repository, source: bindDeadline(context.repository.source, deadline) } : undefined;
  return { ...context, repository, syncDeadline: deadline,
    lock: (ref, waitMs) => context.lock(ref, Math.min(waitMs ?? DEFAULT_MAX_WAIT_MS,
      Math.max(0, deadline.end - context.clock().getTime()))),
    exec: (command, args, options) => context.exec(command, args, { ...options, signal: combinedSignal(deadline.signal, options?.signal) }),
    execInput: (args, input, options) => context.execInput(args, input, { ...options, signal: combinedSignal(deadline.signal, options?.signal) }),
    rawExec: (args, options) => context.rawExec(args, { ...options, signal: combinedSignal(deadline.signal, options?.signal) }),
  };
}

function combinedSignal(deadline: AbortSignal, supplied: AbortSignal | undefined): AbortSignal {
  return supplied && supplied !== deadline ? AbortSignal.any([deadline, supplied]) : deadline;
}
