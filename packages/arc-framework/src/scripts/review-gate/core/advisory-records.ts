/** Durable advisory records shared by local and frontline review lanes. */

import { isDeepStrictEqual } from "node:util";

import { z } from "zod";

import { DeliveryReviewMemberVehicleSchema } from "../../../lib/delivery/review-vehicle.js";
import {
  canonicalDigest,
  type KernelRegistry,
} from "../../../lib/kernel/index.js";
import { SlugSchema } from "../../../lib/kernel/schema/slug.js";
import { CandidateVerificationApplicabilitySchema } from
  "../../../lib/work-unit/candidate-attestation.js";
import {
  FrontlineExecutionOutcomeSchema,
  type FrontlineExecutionOutcome,
} from "../policy/frontline-outcome.js";
import { HostedTargetSchema } from "../hosted/request.js";
import { ApprovedDispositionSetSchema } from "./disposition-records.js";
import {
  FixAuthorizationConsumptionSchema,
  FixAuthorizationSchema,
} from "./fix-authorization-records.js";
import {
  ReviewCanonicalDigestSchema,
  ReviewIdentifierSchema,
  ReviewTargetSchema,
} from "./gate-contract-v2-schema.js";

const OpaqueReferenceSchema = z.string().trim().min(1);
const AdvisoryRecordHeaderShape = {
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("review-advisory/v1"),
  repositoryId: ReviewIdentifierSchema,
  operationId: ReviewIdentifierSchema,
};

export const ApprovedDispositionSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("attested-local"),
    receiptRef: OpaqueReferenceSchema,
    localSourceRef: OpaqueReferenceSchema,
  }),
  z.strictObject({
    kind: z.literal("frontline"),
    outcomeRef: OpaqueReferenceSchema,
  }),
  z.strictObject({
    kind: z.literal("hosted"),
    attemptRef: OpaqueReferenceSchema,
    hostedResultId: ReviewCanonicalDigestSchema,
  }),
]);

/** Exact ordinary Errand claim that owns a review response. */
export const ErrandReviewBindingSchema = z.strictObject({
  key: SlugSchema,
  claimId: z.string().trim().min(1),
  branch: z.string().trim().min(1),
});
export type ErrandReviewBinding = z.infer<typeof ErrandReviewBindingSchema>;

/** Monotonic evidence that one approved Errand fix landed and was verified. */
export const ErrandReviewFixResponseSchema = z.strictObject({
  oldTarget: ReviewTargetSchema,
  newTarget: ReviewTargetSchema,
  applicability: CandidateVerificationApplicabilitySchema,
  fixConsumption: FixAuthorizationConsumptionSchema,
  hostedTarget: HostedTargetSchema.nullable(),
});
export type ErrandReviewFixResponse = z.infer<typeof ErrandReviewFixResponseSchema>;

/** Monotonic evidence that one approved delivery-member fix landed and was verified. */
export const DeliveryMemberReviewFixResponseSchema = z.strictObject({
  oldTarget: ReviewTargetSchema,
  newTarget: ReviewTargetSchema,
  applicability: CandidateVerificationApplicabilitySchema,
  fixConsumption: FixAuthorizationConsumptionSchema,
  hostedTarget: HostedTargetSchema.nullable(),
  hostedFixTarget: HostedTargetSchema.nullable(),
});
export type DeliveryMemberReviewFixResponse = z.infer<typeof DeliveryMemberReviewFixResponseSchema>;

