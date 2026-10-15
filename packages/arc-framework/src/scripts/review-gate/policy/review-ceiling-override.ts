/** Owner approval for one review pass beyond a lane's exhausted pass ceiling. */

import { z } from "zod";

import { ReviewCanonicalDigestSchema } from "../core/gate-contract-v2-schema.js";
import { CompletedReviewPassCountSchema, ReviewPassSchema } from "../core/review-pass.js";
import { ReviewPolicyTargetSchema } from "./review-additional-pass.js";

/** One approved pass past an exhausted ceiling, bound to the exact target, lane, and pass it admits. */
export const ReviewCeilingOverrideSchema = z.strictObject({
  target: ReviewPolicyTargetSchema,
  lane: z.enum(["frontline", "standard"]),
  exhaustedPassCount: CompletedReviewPassCountSchema,
  nextPass: ReviewPassSchema,
  conditionalPassAuthorizationId: ReviewCanonicalDigestSchema.optional(),
}).readonly();
export type ReviewCeilingOverride = z.infer<typeof ReviewCeilingOverrideSchema>;
