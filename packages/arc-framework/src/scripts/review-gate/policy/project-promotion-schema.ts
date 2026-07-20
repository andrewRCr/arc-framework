/** Zod authority for project-owned promote-only review-routing effects. */

import { z } from "zod";

import { ProjectRoutingReasonSchema } from "./routing-schema.js";

const PolicyIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

export const ProjectRoutingPromotionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  policyId: PolicyIdSchema,
  authorSelfReview: z.enum(["recommended", "required"]).optional(),
  frontlineAction: z.enum(["offer", "attempt"]).optional(),
  independentAnalysis: z.enum(["recommended", "required"]).optional(),
  retrigger: z.enum(["incremental", "full-final"]).optional(),
  reasons: z.array(ProjectRoutingReasonSchema).min(1),
}).refine((promotion) => (
  promotion.authorSelfReview !== undefined
  || promotion.frontlineAction !== undefined
  || promotion.independentAnalysis !== undefined
  || promotion.retrigger !== undefined
), {
  message: "a project promotion must promote at least one routing result",
}).refine((promotion) => promotion.reasons.every((reason) => reason.startsWith(`project:${promotion.policyId}:`)), {
  message: "project reasons must use the declaring policy namespace",
});
export type ProjectRoutingPromotion = z.infer<typeof ProjectRoutingPromotionSchema>;
