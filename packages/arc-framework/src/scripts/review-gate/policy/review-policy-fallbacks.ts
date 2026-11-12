/** Compatible caller selections and fallback history for corrected terminal review requests. */

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

/** Retain a forced source only when it remains compatible with corrected source progress. */
export function reconcileReviewSourceInvocation(input: {
  invocation: ReviewPolicyCommandRequest["invocation"];
  sources: readonly string[];
  attempts: readonly Pick<ReviewAttempt, "sourceId">[];
}): ReviewPolicyCommandRequest["invocation"] {
  const { invocation, sources, attempts } = input;
  if (invocation?.mode !== "force") return invocation;
  const selectedSourceIndex = sources.indexOf(invocation.sourceId);
  const terminalSourceIndex = sources.indexOf(attempts.at(-1)?.sourceId ?? "");
  if (selectedSourceIndex < 0 || (selectedSourceIndex < terminalSourceIndex
    && !attempts.some(attempt => attempt.sourceId === invocation.sourceId))) return undefined;
  return invocation;
}
