/** Zod authority for method activity and work-unit assurance inputs. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";

export const WorkContextSchema = z.enum(["unscoped", "errand", "work-unit"]);
export type WorkContext = z.infer<typeof WorkContextSchema>;

export const RoutingWorkClassSchema = z.enum(["none", "Light", "Heavy", "Novel"]);
export type RoutingWorkClass = z.infer<typeof RoutingWorkClassSchema>;

export const ReviewMethodActivitySchema = z.strictObject({
  selfReview: z.boolean(),
  frontlineReview: z.boolean(),
});
export type ReviewMethodActivity = z.infer<typeof ReviewMethodActivitySchema>;

export const ReviewAssuranceInputSchema = z.strictObject({
  workContext: WorkContextSchema,
  workClass: RoutingWorkClassSchema,
});
export type ReviewAssuranceInput = z.infer<typeof ReviewAssuranceInputSchema>;

/** Register method-activity and assurance inputs with a caller-owned registry. */
export function registerReviewAssuranceSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(ReviewMethodActivitySchema, {
    id: "review-method-activity",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewAssuranceInputSchema, {
    id: "review-assurance-input",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
