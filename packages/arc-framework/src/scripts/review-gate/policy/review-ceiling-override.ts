/** Owner approval for one review pass beyond a lane's exhausted pass ceiling. */

import { z } from "zod";

import { ReviewCanonicalDigestSchema } from "../core/gate-contract-v2-schema.js";
import { CompletedReviewPassCountSchema, ReviewPassSchema } from "../core/review-pass.js";
import { ReviewPolicyTargetSchema } from "./review-additional-pass.js";

const CeilingJudgmentShape = {
  exhaustedPassCount: CompletedReviewPassCountSchema,
  nextPass: ReviewPassSchema,
  conditionalPassAuthorizationId: ReviewCanonicalDigestSchema.optional(),
  decisionKey: ReviewCanonicalDigestSchema.optional(),
};

function validateCeilingReference(value: { decisionKey?: string; conditionalPassAuthorizationId?: string }, context: z.RefinementCtx): void {
  if (value.decisionKey !== undefined && value.conditionalPassAuthorizationId !== undefined) {
    context.addIssue({ code: "custom", message: "Use decisionKey for an ordinary grant or conditionalPassAuthorizationId for an approved-fix grant, not both." });
  }
}

/** Caller-owned ceiling judgment, with target coordinates supplied by its composition. */
export const ReviewCeilingJudgmentSchema = z.strictObject(CeilingJudgmentShape).superRefine(validateCeilingReference).readonly();

/** One approved pass past an exhausted ceiling, bound to the exact target, lane, and pass it admits. */
export const ReviewCeilingOverrideSchema = z.strictObject({
  target: ReviewPolicyTargetSchema,
  lane: z.enum(["frontline", "standard"]),
  ...CeilingJudgmentShape,
}).superRefine(validateCeilingReference).readonly();
export type ReviewCeilingOverride = z.infer<typeof ReviewCeilingOverrideSchema>;
