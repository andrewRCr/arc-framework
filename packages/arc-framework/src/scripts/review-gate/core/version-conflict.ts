/** Shared recognition and retry bound for optimistic review-record publication. */

import { isOffBranchStoreRefusal } from "../../../lib/store/refusal-error.js";

export const REVIEW_VERSION_RETRY_ATTEMPTS = 8;

/** Recognize the storage-port conflict contract, an off-branch store's version-conflict refusal among it. */
export function isReviewVersionConflict(error: unknown): boolean {
  if (isOffBranchStoreRefusal(error)) return error.refusal.code === "version-conflict";
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? error.code : undefined;
  return code === "version-conflict" || error.message === "version-conflict";
}