export const ApprovedDispositionRecordSchema = z.strictObject({
  ...AdvisoryRecordHeaderShape,
  candidate: z.strictObject({
    workUnit: SlugSchema,
    candidateId: ReviewCanonicalDigestSchema,
  }).nullable(),
  errand: ErrandReviewBindingSchema.nullable(),
  deliveryMember: DeliveryReviewMemberVehicleSchema.nullable(),
  source: ApprovedDispositionSourceSchema,
  approvedDisposition: ApprovedDispositionSetSchema,
  fixAuthorization: FixAuthorizationSchema.nullable(),
  errandFixResponse: ErrandReviewFixResponseSchema.nullable(),
  deliveryMemberFixResponse: DeliveryMemberReviewFixResponseSchema.nullable(),
}).superRefine((record, context) => {
  const bindingCount = [record.candidate, record.errand, record.deliveryMember]
    .filter((binding) => binding !== null).length;
  if (bindingCount > 1) {
    context.addIssue({
      code: "custom",
      message: "a disposition record cannot bind more than one response owner",
      path: ["deliveryMember"],
    });
  }
  if (record.fixAuthorization !== null
    && (record.fixAuthorization.dispositionSetId
      !== record.approvedDisposition.dispositionSet.dispositionSetId
      || record.fixAuthorization.approvedVerification
        !== record.approvedDisposition.dispositionSet.proposedVerification)) {
    context.addIssue({
      code: "custom",
      message: "fix authorization must bind the approved disposition set and verification scope",
      path: ["fixAuthorization"],
    });
  }
  const response = record.errandFixResponse;
  if (response !== null) {
    if (record.errand === null || record.candidate !== null || record.deliveryMember !== null
      || record.fixAuthorization === null) {
      context.addIssue({
        code: "custom",
        message: "an Errand fix response requires one bound Errand and its fix authorization",
        path: ["errandFixResponse"],
      });
    } else {
      if (response.oldTarget.targetId !== record.approvedDisposition.dispositionSet.targetId
        || response.oldTarget.targetId !== record.fixAuthorization.oldTargetId
        || response.oldTarget.headSha !== record.fixAuthorization.oldHeadSha
        || response.fixConsumption.fixAuthorizationId !== record.fixAuthorization.fixAuthorizationId
        || response.fixConsumption.dispositionSetId !== record.fixAuthorization.dispositionSetId
        || response.fixConsumption.oldTargetId !== response.oldTarget.targetId
        || response.fixConsumption.newTargetId !== response.newTarget.targetId
        || response.fixConsumption.oldHeadSha !== response.oldTarget.headSha
        || response.fixConsumption.newHeadSha !== response.newTarget.headSha) {
        context.addIssue({
          code: "custom",
          message: "Errand fix response must bind the exact authorization and target transition",
          path: ["errandFixResponse"],
        });
      }
      if ((record.source.kind === "hosted") !== (response.hostedTarget !== null)
        || (response.hostedTarget !== null && response.hostedTarget.headSha !== response.oldTarget.headSha)) {
        context.addIssue({
          code: "custom",
          message: "hosted Errand fixes must retain their exact originating change request",
          path: ["errandFixResponse", "hostedTarget"],
        });
      }
    }
  }

  const deliveryResponse = record.deliveryMemberFixResponse;
  if (deliveryResponse === null) return;
  if (record.deliveryMember === null || record.candidate !== null || record.errand !== null
    || record.fixAuthorization === null || record.source.kind === "frontline") {
    context.addIssue({
      code: "custom",
      message: "a delivery-member fix response requires its exact member binding and fix authorization",
      path: ["deliveryMemberFixResponse"],
    });
    return;
  }
  const hosted = record.source.kind === "hosted";
  if (hosted !== (deliveryResponse.hostedTarget !== null)
    || hosted !== (deliveryResponse.hostedFixTarget !== null)) {
    context.addIssue({
      code: "custom",
      message: "delivery-member fix response host coordinates must match its source kind",
      path: ["deliveryMemberFixResponse", "hostedTarget"],
    });
    return;
  }
  if (deliveryResponse.oldTarget.kind !== "delivery-member"
    || deliveryResponse.newTarget.kind !== "delivery-member"
    || deliveryResponse.oldTarget.targetId !== record.approvedDisposition.dispositionSet.targetId
    || deliveryResponse.oldTarget.targetId !== record.fixAuthorization.oldTargetId
    || deliveryResponse.oldTarget.headSha !== record.fixAuthorization.oldHeadSha
    || deliveryResponse.oldTarget.headSha !== record.deliveryMember.head
    || deliveryResponse.fixConsumption.fixAuthorizationId !== record.fixAuthorization.fixAuthorizationId
    || deliveryResponse.fixConsumption.dispositionSetId !== record.fixAuthorization.dispositionSetId
    || deliveryResponse.fixConsumption.oldTargetId !== deliveryResponse.oldTarget.targetId
    || deliveryResponse.fixConsumption.newTargetId !== deliveryResponse.newTarget.targetId
    || deliveryResponse.fixConsumption.oldHeadSha !== deliveryResponse.oldTarget.headSha
    || deliveryResponse.fixConsumption.newHeadSha !== deliveryResponse.newTarget.headSha
    || (deliveryResponse.hostedTarget !== null
      && deliveryResponse.hostedFixTarget !== null
      && (deliveryResponse.hostedTarget.headSha !== deliveryResponse.oldTarget.headSha
        || deliveryResponse.hostedFixTarget.headSha !== deliveryResponse.newTarget.headSha
        || !isDeepStrictEqual({
          ...deliveryResponse.hostedFixTarget,
          headSha: deliveryResponse.hostedTarget.headSha,
        }, deliveryResponse.hostedTarget)))) {
    context.addIssue({
      code: "custom",
      message: "delivery-member fix response must bind the exact authorization, member, and hosted transition",
      path: ["deliveryMemberFixResponse"],
    });
  }
});
export type ApprovedDispositionRecord = z.infer<typeof ApprovedDispositionRecordSchema>;

