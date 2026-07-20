/** Zod authority for topology-neutral independent-analysis obligation projections. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";

import { ReviewRubricIdentitySchema } from "./independent-analysis-schema.js";
import {
  CoreRoutingReasonSchema,
  ProjectRoutingReasonSchema,
  ReviewObligationSchema,
  ReviewRetriggerSchema,
} from "./routing-schema.js";

export const IndependentAnalysisObligationProjectionSchema = z.strictObject({
  obligation: ReviewObligationSchema,
  reasons: z.array(z.union([CoreRoutingReasonSchema, ProjectRoutingReasonSchema])).min(1).readonly(),
  rubricVersion: ReviewRubricIdentitySchema.shape.version,
  rubricDigest: ReviewRubricIdentitySchema.shape.digest,
  retrigger: ReviewRetriggerSchema,
  count: z.literal(1),
}).readonly();
export type IndependentAnalysisObligationProjection = z.infer<
  typeof IndependentAnalysisObligationProjectionSchema
>;

/** Register the logical obligation projection with a caller-owned registry. */
export function registerIndependentAnalysisProjectionSchema(registry: KernelRegistry): KernelRegistry {
  registry.register(IndependentAnalysisObligationProjectionSchema, {
    id: "independent-analysis-obligation-projection",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
