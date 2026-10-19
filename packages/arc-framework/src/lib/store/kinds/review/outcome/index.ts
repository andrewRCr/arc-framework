/** Public immutable review outcome schema, codec, and stable storage identity. */
export { ReviewOutcomeSchema, type ReviewOutcome } from "./schema.js";
export { parseReviewOutcome, decodeReviewOutcome } from "./parser.js";
export { reviewOutcomeKey } from "./key.js";
export { checkReviewOutcome } from "./check.js";
export { REVIEW_OUTCOME_REGISTRATION } from "./registration.js";
export { reviewOutcomeResultDigest, reviewOutcomeDispositionContext } from "./result.js";
export { reviewOutcomeIsSettled, type ReviewOutcomeEvidence } from "./settlement.js";
export { deriveReviewOutcomePassCounts, reviewOutcomeIsOutdated, type ReviewOutcomeHistory,
  type ReviewOutcomePassCounts } from "./counts.js";
