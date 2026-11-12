/** Checkout-local serialization for tracked record digest checks and writes. */

import { join } from "node:path";
import { withAdvisoryLock, type AdvisoryLockOptions } from "../advisory-lock.js";
import { resolveCheckoutGitDir, type GitExec } from "../git/exec.js";

/** Tracked record writes share only this checkout's own lock file. */
export const TRACKED_WRITE_LOCK_FILENAME = ".arc-tracked-write.lock";

/** Dependencies resolved only when a tracked write enters its critical section. */
export interface TrackedWriteLockContext {
  readonly exec: GitExec;
  readonly checkoutRoot: string;
  readonly options?: AdvisoryLockOptions;
}

/** Resolve and hold the checkout's tracked-write lock around one operation.
 * @param context - Checkout root, Git executor and optional lock tuning.
 * @param operation - Digest check and write, or the complete batch, under the held lock.
 * @returns The operation result after releasing its lock.
 * @throws Git resolution, acquisition, operation and release errors without refusal translation.
 */
export async function withTrackedWriteLock<T>(
  context: TrackedWriteLockContext,
  operation: (lockPath: string) => Promise<T>,
): Promise<T> {
  const lockPath = join(await resolveCheckoutGitDir(context.exec, context.checkoutRoot), TRACKED_WRITE_LOCK_FILENAME);
  return withAdvisoryLock(lockPath, operation, context.options);
}
