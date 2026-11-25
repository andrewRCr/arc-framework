/** Join original producer identities to portable outcome keys without rewriting approvals. */
import type { DispositionSet } from "../../../../scripts/review-gate/core/disposition-records.js";
import type { ReviewEvidence } from "./evidence/schema.js";
import type { ReviewOutcome } from "./outcome/schema.js";
import { reviewOutcomeKey } from "./outcome/key.js";

/** The evidence binding changes address while the approved set retains its original identity. */
export interface MappedDispositionResult {
  result: ReviewEvidence["result"];
  dispositionSet: DispositionSet;
}

/** Bind source producer IDs once for all imported disposition sets. */
export function createReviewMappingResultResolver(
  outcomes: readonly ReviewOutcome[],
): (set: DispositionSet) => MappedDispositionResult | null {
  const keys = new Map(outcomes.map((outcome) => [outcome.attemptId, reviewOutcomeKey(outcome)]));
  return (dispositionSet) => {
    const outcomeKey = keys.get(dispositionSet.producerId);
    return outcomeKey === undefined ? null
      : { result: { outcomeKey, resultDigest: dispositionSet.resultDigest }, dispositionSet };
  };
}