/** Recognize the sole monotonic transition from an unowned local disposition to its exact delivery member. */
export function isExactDeliveryMemberBindingAdvance(
  existing: ApprovedDispositionRecord,
  next: ApprovedDispositionRecord,
): boolean {
  if (existing.source.kind !== "attested-local" || next.source.kind !== "attested-local"
    || existing.candidate !== null || existing.errand !== null || existing.deliveryMember !== null
    || next.candidate !== null || next.errand !== null || next.deliveryMember === null
    || existing.deliveryMemberFixResponse !== null || next.deliveryMemberFixResponse !== null) {
    return false;
  }
  return isDeepStrictEqual(
    { ...existing, deliveryMember: null },
    { ...next, deliveryMember: null },
  );
}

export const FrontlineExecutableIdentitySchema = z.strictObject({
  digest: ReviewCanonicalDigestSchema,
  qualifiedVersion: ReviewIdentifierSchema,
});
export type FrontlineExecutableIdentity = z.infer<typeof FrontlineExecutableIdentitySchema>;

export const FrontlineOutcomeDigestPreimageSchema = z.strictObject({
  domain: z.literal("arc.frontline.outcome-digest/v1"),
  outcome: FrontlineExecutionOutcomeSchema,
});

const FrontlineOutcomeRecordInputSchema = z.strictObject({
  ...AdvisoryRecordHeaderShape,
  sourceIdentity: ReviewIdentifierSchema,
  executableIdentity: FrontlineExecutableIdentitySchema.nullable(),
  outcome: FrontlineExecutionOutcomeSchema,
});

const FrontlineOutcomeRecordObjectSchema = z.strictObject({
  ...FrontlineOutcomeRecordInputSchema.shape,
  outcomeDigest: ReviewCanonicalDigestSchema,
});

