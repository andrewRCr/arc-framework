/** Zod authority for forward-only review-gate targets, requests, and identity preimages. */

import { z } from "zod";
import { CanonicalDigestSchema } from "../../../lib/kernel/schema/vocabulary.js";

import {
  canonicalize,
  sortByCanonicalBytes,
  type KernelRegistry,
} from "../../../lib/kernel/index.js";
import { StandardReviewObligationProjectionSchema } from "../policy/standard-review-projection-schema.js";
import {
  CoreRoutingReasonSchema,
  ProjectRoutingReasonSchema,
  ReviewRetriggerSchema,
} from "../policy/routing-schema.js";
import { NormalizedReviewFindingsSchema } from "./finding-records.js";

export const ReviewGateV2SemanticsSchema = z.literal("review-gate/v2");
export type ReviewGateV2Semantics = z.infer<typeof ReviewGateV2SemanticsSchema>;

export const ReviewCanonicalDigestSchema = CanonicalDigestSchema;
export type ReviewCanonicalDigest = z.infer<typeof ReviewCanonicalDigestSchema>;

export const GitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
export type GitObjectId = z.infer<typeof GitObjectIdSchema>;

export const ReviewIdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u);

export const ReviewTargetKindSchema = z.enum(["change-set", "delivery-member"]);
export type ReviewTargetKind = z.infer<typeof ReviewTargetKindSchema>;

export const ReviewTargetIdPreimageSchema = z.strictObject({
  domain: z.literal("arc.review-gate.target-id/v2"),
  schemaVersion: z.literal(2),
  semanticsVersion: ReviewGateV2SemanticsSchema,
  kind: ReviewTargetKindSchema,
  repositoryId: ReviewIdentifierSchema,
  baseRef: ReviewIdentifierSchema,
  diffBaseSha: GitObjectIdSchema,
  diffBaseTree: GitObjectIdSchema,
  headSha: GitObjectIdSchema,
  headTree: GitObjectIdSchema,
});
export type ReviewTargetIdPreimage = z.infer<typeof ReviewTargetIdPreimageSchema>;

export const ReviewTargetInputSchema = ReviewTargetIdPreimageSchema.omit({ domain: true });
export type ReviewTargetInput = z.infer<typeof ReviewTargetInputSchema>;

export const ReviewTargetSchema = ReviewTargetInputSchema.extend({
  targetId: ReviewCanonicalDigestSchema,
});
export type ReviewTarget = z.infer<typeof ReviewTargetSchema>;

export const ReviewCarrierSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("change-request"),
    adapterId: ReviewIdentifierSchema,
    changeRequestId: ReviewIdentifierSchema,
  }),
  z.strictObject({
    kind: z.literal("local-change-set"),
    adapterId: ReviewIdentifierSchema,
    changeRequestId: z.null(),
    errandClaimId: ReviewIdentifierSchema.optional(),
  }),
]);
export type ReviewCarrier = z.infer<typeof ReviewCarrierSchema>;

const ReviewRequestFieldsSchema = z.strictObject({
  schemaVersion: z.literal(2),
  semanticsVersion: ReviewGateV2SemanticsSchema,
  repositoryId: ReviewIdentifierSchema,
  targetId: ReviewCanonicalDigestSchema,
  requirementId: ReviewCanonicalDigestSchema,
  carrier: ReviewCarrierSchema,
  authorIdentity: ReviewIdentifierSchema,
  evaluatorIdentity: ReviewIdentifierSchema,
  lineageId: ReviewCanonicalDigestSchema,
  logicalPass: z.number().int().positive(),
  generation: z.number().int().nonnegative(),
  requestMechanism: ReviewIdentifierSchema,
});

/** The non-author evaluator invariant, applied identically to every request validation path. */
function authorEvaluatorDiffer(request: { authorIdentity: string; evaluatorIdentity: string }): boolean {
  return request.authorIdentity !== request.evaluatorIdentity;
}
const AUTHOR_EVALUATOR_REFINEMENT = { message: "author and evaluator identities must differ" } as const;

export const ReviewRequestIdPreimageSchema = z.strictObject({
  domain: z.literal("arc.review-gate.request-id/v2"),
  ...ReviewRequestFieldsSchema.shape,
}).refine(authorEvaluatorDiffer, AUTHOR_EVALUATOR_REFINEMENT);
export type ReviewRequestIdPreimage = z.infer<typeof ReviewRequestIdPreimageSchema>;

