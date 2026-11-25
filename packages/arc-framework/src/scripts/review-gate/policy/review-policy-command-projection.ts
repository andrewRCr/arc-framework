/** Public retry inputs derived from authority-bound policy requests. */
import {
  ReviewPolicyBoundRequestSchema,
  ReviewPolicyCommandRequestSchema,
  type ReviewPolicyBoundRequest,
  type ReviewPolicyCommandRequest,
} from "./review-policy-driver.js";

/** Retain caller inputs while leaving native authority for the owning composition to resolve again. */
export function projectReviewPolicyCommandRequest(input: ReviewPolicyBoundRequest): ReviewPolicyCommandRequest {
  const { terminus, ...request } = ReviewPolicyBoundRequestSchema.parse(input);
  return ReviewPolicyCommandRequestSchema.parse({ ...request,
    ...(terminus?.schemaVersion === 1 ? { terminus } : {}) });
}
