/** Public outcomes for cancelling a local review dispatch without evaluator evidence. */

import { z } from "zod";
import { ReviewIdentifierSchema } from "./gate-contract-v2-schema.js";
import { reviewCommandEnvelopeVariant } from "./review-command-envelope-base.js";
import { NativeReviewOperationRefSchema } from "./review-operation-reference.js";

const LocalCancelPayloadSchema = z.strictObject({
  operationId: ReviewIdentifierSchema,
  operationRef: NativeReviewOperationRefSchema.optional(),
  persistedVersion: z.number().int().nonnegative(),
});

export const LocalCancelEnvelopeSchema = z.union([
  reviewCommandEnvelopeVariant("review-local-cancel", "cancelled", "rerun-review", LocalCancelPayloadSchema),
  reviewCommandEnvelopeVariant("review-local-cancel", "terminal-operation", "resume-review", LocalCancelPayloadSchema),
]);
