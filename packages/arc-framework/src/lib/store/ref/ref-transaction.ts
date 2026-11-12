/** Ref-store transactions classify native lock failures after Git's expected-value observation. */

import { updateRefTransaction, type RefChange, type RefTransactionOptions, type RefTransactionOutcome } from "../../git/ref-transaction.js";
import { isCompletedGitFailure, isGitProcessError } from "../../git/process-error.js";
import type { RefBackendContext } from "./context.js";
import { findRefGitLock, RefGitLockError } from "./git-lock.js";

/** Run every state transaction through its bound ports and preserve cancellation and lost races. */
export async function updateStoreRefTransaction(context: RefBackendContext, changes: readonly RefChange[],
  options: RefTransactionOptions = {}): Promise<RefTransactionOutcome> {
  try { return await updateRefTransaction(context, changes, options); }
  catch (error) {
    // Failed read-back and version probes carry their own command; neither established unchanged expected refs.
    if (!isGitProcessError(error) || !isCompletedGitFailure(error) || !error.args.includes("update-ref")) throw error;
    const lock = await findRefGitLock(context, changes.map(({ ref }) => ref), changes.some(change => "delete" in change));
    if (lock) throw new RefGitLockError(lock.lock, lock.ageMs, error);
    throw error;
  }
}
