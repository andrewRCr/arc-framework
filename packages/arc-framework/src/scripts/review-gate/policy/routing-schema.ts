/** Zod authority for topology-neutral review routing facts and decisions. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";

import {
  ReviewAssuranceInputSchema,
  ReviewMethodActivitySchema,
} from "./assurance-schema.js";

export const ReviewObligationSchema = z.enum(["exempt", "recommended", "required"]);
export type ReviewObligation = z.infer<typeof ReviewObligationSchema>;

export const FrontlineActionSchema = z.enum(["skip", "offer", "attempt"]);
export type FrontlineAction = z.infer<typeof FrontlineActionSchema>;

export const ReviewRetriggerSchema = z.enum(["none", "incremental", "full-final"]);
export type ReviewRetrigger = z.infer<typeof ReviewRetriggerSchema>;

export const AssuranceModeSchema = z.enum(["none", "terminal-aggregate"]);
export type AssuranceMode = z.infer<typeof AssuranceModeSchema>;

export const CoreRoutingReasonSchema = z.enum([
  "unknown-change-set",
  "auto-eligible-planning",
  "reviewed-routine-documentation",
  "routine-code",
  "atomic-determinate",
  "atomic-softened",
  "sensitive-change-set",
  "self-owned-artifact",
  "ownerless-artifact",
  "foreign-owned-artifact",
  "mixed-ownership",
  "unknown-ownership",
  "design-authority",
  "constitutional-surface",
  "unverifiable-derived-surface",
  "self-review-inactive",
  "frontline-inactive",
  "frontline-policy-skip",
  "frontline-policy-offer",
  "frontline-policy-attempt",
  "invocation-force",
  "invocation-skip",
  "source-invocation",
  "source-developer",
  "source-project",
  "source-unbound",
]);
export type CoreRoutingReason = z.infer<typeof CoreRoutingReasonSchema>;

export const ProjectRoutingReasonSchema = z.string().regex(
  /^project:[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/u,
);
export type ProjectRoutingReason = z.infer<typeof ProjectRoutingReasonSchema>;
export const ReviewRoutingReasonSchema = z.union([CoreRoutingReasonSchema, ProjectRoutingReasonSchema]);
export type ReviewRoutingReason = z.infer<typeof ReviewRoutingReasonSchema>;

export const ChangeSetStateSchema = z.enum(["known", "unknown"]);
export type ChangeSetState = z.infer<typeof ChangeSetStateSchema>;

export const ReviewContentKindSchema = z.enum(["documentation", "code-bearing"]);
export type ReviewContentKind = z.infer<typeof ReviewContentKindSchema>;

export const ReviewRiskSchema = z.enum(["routine", "sensitive"]);
export type ReviewRisk = z.infer<typeof ReviewRiskSchema>;

export const ChangeDeterminacySchema = z.enum(["atomic", "ordinary"]);
export type ChangeDeterminacy = z.infer<typeof ChangeDeterminacySchema>;

export const OwnershipRelationSchema = z.enum([
  "self",
  "foreign",
  "mixed",
  "ownerless",
  "not-applicable",
  "unknown",
]);
export type OwnershipRelation = z.infer<typeof OwnershipRelationSchema>;

export const SurfaceAuthoritySchema = z.enum([
  "planning-grooming",
  "ordinary",
  "design-authority",
  "constitutional",
  "unverifiable-derived",
  "unknown",
]);
export type SurfaceAuthority = z.infer<typeof SurfaceAuthoritySchema>;

export const ReviewRoutingFactsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  changeSetState: ChangeSetStateSchema,
  contentKind: ReviewContentKindSchema,
  reviewRisk: ReviewRiskSchema,
  changeDeterminacy: ChangeDeterminacySchema,
  ownership: OwnershipRelationSchema,
  surfaceAuthority: SurfaceAuthoritySchema,
  assurance: ReviewAssuranceInputSchema,
  activity: ReviewMethodActivitySchema,
});
export type ReviewRoutingFacts = z.infer<typeof ReviewRoutingFactsSchema>;

export const LocalReviewRoutingInputSchema = z.strictObject({
  contentKind: z.unknown().optional(),
  reviewRisk: z.unknown().optional(),
  changeDeterminacy: z.unknown().optional(),
  ownership: z.unknown().optional(),
  surfaceAuthority: z.unknown().optional(),
});
export type LocalReviewRoutingInput = z.infer<typeof LocalReviewRoutingInputSchema>;

export const ReviewRoutingDecisionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  authorSelfReview: ReviewObligationSchema,
  frontlineAction: FrontlineActionSchema,
  standardReview: ReviewObligationSchema,
  retrigger: ReviewRetriggerSchema,
  assuranceMode: AssuranceModeSchema,
  reasons: z.array(ReviewRoutingReasonSchema).min(1),
}).refine((decision) => (
  (decision.standardReview === "exempt" && decision.retrigger === "none")
  || (decision.standardReview !== "exempt" && decision.retrigger !== "none")
), {
  message: "standard-review obligation and retrigger treatment are incongruent",
});
export type ReviewRoutingDecision = z.infer<typeof ReviewRoutingDecisionSchema>;

export const ReviewRoutingProjectionSchema = z.strictObject({
  facts: ReviewRoutingFactsSchema,
  decision: ReviewRoutingDecisionSchema,
});
export type ReviewRoutingProjection = z.infer<typeof ReviewRoutingProjectionSchema>;

/** Register topology-neutral routing records with a caller-owned registry. */
export function registerReviewRoutingSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(ReviewRoutingFactsSchema, {
    id: "review-routing-facts",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewRoutingDecisionSchema, {
    id: "review-routing-decision",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
