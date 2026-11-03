/** Caller-approved adversarial pass input and its durable recording result. */
import { z } from "zod";
import { SlugSchema } from "../../../lib/kernel/index.js";
import { RecordVersionSchema } from "../../../lib/store/identity.js";
import { RemedySchema } from "../../../lib/store/refusal.js";
import { ReviewAdversarialActivitySchema, ReviewAdversarialPassHeaderShape, validateReviewAdversarialPassHeader } from "../../../lib/store/kinds/review/adversarial-pass/schema.js";
import { ReviewCommandHeaderShape, reviewCommandEnvelopeVariant } from "./review-command-envelope-base.js";

export const ReviewAdversarialRecordRequestSchema = z.strictObject({
  ...ReviewAdversarialPassHeaderShape, workUnit: SlugSchema, activity: ReviewAdversarialActivitySchema,
}).superRefine(validateReviewAdversarialPassHeader);
export type ReviewAdversarialRecordRequest = z.infer<typeof ReviewAdversarialRecordRequestSchema>;
export const ReviewAdversarialRecordEnvelopeSchema = reviewCommandEnvelopeVariant(
  "review-adversarial-record", "recorded", "none", z.strictObject({
    key: z.strictObject({ activity: ReviewAdversarialActivitySchema, number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }),
    version: RecordVersionSchema,
  }),
);
export type ReviewAdversarialRecordEnvelope = z.infer<typeof ReviewAdversarialRecordEnvelopeSchema>;
export const ReviewAdversarialUnsupportedEnvelopeSchema = z.strictObject({
  ...ReviewCommandHeaderShape, mode: z.literal("review-adversarial-record"),
  error: z.strictObject({ code: z.literal("unsupported"), message: z.string().trim().min(1) }),
  remedy: RemedySchema,
});
