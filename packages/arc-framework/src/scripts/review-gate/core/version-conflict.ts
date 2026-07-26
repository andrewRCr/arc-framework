/** Shared recognition and retry bound for optimistic review-record publication. */

export const REVIEW_VERSION_RETRY_ATTEMPTS = 8;

/** Recognize the storage-port conflict contract without depending on one adapter's error class. */
export function isReviewVersionConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? error.code : undefined;
  return code === "version-conflict" || error.message === "version-conflict";
}
