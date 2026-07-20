/** Constructors for forward review-gate records and their exact semantic IDs. */

import { canonicalDigest } from "../../../lib/kernel/index.js";

import {
  ReviewRequestIdPreimageSchema,
  ReviewRequestInputSchema,
  ReviewRequestV2Schema,
  ReviewTargetIdPreimageSchema,
  ReviewTargetInputSchema,
  ReviewTargetSchema,
  type ReviewRequestInput,
  type ReviewRequestV2,
  type ReviewTarget,
  type ReviewTargetInput,
} from "./gate-contract-v2-schema.js";

function targetPreimage(target: ReviewTargetInput) {
  return ReviewTargetIdPreimageSchema.parse({
    domain: "arc.review-gate.target-id/v2",
    ...target,
  });
}

function requestPreimage(request: ReviewRequestInput) {
  return ReviewRequestIdPreimageSchema.parse({
    domain: "arc.review-gate.request-id/v2",
    ...request,
  });
}

function assertRequestBinding(target: ReviewTarget, request: ReviewRequestInput): void {
  if (request.repositoryId !== target.repositoryId) {
    throw new Error("review request repository does not match its target");
  }
  if (request.targetId !== target.targetId) {
    throw new Error("review request target identity does not match its target");
  }
}

/** Derive a review target only from its registered domain-separated preimage. */
export function createReviewTarget(input: ReviewTargetInput): ReviewTarget {
  const target = ReviewTargetInputSchema.parse(input);
  return validateReviewTarget({
    ...target,
    targetId: canonicalDigest(targetPreimage(target)),
  });
}

/** Validate target structure and recompute its exact semantic identity. */
export function validateReviewTarget(input: unknown): ReviewTarget {
  const target = ReviewTargetSchema.parse(input);
  const { targetId, ...fields } = target;
  if (canonicalDigest(targetPreimage(fields)) !== targetId) {
    throw new Error("review target ID does not match its preimage");
  }
  return target;
}

/** Derive one actor-separated request bound to one exact target and carrier. */
export function createReviewRequest(
  targetInput: ReviewTarget,
  input: ReviewRequestInput,
): ReviewRequestV2 {
  const target = ReviewTargetSchema.parse(targetInput);
  const request = ReviewRequestInputSchema.parse(input);
  assertRequestBinding(target, request);
  return validateReviewRequest(target, {
    ...request,
    requestId: canonicalDigest(requestPreimage(request)),
  });
}

/** Validate request structure, target binding, and exact semantic identity. */
export function validateReviewRequest(targetInput: unknown, input: unknown): ReviewRequestV2 {
  const target = validateReviewTarget(targetInput);
  const request = ReviewRequestV2Schema.parse(input);
  const { requestId, ...fields } = request;
  assertRequestBinding(target, fields);
  if (canonicalDigest(requestPreimage(fields)) !== requestId) {
    throw new Error("review request ID does not match its preimage");
  }
  return request;
}
