/** Zod authority for method activity and work-unit assurance inputs. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import { SlugSchema } from "../../../lib/kernel/schema/slug.js";
import { ReviewRubricBindingUnavailableReasonSchema } from "./rubric-binding.js";
import { StandardReviewProjectAugmentationSchema } from "./standard-review-guidance.js";

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

export const ReviewRubricOverlayResolutionSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("absent") }),
  z.strictObject({
    state: z.literal("resolved"),
    identity: SlugSchema,
    augmentation: StandardReviewProjectAugmentationSchema,
  }),
  z.strictObject({
    state: z.literal("unavailable"),
    identity: SlugSchema,
    reason: ReviewRubricBindingUnavailableReasonSchema,
  }),
]);
export type ReviewRubricOverlayResolution = z.infer<typeof ReviewRubricOverlayResolutionSchema>;

export const WorkUnitReviewAssuranceSchema = z.strictObject({
  activity: ReviewMethodActivitySchema,
  assurance: ReviewAssuranceInputSchema,
  reviewRubric: ReviewRubricOverlayResolutionSchema,
});
export type WorkUnitReviewAssurance = z.infer<typeof WorkUnitReviewAssuranceSchema>;

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
  registry.register(ReviewRubricOverlayResolutionSchema, {
    id: "review-rubric-overlay-resolution",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(WorkUnitReviewAssuranceSchema, {
    id: "work-unit-review-assurance",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
