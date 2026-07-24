/** Lossless projection from routing policy into a topology-neutral obligation. */

import {
  ReviewRubricIdentitySchema,
  type ReviewRubricIdentity,
} from "./standard-review-schema.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "./standard-review.js";
import {
  StandardReviewObligationProjectionSchema,
  type StandardReviewObligationProjection,
} from "./standard-review-projection-schema.js";
import {
  ReviewRoutingDecisionSchema,
  type ReviewRoutingDecision,
} from "./routing-schema.js";

/** Project one logical standard-review obligation without rerunning routing policy. */
export function projectStandardReviewObligation(
  decisionInput: ReviewRoutingDecision,
  rubricInput: ReviewRubricIdentity = STANDARD_REVIEW_RUBRIC_IDENTITY,
): StandardReviewObligationProjection {
  const decision = ReviewRoutingDecisionSchema.parse(decisionInput);
  const rubric = ReviewRubricIdentitySchema.parse(rubricInput);
  return StandardReviewObligationProjectionSchema.parse({
    obligation: decision.standardReview,
    reasons: decision.reasons,
    rubricVersion: rubric.version,
    rubricDigest: rubric.digest,
    retrigger: decision.retrigger,
    count: 1,
  });
}
