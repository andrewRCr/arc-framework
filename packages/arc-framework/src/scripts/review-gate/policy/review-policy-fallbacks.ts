/** Compatible caller fallback history for a corrected terminal review request. */

import type { ReviewScopeMode } from "../core/review-primitives.js";
import type { ReviewAttempt } from "./review-policy-attempt.js";
import { isSafeUnavailable, sourceDiagnostic, type ReviewPolicyCommandRequest } from "./review-policy-driver.js";

/** Retain compatible fallback history in configured order before one corrected terminal source. */
export function reconcileReviewFallbackAttempts(input: {
  attempts: readonly ReviewAttempt[];
  sources: readonly string[];
  terminalSourceId: string;
  lane: ReviewPolicyCommandRequest["lane"];
  scope: ReviewScopeMode;
  pullRequest: number | null;
}): readonly ReviewAttempt[] {
  let previousSourceIndex = -1;
  const terminalSourceIndex = input.sources.indexOf(input.terminalSourceId);
  return input.attempts.filter(attempt => {
    const sourceIndex = input.sources.indexOf(attempt.sourceId);
    const diagnostic = sourceDiagnostic(attempt.sourceId, input.lane, input.scope, input.pullRequest);
    const historicalScopeAttempt = diagnostic?.code === "source-scope-ineligible"
      && attempt.outcome !== "clean" && attempt.outcome !== "findings";
    if (sourceIndex <= previousSourceIndex || sourceIndex >= terminalSourceIndex
      || (!historicalScopeAttempt && (diagnostic !== null || !isSafeUnavailable(attempt.outcome)))) return false;
    previousSourceIndex = sourceIndex;
    return true;
  });
}
