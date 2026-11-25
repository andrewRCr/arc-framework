/** Public request contract for transient planning-grooming review exemption. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import {
  ChangeDeterminacySchema,
  OwnershipRelationSchema,
  ReviewContentKindSchema,
  ReviewRiskSchema,
  SurfaceAuthoritySchema,
} from "../policy/routing-schema.js";
import { ReviewTargetCoordinatesSchema } from "./review-target-coordinates.js";

export const REVIEW_PLANNING_GROOMING_RESOLVE_REQUEST_SCHEMA_ID =
  "review-planning-grooming-resolve-request";

/** Exact change-set coordinates; this adapter never addresses delivery members. */
export const PlanningGroomingTargetCoordinatesSchema = ReviewTargetCoordinatesSchema
  .omit({ kind: true });

/** Caller-owned judgments that cannot be established from Git or ARC runtime state. */
export const PlanningGroomingRoutingInputSchema = z.strictObject({
  contentKind: ReviewContentKindSchema,
  reviewRisk: ReviewRiskSchema,
  changeDeterminacy: ChangeDeterminacySchema,
  ownership: OwnershipRelationSchema,
  surfaceAuthority: SurfaceAuthoritySchema,
});

/**
 * Public request: the command derives repository identity, immutable target trees,
 * exact planning-lane eligibility, assurance, and method activity.
 */
export const ReviewPlanningGroomingResolveRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  target: PlanningGroomingTargetCoordinatesSchema,
  routingFacts: PlanningGroomingRoutingInputSchema,
});
export type ReviewPlanningGroomingResolveRequest = z.infer<
  typeof ReviewPlanningGroomingResolveRequestSchema
>;

/** Register the strict-current public planning-grooming request. */
export function registerPlanningGroomingCommandSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(ReviewPlanningGroomingResolveRequestSchema, {
    id: REVIEW_PLANNING_GROOMING_RESOLVE_REQUEST_SCHEMA_ID,
    version: 1,
    migrationPosture: "strict-current", authored: "request",
  });
  return registry;
}