export const FrontlineOutcomeRecordSchema = FrontlineOutcomeRecordObjectSchema.superRefine((record, context) => {
  if (record.sourceIdentity !== record.outcome.source.sourceId) {
    context.addIssue({
      code: "custom",
      message: "source identity must match the normalized outcome source",
      path: ["sourceIdentity"],
    });
  }
  if (record.repositoryId !== record.outcome.target.repositoryId) {
    context.addIssue({
      code: "custom",
      message: "repository identity must match the normalized outcome target",
      path: ["repositoryId"],
    });
  }
  if (record.outcomeDigest !== computeFrontlineOutcomeDigest(record.outcome)) {
    context.addIssue({
      code: "custom",
      message: "outcomeDigest must bind the complete normalized outcome",
      path: ["outcomeDigest"],
    });
  }
  const executableRequirement = outcomeExecutableRequirement(record.outcome);
  if (executableRequirement === "required" && record.executableIdentity === null) {
    context.addIssue({
      code: "custom",
      message: "launched outcomes require executable identity",
      path: ["executableIdentity"],
    });
  }
  if (executableRequirement === "forbidden" && record.executableIdentity !== null) {
    context.addIssue({
      code: "custom",
      message: "never-launched outcomes cannot carry executable identity",
      path: ["executableIdentity"],
    });
  }
});
export type FrontlineOutcomeRecord = z.infer<typeof FrontlineOutcomeRecordSchema>;

/** Compute the domain-separated digest of the full normalized outcome. */
export function computeFrontlineOutcomeDigest(outcome: FrontlineExecutionOutcome): `sha256:${string}` {
  return canonicalDigest(FrontlineOutcomeDigestPreimageSchema.parse({
    domain: "arc.frontline.outcome-digest/v1",
    outcome,
  }));
}

/** Create one digest-bound frontline outcome record. */
export function createFrontlineOutcomeRecord(
  input: z.input<typeof FrontlineOutcomeRecordInputSchema>,
): FrontlineOutcomeRecord {
  const record = FrontlineOutcomeRecordInputSchema.parse(input);
  return FrontlineOutcomeRecordSchema.parse({
    ...record,
    outcomeDigest: computeFrontlineOutcomeDigest(record.outcome),
  });
}

function outcomeExecutableRequirement(
  outcome: FrontlineExecutionOutcome,
): "required" | "forbidden" | "optional" {
  if (
    outcome.outcome === "stale-target"
    || outcome.outcome === "timed-out"
    || outcome.outcome === "failed"
  ) {
    return "optional";
  }
  if (outcome.outcome === "pass-cap-exhausted") return "forbidden";
  if (outcome.outcome === "unavailable") {
    if (outcome.reason.class === "source-unbound") return "forbidden";
    if (outcome.reason.class === "capability-unsupported") return "optional";
    return "required";
  }
  return "required";
}

const ReductionBaseShape = {
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("review-advisory/v1"),
  operationId: ReviewIdentifierSchema,
  persistedVersion: z.number().int().nonnegative(),
  currentTarget: ReviewTargetSchema,
};

export const ReviewReductionProjectionSchema = z.discriminatedUnion("state", [
  z.strictObject({
    ...ReductionBaseShape,
    state: z.literal("findings"),
    nextAction: z.literal("respond"),
    sourceRefs: z.array(OpaqueReferenceSchema).min(1),
  }),
  z.strictObject({
    ...ReductionBaseShape,
    state: z.literal("settled"),
    nextAction: z.literal("none"),
  }),
  z.strictObject({
    ...ReductionBaseShape,
    state: z.literal("advisory-complete"),
    nextAction: z.literal("none"),
  }),
  z.strictObject({
    ...ReductionBaseShape,
    state: z.literal("retryable"),
    nextAction: z.literal("retry"),
    retryCommand: z.enum(["local-attest", "frontline-run"]),
  }),
  z.strictObject({
    ...ReductionBaseShape,
    state: z.literal("stale-target"),
    nextAction: z.literal("prepare-current-target"),
  }),
]);
export type ReviewReductionProjection = z.infer<typeof ReviewReductionProjectionSchema>;

/** Register the durable advisory record vocabulary. */
export function registerAdvisoryRecordSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(ApprovedDispositionRecordSchema, {
    id: "approved-disposition-record",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(FrontlineOutcomeDigestPreimageSchema, {
    id: "frontline-outcome-digest-preimage",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(FrontlineOutcomeRecordSchema, {
    id: "frontline-outcome-record",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewReductionProjectionSchema, {
    id: "review-reduction-projection",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
