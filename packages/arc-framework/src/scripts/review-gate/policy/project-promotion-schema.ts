/** Zod authority for project-owned promote-only review-routing effects. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";

import { ProjectRoutingReasonSchema } from "./routing-schema.js";

const PolicyIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

export const ProjectRoutingPromotionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  policyId: PolicyIdSchema,
  authorSelfReview: z.enum(["recommended", "required"]).optional(),
  frontlineAction: z.enum(["offer", "attempt"]).optional(),
  standardReview: z.enum(["recommended", "required"]).optional(),
  retrigger: z.enum(["incremental", "full-final"]).optional(),
  reasons: z.array(ProjectRoutingReasonSchema).min(1),
}).refine((promotion) => (
  promotion.authorSelfReview !== undefined
  || promotion.frontlineAction !== undefined
  || promotion.standardReview !== undefined
  || promotion.retrigger !== undefined
), {
  message: "a project promotion must promote at least one routing result",
}).refine((promotion) => promotion.reasons.every((reason) => reason.startsWith(`project:${promotion.policyId}:`)), {
  message: "project reasons must use the declaring policy namespace",
});
export type ProjectRoutingPromotion = z.infer<typeof ProjectRoutingPromotionSchema>;

/** Register project promote-only routing policy with a caller-owned registry. */
export function registerProjectRoutingPromotionSchema(registry: KernelRegistry): KernelRegistry {
  registry.register(ProjectRoutingPromotionSchema, {
    id: "project-routing-promotion",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
