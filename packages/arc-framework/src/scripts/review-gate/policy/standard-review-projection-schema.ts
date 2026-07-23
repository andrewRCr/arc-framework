/** Zod authority for topology-neutral standard-review obligation projections. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";

import { ReviewRubricIdentitySchema } from "./standard-review-schema.js";
import {
  CoreRoutingReasonSchema,
  ProjectRoutingReasonSchema,
  ReviewObligationSchema,
  ReviewRetriggerSchema,
} from "./routing-schema.js";

export const StandardReviewObligationProjectionSchema = z.strictObject({
  obligation: ReviewObligationSchema,
  reasons: z.array(z.union([CoreRoutingReasonSchema, ProjectRoutingReasonSchema])).min(1).readonly(),
  rubricVersion: ReviewRubricIdentitySchema.shape.version,
  rubricDigest: ReviewRubricIdentitySchema.shape.digest,
  retrigger: ReviewRetriggerSchema,
  count: z.literal(1),
}).readonly();
export type StandardReviewObligationProjection = z.infer<
  typeof StandardReviewObligationProjectionSchema
>;

/** Register the logical obligation projection with a caller-owned registry. */
export function registerStandardReviewProjectionSchema(registry: KernelRegistry): KernelRegistry {
  registry.register(StandardReviewObligationProjectionSchema, {
    id: "standard-review-obligation-projection",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
