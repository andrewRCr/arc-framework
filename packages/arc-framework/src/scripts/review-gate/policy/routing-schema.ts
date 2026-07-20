/** Zod authority for topology-neutral review routing facts and decisions. */

import { z } from "zod";

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

export const ReviewRoutingDecisionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  authorSelfReview: ReviewObligationSchema,
  frontlineAction: FrontlineActionSchema,
  independentAnalysis: ReviewObligationSchema,
  retrigger: ReviewRetriggerSchema,
  assuranceMode: AssuranceModeSchema,
  reasons: z.array(z.union([CoreRoutingReasonSchema, ProjectRoutingReasonSchema])).min(1),
}).refine((decision) => (
  (decision.independentAnalysis === "exempt" && decision.retrigger === "none")
  || (decision.independentAnalysis !== "exempt" && decision.retrigger !== "none")
), {
  message: "independent-analysis obligation and retrigger treatment are incongruent",
});
export type ReviewRoutingDecision = z.infer<typeof ReviewRoutingDecisionSchema>;
