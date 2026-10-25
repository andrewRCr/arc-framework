/** One cancellable operation bound shared by a sync loop and its nested pulls. */

import type { RefBackendContext } from "./context.js";
import type { Remedy } from "../refusal.js";
import { AdvisoryLockTimeoutError, DEFAULT_MAX_WAIT_MS } from "../../advisory-lock.js";

/** How long one sync loop, with every pull nested in it, may run. */
export const REF_SYNC_DEADLINE_MS = 120_000;

/** A lock wait the sync deadline cut short: the deadline expired, which says nothing about whether the lock was held. */
export class RefSyncDeadlineError extends Error {
  constructor(readonly lockPath: string, options?: ErrorOptions) {
    super(`The sync deadline expired while waiting for ${lockPath}.`, options);
    this.name = "RefSyncDeadlineError";
  }
}

/** The way past a deadline spent before a lock was taken: the store was busy, not unreachable. */
export function refSyncDeadlineRemedy(operation: "pull" | "push"): Remedy {
  return { text: `Retry the ${operation} once other store operations on this machine settle; it starts a fresh deadline.` };
}

/** Bound Git calls and lock waits without restarting the timer for a nested pull. */
export async function withRefSyncDeadline<T>(context: RefBackendContext, name: "pull" | "push", operation: (scoped: RefBackendContext) => Promise<T>): Promise<T> {
  if (context.syncDeadline) return operation(context);
  const timer = new AbortController(), deadline = new AbortController();
  const end = context.clock().getTime() + REF_SYNC_DEADLINE_MS;
  const bound = context.sleep.bound(REF_SYNC_DEADLINE_MS, timer.signal).then(() => { if (!timer.signal.aborted) deadline.abort(); });
  try { return await operation(bindDeadline(context, { signal: deadline.signal, end, cleanup: context, operation: name })); }
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
    lock: async (ref, waitMs) => {
      const requested = waitMs ?? DEFAULT_MAX_WAIT_MS, remaining = Math.max(0, deadline.end - context.clock().getTime());
      try { return await context.lock(ref, Math.min(requested, remaining)); }
      catch (error) {
        if (remaining < requested && error instanceof AdvisoryLockTimeoutError && error.phase === "acquire") {
          throw new RefSyncDeadlineError(error.lockPath, { cause: error });
        }
        throw error;
      }
    },
    exec: (command, args, options) => context.exec(command, args, { ...options, signal: combinedSignal(deadline.signal, options?.signal) }),
    execInput: (args, input, options) => context.execInput(args, input, { ...options, signal: combinedSignal(deadline.signal, options?.signal) }),
    rawExec: (args, options) => context.rawExec(args, { ...options, signal: combinedSignal(deadline.signal, options?.signal) }),
  };
}

function combinedSignal(deadline: AbortSignal, supplied: AbortSignal | undefined): AbortSignal {
  return supplied && supplied !== deadline ? AbortSignal.any([deadline, supplied]) : deadline;
}
