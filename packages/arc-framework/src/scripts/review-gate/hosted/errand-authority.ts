/** Strict active-Errand authority for hosted review progress. */

import type { DerivedLocusFrame } from "../../../lib/locus/derived-reader.js";

export interface ActiveHostedReviewErrand {
  readonly key: string;
  readonly claimId: string;
  readonly branch: string;
}

/**
 * Project the exact ordinary Errand occupying the current attached branch.
 *
 * @param frame - Authority-derived current-checkout frame.
 * @param branch - Current attached Git branch.
 * @returns The exact active Errand identity needed to bind hosted progress.
 */
export function resolveActiveHostedReviewErrand(
  frame: DerivedLocusFrame,
  branch: string,
): ActiveHostedReviewErrand {
  const row = frame.entering.kind === "selected" ? frame.entering.row : null;
  if (row === null
    || row.kind !== "transient"
    || row.subject.kind !== "errand"
    || row.diagnostics.length > 0
    || row.checkout.detached
    || row.checkout.branch !== branch) {
    throw new Error("Hosted Errand review progress requires the exact active ordinary Errand.");
  }
  const identity = row.identity;
  if (identity === null
    || identity.kind !== "errand"
    || identity.purpose !== "errand"
    || identity.state !== "open"
    || row.subject.key !== identity.key
    || row.subject.claimId !== identity.claimId
    || identity.branch !== branch) {
    throw new Error("Hosted Errand review progress requires the exact active ordinary Errand.");
  }
  return { key: identity.key, claimId: identity.claimId, branch: identity.branch };
}
