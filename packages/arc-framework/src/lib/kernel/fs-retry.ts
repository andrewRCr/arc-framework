/** Bounded retry for idempotent filesystem operations facing transient access refusals. */

import { setTimeout as sleepFor } from "node:timers/promises";

/**
 * Retry one safe-to-repeat filesystem operation after a short access refusal.
 *
 * Windows may refuse a rename-over while a reader holds the target, or a mkdir
 * while a removed directory is delete-pending. The capped backoff is below one
 * second in total and preserves the final filesystem error on exhaustion.
 *
 * @param operation - Atomic syscall or caller-guarded operation to retry
 * @param options - Injectable delay and jitter for deterministic tests
 * @returns The first successful result
 */
export async function retryTransientFileSystemRefusal<T>(
  operation: () => Promise<T>,
  options: {
    readonly sleep?: (ms: number) => Promise<void>;
    readonly random?: () => number;
  } = {},
): Promise<T> {
  const sleep = options.sleep ?? sleepFor;
  const random = options.random ?? Math.random;
  let backoffMs = 10;
  for (let retry = 0;; retry += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof Error && "code" in error
        && (error.code === "EPERM" || error.code === "EBUSY" || error.code === "EACCES"))
        || retry >= 8) {
        throw error;
      }
      await sleep(Math.round(backoffMs * (0.75 + random() * 0.5)));
      backoffMs = Math.min(backoffMs * 2, 160);
    }
  }
}
