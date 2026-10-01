/** Runtime schemas for local and frontline review-response planning. */

import { z } from "zod";
import { CanonicalDigestSchema } from "../../../lib/kernel/schema/vocabulary.js";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import {
  ApprovedDispositionSetSchema,
  DispositionSetStateSchema,
} from "./disposition-records.js";
import {
  NormalizedReviewFindingsSchema,
  ReviewFindingIdentitySchema,
} from "./finding-records.js";
import { FixAuthorizationSchema } from "./fix-authorization-records.js";
import { ReviewTargetSchema } from "./gate-contract-v2-schema.js";
import { ReviewRoutingDecisionSchema } from "../policy/routing-schema.js";
import { ReviewPolicyCommandRequestSchema } from "../policy/review-policy-driver.js";

export const ReviewResponseCapabilitySchema = z.enum(["approve", "fix", "persist", "close", "reroute"]);
export type ReviewResponseCapability = z.infer<typeof ReviewResponseCapabilitySchema>;

export const ReviewResponseCapabilitiesSchema = z.strictObject({
  approve: z.boolean(),
  fix: z.boolean(),
  persist: z.boolean(),
  close: z.boolean(),
  reroute: z.boolean(),
});
export type ReviewResponseCapabilities = z.infer<typeof ReviewResponseCapabilitiesSchema>;

export const ReviewResponseInputSchema = z.strictObject({
  currentTarget: ReviewTargetSchema,
  findings: NormalizedReviewFindingsSchema.refine((findings) => findings.length > 0),
  routing: ReviewRoutingDecisionSchema,
  dispositionState: DispositionSetStateSchema.nullable(),
  candidateTarget: ReviewTargetSchema.nullable(),
  persistedTargetId: CanonicalDigestSchema.nullable(),
  verificationPassed: z.boolean(),
  verificationRefs: z.array(z.string().trim().min(1)),
  capabilities: ReviewResponseCapabilitiesSchema,
});
export type ReviewResponseInput = z.infer<typeof ReviewResponseInputSchema>;

export const ReviewResponseStateSchema = z.enum([
  "awaiting-approval",
  "ready-to-fix",
  "ready-to-persist",
  "ready-to-close",
  "reroute",
  "blocked",
]);
export type ReviewResponseState = z.infer<typeof ReviewResponseStateSchema>;

export const ReviewResponsePlanSchema = z.strictObject({
  schemaVersion: z.literal(2),
  semanticsVersion: z.literal("review-response/v1"),
  state: ReviewResponseStateSchema,
  oldTarget: ReviewTargetSchema,
  newTarget: ReviewTargetSchema.nullable(),
  dispositionState: ApprovedDispositionSetSchema.nullable(),
  fixAuthorization: FixAuthorizationSchema.nullable(),
  verificationRefs: z.array(z.string().trim().min(1)),
  blocking: z.boolean(),
  allowedCapabilities: z.array(ReviewResponseCapabilitySchema),
  nextAction: z.string().trim().min(1),
});
export type ReviewResponsePlan = z.infer<typeof ReviewResponsePlanSchema>;

export const ReviewResponseSettlementSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("attested-local"), receiptRef: z.string().trim().min(1) }),
  z.strictObject({ kind: z.literal("frontline"), outcomeRef: z.string().trim().min(1) }),
  z.strictObject({ kind: z.literal("hosted"), attemptRef: z.string().trim().min(1) }),
]);

/** Exact unsettled hosted attempt and normalized findings ready for response triage. */
export const HostedFindingsResponsePlanSchema = z.strictObject({
  schemaVersion: z.literal(1),
  target: ReviewTargetSchema,
  source: z.strictObject({ kind: z.literal("hosted"), attemptRef: z.string().trim().min(1) }),
  findings: NormalizedReviewFindingsSchema.refine((findings) => findings.length > 0),
});
export type HostedFindingsResponsePlan = z.infer<typeof HostedFindingsResponsePlanSchema>;

export const ReviewResponseSettlementRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: ReviewResponseSettlementSourceSchema,
  policyRequest: ReviewPolicyCommandRequestSchema,
  dispositions: ApprovedDispositionSetSchema,
});
export type ReviewResponseSettlementRequest = z.infer<typeof ReviewResponseSettlementRequestSchema>;

export const ReviewResponseSettlementActionSchema = z.strictObject({
  channel: z.literal("review-response"),
  dispositionId: CanonicalDigestSchema,
  originTarget: ReviewTargetSchema,
  fixTarget: ReviewTargetSchema.nullable(),
  actors: z.strictObject({
    approverIdentity: z.string().trim().min(1),
    proposerIdentity: z.string().trim().min(1),
  }),
  findingIds: z.array(ReviewFindingIdentitySchema).min(1),
  request: ReviewResponseSettlementRequestSchema,
}).superRefine((action, context) => {
  const dispositions = action.request.dispositions;
  const set = dispositions.dispositionSet;
  const expectedFindingIds = set.findings.map(({ findingId }) => findingId).sort();
  if (action.dispositionId !== set.dispositionSetId) {
    context.addIssue({ code: "custom", path: ["dispositionId"], message: "must bind the approved disposition set" });
  }
  if (action.originTarget.targetId !== set.targetId) {
    context.addIssue({ code: "custom", path: ["originTarget"], message: "must bind the disposition target" });
  }
  if (
    action.actors.approverIdentity !== dispositions.approval.approvedBy
    || action.actors.proposerIdentity !== set.proposedBy
  ) {
    context.addIssue({ code: "custom", path: ["actors"], message: "must bind the disposition actors" });
  }
  if (JSON.stringify(action.findingIds) !== JSON.stringify(expectedFindingIds)) {
    context.addIssue({ code: "custom", path: ["findingIds"], message: "must bind every disposition finding" });
  }
  const hasFix = set.findings.some(({ disposition }) => disposition === "fix");
  if (hasFix && action.fixTarget === null) {
    context.addIssue({ code: "custom", path: ["fixTarget"], message: "must identify the exact fix target when fixes exist" });
  }
  if (action.fixTarget !== null && action.fixTarget.repositoryId !== action.originTarget.repositoryId) {
    context.addIssue({ code: "custom", path: ["fixTarget"], message: "must be a target in the originating repository" });
  }
  // A fix moves the head by definition, so a fix-bearing set that settles at its own origin is
  // incoherent. A set that authorized no fix settles wherever the head stands when the checkpoint
  // approves it — the same revision when no ceremony write intervened — so equality is its normal case.
  if (hasFix && action.fixTarget !== null && action.fixTarget.targetId === action.originTarget.targetId) {
    context.addIssue({ code: "custom", path: ["fixTarget"], message: "must be a changed target when fixes exist" });
  }
});
export type ReviewResponseSettlementAction = z.infer<typeof ReviewResponseSettlementActionSchema>;

/** Register deterministic response-planning records with the review domain. */
export function registerReviewResponseSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(ReviewResponseInputSchema, {
    id: "review-response-input",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewResponsePlanSchema, {
    id: "review-response-plan",
    version: 2,
    migrationPosture: "strict-current",
  });
  return registry;
}
