/** Lossless projection from routing policy into a topology-neutral obligation. */

import {
  ReviewRubricIdentitySchema,
  type ReviewRubricIdentity,
} from "./independent-analysis-schema.js";
import {
  IndependentAnalysisObligationProjectionSchema,
  type IndependentAnalysisObligationProjection,
} from "./independent-analysis-projection-schema.js";
import {
  ReviewRoutingDecisionSchema,
  type ReviewRoutingDecision,
} from "./routing-schema.js";

/** Project one logical independent-analysis obligation without rerunning routing policy. */
export function projectIndependentAnalysisObligation(
  decisionInput: ReviewRoutingDecision,
  rubricInput: ReviewRubricIdentity,
): IndependentAnalysisObligationProjection {
  const decision = ReviewRoutingDecisionSchema.parse(decisionInput);
  const rubric = ReviewRubricIdentitySchema.parse(rubricInput);
  return IndependentAnalysisObligationProjectionSchema.parse({
    obligation: decision.independentAnalysis,
    reasons: decision.reasons,
    rubricVersion: rubric.version,
    rubricDigest: rubric.digest,
    retrigger: decision.retrigger,
    count: 1,
  });
}