export const ReviewRequestInputSchema = ReviewRequestFieldsSchema.refine(
  authorEvaluatorDiffer,
  AUTHOR_EVALUATOR_REFINEMENT,
);
export type ReviewRequestInput = z.infer<typeof ReviewRequestInputSchema>;

export const ReviewRequestV2Schema = z.strictObject({
  ...ReviewRequestFieldsSchema.shape,
  requestId: ReviewCanonicalDigestSchema,
}).refine(authorEvaluatorDiffer, AUTHOR_EVALUATOR_REFINEMENT);
export type ReviewRequestV2 = z.infer<typeof ReviewRequestV2Schema>;

export const ReviewAcceptedSourceSchema = z.strictObject({
  sourceKind: ReviewIdentifierSchema,
  qualifier: ReviewIdentifierSchema.nullable(),
});
export type ReviewAcceptedSource = z.infer<typeof ReviewAcceptedSourceSchema>;

function isSortedUnique(values: readonly unknown[]): boolean {
  const keys = values.map(canonicalize);
  if (new Set(keys).size !== keys.length) return false;
  return sortByCanonicalBytes(values).map(canonicalize).every((key, index) => key === keys[index]);
}

const ReviewPolicyVersionFieldsSchema = z.strictObject({
  schemaVersion: z.literal(2),
  semanticsVersion: ReviewGateV2SemanticsSchema,
  kind: z.literal("standard-review"),
  obligation: z.enum(["recommended", "required"]),
  rubricVersion: ReviewIdentifierSchema,
  rubricDigest: ReviewCanonicalDigestSchema,
  retrigger: ReviewRetriggerSchema,
  count: z.literal(1),
  acceptableSources: z.array(ReviewAcceptedSourceSchema).min(1),
  initialAdmission: z.enum(["automatic", "checkpoint"]),
});

function policyVersionIsNormalized(policy: z.infer<typeof ReviewPolicyVersionFieldsSchema>): boolean {
  return policy.retrigger !== "none" && isSortedUnique(policy.acceptableSources);
}

export const ReviewPolicyVersionInputSchema = ReviewPolicyVersionFieldsSchema.refine(
  policyVersionIsNormalized,
  { message: "policy sources must be sorted and unique, with a non-exempt retrigger" },
);
export type ReviewPolicyVersionInput = z.infer<typeof ReviewPolicyVersionInputSchema>;

export const ReviewPolicyVersionPreimageSchema = z.strictObject({
  domain: z.literal("arc.review-gate.policy-version/v2"),
  ...ReviewPolicyVersionFieldsSchema.shape,
}).refine(policyVersionIsNormalized, {
  message: "policy sources must be sorted and unique, with a non-exempt retrigger",
});
export type ReviewPolicyVersionPreimage = z.infer<typeof ReviewPolicyVersionPreimageSchema>;

const ReviewRequirementFieldsSchema = z.strictObject({
  schemaVersion: z.literal(2),
  semanticsVersion: ReviewGateV2SemanticsSchema,
  targetId: ReviewCanonicalDigestSchema,
  kind: z.literal("standard-review"),
  obligation: z.enum(["recommended", "required"]),
  reasons: z.array(z.union([CoreRoutingReasonSchema, ProjectRoutingReasonSchema])).min(1),
  rubricVersion: ReviewIdentifierSchema,
  rubricDigest: ReviewCanonicalDigestSchema,
  retrigger: ReviewRetriggerSchema,
  count: z.literal(1),
  acceptableSources: z.array(ReviewAcceptedSourceSchema).min(1),
  initialAdmission: z.enum(["automatic", "checkpoint"]),
  policyVersion: ReviewCanonicalDigestSchema,
});

function requirementIsNormalized(requirement: z.infer<typeof ReviewRequirementFieldsSchema>): boolean {
  return requirement.retrigger !== "none"
    && isSortedUnique(requirement.reasons)
    && isSortedUnique(requirement.acceptableSources);
}

export const ReviewRequirementIdPreimageSchema = z.strictObject({
  domain: z.literal("arc.review-gate.requirement-id/v2"),
  ...ReviewRequirementFieldsSchema.shape,
}).refine(requirementIsNormalized, {
  message: "requirement sets must be sorted and unique, with a non-exempt retrigger",
});
export type ReviewRequirementIdPreimage = z.infer<typeof ReviewRequirementIdPreimageSchema>;

