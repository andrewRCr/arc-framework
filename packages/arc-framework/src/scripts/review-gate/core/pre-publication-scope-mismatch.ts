/** The exact producer scope a caller must affirm before pre-publication can resume. */

import { z } from "zod";

import { ReviewTargetSchema } from "./gate-contract-v2-schema.js";
import { ReviewScopeModeSchema } from "./review-primitives.js";

export const PrePublicationScopeMismatchSchema = z.strictObject({
  lane: z.enum(["frontline", "standard"]),
  observedScope: ReviewScopeModeSchema,
  selectedScope: ReviewScopeModeSchema,
  target: ReviewTargetSchema,
  requiredLaneJudgment: z.strictObject({ scopeMode: ReviewScopeModeSchema }),
});
