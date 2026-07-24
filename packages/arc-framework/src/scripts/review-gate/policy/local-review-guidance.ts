/** Exact standard-review guidance delivered through the local carrier. */

import { canonicalDigest, canonicalize } from "../../../lib/kernel/index.js";
import {
  projectStandardReviewGuidance,
  renderStandardReviewReviewerInstructions,
  type StandardReviewGuidanceProjection,
  type StandardReviewProjectAugmentation,
} from "./standard-review-guidance.js";
import { STANDARD_REVIEW_BASELINE_CONTRACT } from "./standard-review.js";
import { ReviewGuidanceDigestPreimageSchema } from "./standard-review-schema.js";

export interface LocalReviewGuidance {
  projection: StandardReviewGuidanceProjection;
  guidanceDigest: string;
  reviewerInstructions: string;
}

/** Project and digest the exact standard-review guidance delivered to a local evaluator. */
export function projectLocalReviewGuidance(
  augmentation?: StandardReviewProjectAugmentation,
): LocalReviewGuidance {
  const projection = projectStandardReviewGuidance(augmentation);
  const guidanceDigest = canonicalDigest(ReviewGuidanceDigestPreimageSchema.parse({
    domain: "arc.review-guidance.digest/v2",
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    carrierId: "local-attestation",
    baseline: STANDARD_REVIEW_BASELINE_CONTRACT,
    projectAugmentation: [{
      path: "local-review-guidance.json",
      content: canonicalize(projection),
    }],
  }));
  return {
    projection,
    guidanceDigest,
    reviewerInstructions: renderStandardReviewReviewerInstructions(augmentation),
  };
}