export const ReviewRequirementV2Schema = z.strictObject({
  ...ReviewRequirementFieldsSchema.shape,
  requirementId: ReviewCanonicalDigestSchema,
}).refine(requirementIsNormalized, {
  message: "requirement sets must be sorted and unique, with a non-exempt retrigger",
});
export type ReviewRequirementV2 = z.infer<typeof ReviewRequirementV2Schema>;

export const ReviewRequirementCreationInputSchema = z.strictObject({
  target: ReviewTargetSchema,
  projection: StandardReviewObligationProjectionSchema,
  acceptableSources: z.array(ReviewAcceptedSourceSchema).min(1),
  initialAdmission: z.enum(["automatic", "checkpoint"]),
});
export type ReviewRequirementCreationInput = z.infer<typeof ReviewRequirementCreationInputSchema>;

const ReviewReceiptFieldsSchema = z.strictObject({
  schemaVersion: z.literal(2),
  semanticsVersion: ReviewGateV2SemanticsSchema,
  requestId: ReviewCanonicalDigestSchema,
  targetId: ReviewCanonicalDigestSchema,
  requirementId: ReviewCanonicalDigestSchema,
  applicabilityId: ReviewCanonicalDigestSchema.nullable(),
  reviewRunId: ReviewIdentifierSchema,
  evaluatorIdentity: ReviewIdentifierSchema,
  attestingRuntimeIdentity: ReviewIdentifierSchema,
  attestationMechanism: ReviewIdentifierSchema,
  providerEventIdentity: ReviewIdentifierSchema.nullable(),
  rubricVersion: ReviewIdentifierSchema,
  rubricDigest: ReviewCanonicalDigestSchema,
  result: z.enum(["clean", "findings", "unavailable", "failed"]),
  findings: NormalizedReviewFindingsSchema,
});

export const ReviewReceiptV2Schema = ReviewReceiptFieldsSchema.superRefine((receipt, context) => {
  if ((receipt.result === "findings") !== (receipt.findings.length > 0)) {
    context.addIssue({
      code: "custom",
      message: "findings are required only for a findings result",
      path: ["findings"],
    });
  }
  const identities = new Set<string>();
  for (const [index, finding] of receipt.findings.entries()) {
    if (identities.has(finding.findingId)) {
      context.addIssue({ code: "custom", message: "duplicate finding identity", path: ["findings", index, "findingId"] });
    }
    identities.add(finding.findingId);
  }
});
export type ReviewReceiptV2 = z.infer<typeof ReviewReceiptV2Schema>;

export const ReviewReceiptCreationInputSchema = z.strictObject({
  target: ReviewTargetSchema,
  requirement: ReviewRequirementV2Schema,
  request: ReviewRequestV2Schema,
  applicabilityId: ReviewCanonicalDigestSchema.nullable(),
  reviewRunId: ReviewIdentifierSchema,
  evaluatorIdentity: ReviewIdentifierSchema,
  attestingRuntimeIdentity: ReviewIdentifierSchema,
  attestationMechanism: ReviewIdentifierSchema,
  providerEventIdentity: ReviewIdentifierSchema.nullable(),
  result: z.enum(["clean", "findings", "unavailable", "failed"]),
  findings: NormalizedReviewFindingsSchema,
});
export type ReviewReceiptCreationInput = z.infer<typeof ReviewReceiptCreationInputSchema>;

/** Register forward gate-contract target schemas with a caller-owned registry. */
export function registerReviewGateV2Schemas(registry: KernelRegistry): KernelRegistry {
  registry.register(ReviewTargetIdPreimageSchema, {
    id: "review-target-id-preimage",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewTargetSchema, {
    id: "review-target",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewRequestIdPreimageSchema, {
    id: "review-request-id-preimage",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewRequestV2Schema, {
    id: "review-request",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewRequirementIdPreimageSchema, {
    id: "review-requirement-id-preimage",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewPolicyVersionPreimageSchema, {
    id: "review-policy-version-preimage",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewRequirementV2Schema, {
    id: "review-requirement",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewReceiptV2Schema, {
    id: "review-receipt",
    version: 2,
    migrationPosture: "strict-current",
  });
  return registry;
}
