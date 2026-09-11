/** Registered non-evidentiary state for resumable review operations. */

import { z } from "zod";

import { canonicalDigest, canonicalize, type KernelRegistry } from "../../../lib/kernel/index.js";
import { DeliveryReviewMemberVehicleSchema } from "../../../lib/delivery/review-vehicle.js";
import {
  validateReviewRequest,
  validateReviewRequirement,
  validateReviewTarget,
} from "./gate-contract-v2.js";
import {
  GitObjectIdSchema,
  ReviewRequestV2Schema,
  ReviewRequirementV2Schema,
  ReviewTargetSchema,
} from "./gate-contract-v2-schema.js";
import { LocalAttestationBindingSchema } from "./local-carrier.js";
import { FrontlineAdmissionSchema } from "./frontline-admission.js";
import {
  HostedCoverageEvidenceSchema,
  HostedFindingsSchema,
} from "../hosted/await.js";
import {
  HostedAdmissionSchema,
  HostedProviderIdSchema,
  HostedRequestHandleSchema,
  HostedReviewCoverageSchema,
  HostedTargetSchema,
  hostedLaneAttemptId,
  hostedRequestHandleMatchesProgress,
} from "../hosted/request.js";
import { DeliveryLocalReviewAdmissionSchema } from "../policy/delivery-local-review-admission.js";
import {
  laneSubjectLineageId,
  laneSubjectOwnerMatches,
  LaneSubjectLineageSchema,
} from "./lane-admission.js";
import { StandardReviewGuidanceProjectionSchema } from "../policy/standard-review-guidance.js";
import {
  CompletedReviewPassCountSchema,
  ReviewPassSchema,
} from "./review-pass.js";
import { ReviewScopeModeSchema } from "./review-primitives.js";
import { LocalReviewCoverageAdmissionSchema } from "./local-review-coverage.js";
import { IncrementalReviewScopeSchema } from "./incremental-review-scope.js";

const CanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const IdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u);
const OperationEnvelopeShape = {
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("review-operation/v1"),
  operationId: IdentifierSchema,
  updatedAt: z.iso.datetime({ offset: true }),
};
const ReviewVehicleSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("work-unit"), identity: IdentifierSchema }),
  z.strictObject({ kind: z.literal("errand"), identity: IdentifierSchema }),
  z.strictObject({ kind: z.literal("delivery-member"), identity: IdentifierSchema }),
]);

export const FrontlineRunStateSchema = z.strictObject({
  ...OperationEnvelopeShape,
  kind: z.literal("frontline-run"),
  repositoryId: IdentifierSchema,
  targetId: CanonicalDigestSchema,
  sourceIdentity: IdentifierSchema,
  lineage: LaneSubjectLineageSchema,
  logicalPass: z.number().int().positive(),
  retryGeneration: z.number().int().nonnegative(),
  outcome: z.enum([
    "pending",
    "clean",
    "findings",
    "failed",
    "unavailable",
    "timed-out",
    "stale-target",
    "pass-cap-exhausted",
  ]),
  policyVersion: CanonicalDigestSchema,
  sourceBindingId: CanonicalDigestSchema,
});
export type FrontlineRunState = z.infer<typeof FrontlineRunStateSchema>;

export const ReviewSuspensionStateSchema = z.strictObject({
  ...OperationEnvelopeShape,
  kind: z.literal("review-suspension"),
  vehicle: ReviewVehicleSchema,
  repositoryId: IdentifierSchema,
  changeRequestId: IdentifierSchema.nullable(),
  targetId: CanonicalDigestSchema,
  requestId: CanonicalDigestSchema,
  sourceIdentity: IdentifierSchema,
  generation: z.number().int().nonnegative(),
  policyVersion: CanonicalDigestSchema,
  rubricVersion: IdentifierSchema,
  rubricDigest: CanonicalDigestSchema,
  deadlineAt: z.iso.datetime({ offset: true }),
  wakeupToken: CanonicalDigestSchema,
});
export type ReviewSuspensionState = z.infer<typeof ReviewSuspensionStateSchema>;

export const LocalReviewStateSchema = z.strictObject({
  ...OperationEnvelopeShape,
  kind: z.literal("local-review"),
  vehicle: ReviewVehicleSchema,
  repositoryId: IdentifierSchema,
  targetId: CanonicalDigestSchema,
  requestId: CanonicalDigestSchema,
  /** Configured policy source; distinct from the evaluator that produced the attestation. */
  laneSourceId: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u),
  scopeMode: ReviewScopeModeSchema,
  lineage: LaneSubjectLineageSchema,
  logicalPass: z.number().int().positive(),
  retryGeneration: z.number().int().nonnegative(),
  coverageAdmission: LocalReviewCoverageAdmissionSchema,
  deliveryAdmission: DeliveryLocalReviewAdmissionSchema.optional(),
  policyVersion: CanonicalDigestSchema,
  policyBindingDigest: CanonicalDigestSchema,
  attestationRuntimeKind: IdentifierSchema,
  sourceRef: z.string().trim().min(1),
  sourceDigest: CanonicalDigestSchema,
  guidance: StandardReviewGuidanceProjectionSchema,
  guidanceDigest: CanonicalDigestSchema,
  reviewerInstructions: z.string().min(1),
  target: ReviewTargetSchema,
  requirement: ReviewRequirementV2Schema,
  request: ReviewRequestV2Schema,
  attestation: LocalAttestationBindingSchema,
  cleanupTtlMs: z.number().int().positive(),
}).superRefine((state, context) => {
  try {
    const target = validateReviewTarget(state.target);
    const requirement = validateReviewRequirement(target, state.requirement);
    const request = validateReviewRequest(target, state.request);
    if ((state.vehicle.kind === "delivery-member") !== (target.kind === "delivery-member")) {
      context.addIssue({
        code: "custom",
        message: "operation vehicle and target kinds mismatch",
        path: ["vehicle"],
      });
    }
    if (state.deliveryAdmission !== undefined
      && (state.laneSourceId !== state.deliveryAdmission.sourceId
        || state.scopeMode !== (state.deliveryAdmission.scopeSelection?.mode ?? "whole-target")
        || canonicalize(state.coverageAdmission) !== canonicalize({
          requestedCoverage: state.deliveryAdmission.requestedCoverage,
          ...(state.deliveryAdmission.correctionScope === undefined
            ? {}
            : { correctionScope: state.deliveryAdmission.correctionScope }),
        })
        || state.vehicle.kind !== "delivery-member"
        || state.vehicle.identity !== state.deliveryAdmission.vehicle.deliverableId
        || target.kind !== "delivery-member"
        || target.headSha !== state.deliveryAdmission.vehicle.head)) {
      context.addIssue({
        code: "custom",
        message: "local review operation does not match its delivery admission",
        path: ["deliveryAdmission"],
      });
    }
    if (state.repositoryId !== target.repositoryId || state.targetId !== target.targetId) {
      context.addIssue({ code: "custom", message: "operation target snapshot mismatch", path: ["target"] });
    }
    if (state.policyVersion !== requirement.policyVersion) {
      context.addIssue({ code: "custom", message: "operation requirement snapshot mismatch", path: ["requirement"] });
    }
    if (state.requestId !== request.requestId
      || request.requirementId !== requirement.requirementId) {
      context.addIssue({ code: "custom", message: "operation request snapshot mismatch", path: ["request"] });
    }
    if (request.lineageId !== laneSubjectLineageId(state.lineage)
      || request.logicalPass !== state.logicalPass
      || request.generation !== state.retryGeneration) {
      context.addIssue({
        code: "custom",
        message: "operation request admission mismatch",
        path: ["request"],
      });
    }
    if (state.attestation.evaluatorIdentity !== request.evaluatorIdentity) {
      context.addIssue({
        code: "custom",
        message: "operation attestation snapshot mismatch",
        path: ["attestation"],
      });
    }
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "invalid local admission snapshot",
      path: ["target"],
    });
  }
});
export type LocalReviewState = z.infer<typeof LocalReviewStateSchema>;

/**
 * Source identity and outcome vocabulary are the review-policy driver's, not this module's
 * looser `IdentifierSchema`: progress that cannot be replayed into a policy request is not
 * progress, so an unusable value is refused at write rather than discovered at read.
 */
const LaneSourceIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);
const LaneAttemptOutcomeSchema = z.enum([
  "pending",
  "clean",
  "findings",
  "settled-findings",
  "rate-limited",
  "transient-unavailable",
  "partial",
  "ambiguous-delivery",
  "malformed",
  "timed-out",
  "stale-target",
  "capability-unsupported",
  "source-unbound",
  "terminal-failure",
]);

const ConditionalPassAuthorizationIdentitySchema = z.strictObject({
  authorizedBy: IdentifierSchema,
  repositoryId: IdentifierSchema,
  lane: z.enum(["frontline", "standard"]),
  lineage: LaneSubjectLineageSchema,
  producerId: IdentifierSchema,
  dispositionSetId: CanonicalDigestSchema,
  originatingHeadSha: GitObjectIdSchema,
  exhaustedPassCount: CompletedReviewPassCountSchema,
  nextPass: ReviewPassSchema,
});

type ConditionalPassAuthorizationIdentity = z.infer<
  typeof ConditionalPassAuthorizationIdentitySchema
>;

/**
 * Compute the stable identity of one response-gated pass authorization.
 *
 * @param input - Immutable approval, producer, lineage, and pass bindings.
 * @returns The canonical authorization digest.
 */
export function computeConditionalPassAuthorizationId(
  input: ConditionalPassAuthorizationIdentity,
): string {
  return canonicalDigest({
    domain: "arc.review.conditional-pass-authorization/v1",
    authorization: ConditionalPassAuthorizationIdentitySchema.parse({
      authorizedBy: input.authorizedBy,
      repositoryId: input.repositoryId,
      lane: input.lane,
      lineage: input.lineage,
      producerId: input.producerId,
      dispositionSetId: input.dispositionSetId,
      originatingHeadSha: input.originatingHeadSha,
      exhaustedPassCount: input.exhaustedPassCount,
      nextPass: input.nextPass,
    }),
  });
}

const ConditionalPassAuthorizationBaseShape = {
  schemaVersion: z.literal(1),
  authorizationId: CanonicalDigestSchema,
  ...ConditionalPassAuthorizationIdentitySchema.shape,
  capturedAt: z.iso.datetime({ offset: true }),
};
export const ConditionalPassAuthorizationSchema = z.union([
  z.strictObject({
    ...ConditionalPassAuthorizationBaseShape,
    status: z.literal("pending"),
  }),
  z.strictObject({
    ...ConditionalPassAuthorizationBaseShape,
    status: z.literal("bound"),
    producedHeadSha: GitObjectIdSchema,
    boundAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    ...ConditionalPassAuthorizationBaseShape,
    status: z.literal("consumed"),
    producedHeadSha: GitObjectIdSchema,
    boundAt: z.iso.datetime({ offset: true }),
    admissionId: IdentifierSchema,
    consumedAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    ...ConditionalPassAuthorizationBaseShape,
    status: z.literal("invalidated"),
    reason: z.literal("superseded"),
    successorDispositionSetId: CanonicalDigestSchema,
    invalidatedAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    ...ConditionalPassAuthorizationBaseShape,
    status: z.literal("invalidated"),
    reason: z.literal("withdrawn"),
    withdrawnBy: IdentifierSchema,
    invalidatedAt: z.iso.datetime({ offset: true }),
  }),
]).superRefine((authorization, context) => {
  if (authorization.nextPass !== authorization.exhaustedPassCount + 1) {
    context.addIssue({
      code: "custom",
      path: ["nextPass"],
      message: "conditional pass authorization must name the next logical pass",
    });
  }
  if (authorization.authorizationId !== computeConditionalPassAuthorizationId(authorization)) {
    context.addIssue({
      code: "custom",
      path: ["authorizationId"],
      message: "conditional pass authorization identity does not match its binding",
    });
  }
});
export type ConditionalPassAuthorization = z.infer<typeof ConditionalPassAuthorizationSchema>;

export const ConditionalPassAuthorizationsSchema = z.strictObject({
  currentAuthorizationId: CanonicalDigestSchema,
  authorizations: z.array(ConditionalPassAuthorizationSchema).min(1),
}).superRefine((lineage, context) => {
  const ids = lineage.authorizations.map(({ authorizationId }) => authorizationId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: "custom",
      path: ["authorizations"],
      message: "conditional pass authorization identities must be unique",
    });
  }
  if (lineage.authorizations.at(-1)?.authorizationId !== lineage.currentAuthorizationId) {
    context.addIssue({
      code: "custom",
      path: ["currentAuthorizationId"],
      message: "current conditional pass authorization must identify the lineage tail",
    });
  }
  lineage.authorizations.slice(0, -1).forEach((authorization, index) => {
    const successor = lineage.authorizations[index + 1];
    if (authorization.status !== "invalidated") {
      context.addIssue({
        code: "custom",
        path: ["authorizations", index, "status"],
        message: "historical conditional pass authorizations must be invalidated",
      });
    }
    if (authorization.status === "invalidated"
      && authorization.reason === "superseded"
      && authorization.successorDispositionSetId !== successor?.dispositionSetId) {
      context.addIssue({
        code: "custom",
        path: ["authorizations", index, "successorDispositionSetId"],
        message: "superseded conditional pass authorization must bind its successor",
      });
    }
  });
});
export type ConditionalPassAuthorizations = z.infer<typeof ConditionalPassAuthorizationsSchema>;

export const LaneResponsePerformanceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  producerId: IdentifierSchema,
  dispositionSetId: CanonicalDigestSchema,
  originatingHeadSha: GitObjectIdSchema,
  producedHeadSha: GitObjectIdSchema,
  performedAt: z.iso.datetime({ offset: true }),
});
export type LaneResponsePerformance = z.infer<typeof LaneResponsePerformanceSchema>;

export const HostedSealedResultSchema = z.strictObject({
  schemaVersion: z.literal(1),
  outcome: z.enum(["clean", "findings"]),
  reviewUrl: z.url(),
  findings: HostedFindingsSchema,
  coverageEvidence: HostedCoverageEvidenceSchema.optional(),
  hostedResultId: CanonicalDigestSchema,
}).superRefine((result, context) => {
  if ((result.outcome === "clean") !== (result.findings.length === 0)) {
    context.addIssue({
      code: "custom",
      path: ["findings"],
      message: "hosted sealed result findings must exactly match its original outcome",
    });
  }
  const findingIds = result.findings.map(({ findingId }) => findingId);
  if (new Set(findingIds).size !== findingIds.length) {
    context.addIssue({
      code: "custom",
      path: ["findings"],
      message: "hosted sealed result finding IDs must be unique",
    });
  }
});
export type HostedSealedResult = z.infer<typeof HostedSealedResultSchema>;

const HostedSettlementEvidenceBaseShape = {
  findingId: z.string().trim().min(1),
  dispositionSetId: CanonicalDigestSchema,
  disposition: z.enum(["fix", "defer", "reject"]),
  performedAt: z.iso.datetime({ offset: true }),
  carriedFromDispositionSetId: CanonicalDigestSchema.nullable(),
};

export const HostedSettlementEvidenceSchema = z.discriminatedUnion("channelAction", [
  z.strictObject({
    ...HostedSettlementEvidenceBaseShape,
    channelAction: z.literal("record-only"),
  }),
  z.strictObject({
    ...HostedSettlementEvidenceBaseShape,
    channelAction: z.literal("reply-and-resolve"),
    actorIdentity: IdentifierSchema,
    target: HostedTargetSchema,
    fixTarget: HostedTargetSchema.nullable(),
    commentId: z.string().trim().min(1),
    threadId: z.string().trim().min(1),
    replyDigest: CanonicalDigestSchema,
    replyId: z.string().trim().min(1),
  }).superRefine((evidence, context) => {
    if ((evidence.disposition === "fix") !== (evidence.fixTarget !== null)) {
      context.addIssue({
        code: "custom",
        path: ["fixTarget"],
        message: "hosted fix settlement evidence must retain exactly one changed fix target",
      });
    }
    if (evidence.fixTarget !== null
      && (canonicalize({
        ...evidence.fixTarget,
        headSha: evidence.target.headSha,
      }) !== canonicalize(evidence.target)
        || evidence.fixTarget.headSha === evidence.target.headSha)) {
      context.addIssue({
        code: "custom",
        path: ["fixTarget"],
        message: "hosted fix settlement evidence must match the originating request and changed head",
      });
    }
  }),
]);
export type HostedSettlementEvidence = z.infer<typeof HostedSettlementEvidenceSchema>;

const HostedDispositionSetLineageNodeSchema = z.strictObject({
  dispositionSetId: CanonicalDigestSchema,
  predecessorDispositionSetId: CanonicalDigestSchema.nullable(),
  successorDispositionSetId: CanonicalDigestSchema.nullable(),
  findingActions: z.array(z.strictObject({
    findingId: z.string().trim().min(1),
    disposition: z.enum(["fix", "defer", "reject"]),
    channelAction: z.enum(["record-only", "reply-and-resolve"]),
  })),
});

const HostedResultDigestPreimageSchema = z.strictObject({
  attemptId: IdentifierSchema,
  admission: HostedAdmissionSchema,
  handle: HostedRequestHandleSchema,
  target: HostedTargetSchema,
  requestedCoverage: HostedReviewCoverageSchema,
  effectiveCoverage: HostedReviewCoverageSchema.nullable(),
  vehicle: DeliveryReviewMemberVehicleSchema.optional(),
  reviewTarget: ReviewTargetSchema,
  requirement: ReviewRequirementV2Schema,
  outcome: HostedSealedResultSchema.shape.outcome,
  reviewUrl: HostedSealedResultSchema.shape.reviewUrl,
  findings: HostedSealedResultSchema.shape.findings,
  coverageEvidence: HostedSealedResultSchema.shape.coverageEvidence,
});
export type HostedResultDigestPreimage = z.infer<typeof HostedResultDigestPreimageSchema>;

/** Compute the immutable identity of one complete hosted producer result. */
export function computeHostedResultId(input: HostedResultDigestPreimage): string {
  return canonicalDigest({
    domain: "arc.review.hosted-result/v1",
    result: HostedResultDigestPreimageSchema.parse(input),
  });
}

/** Seal one complete hosted producer result against its admitted attempt context. */
export function createHostedSealedResult(
  input: HostedResultDigestPreimage,
): HostedSealedResult {
  const preimage = HostedResultDigestPreimageSchema.parse(input);
  return HostedSealedResultSchema.parse({
    schemaVersion: 1,
    outcome: preimage.outcome,
    reviewUrl: preimage.reviewUrl,
    findings: preimage.findings,
    ...(preimage.coverageEvidence === undefined
      ? {}
      : { coverageEvidence: preimage.coverageEvidence }),
    hostedResultId: computeHostedResultId(preimage),
  });
}

const HostedLaneAttemptBindingSchema = z.strictObject({
  admission: HostedAdmissionSchema,
  handle: HostedRequestHandleSchema.optional(),
  target: HostedTargetSchema,
  requestedCoverage: HostedReviewCoverageSchema,
  effectiveCoverage: HostedReviewCoverageSchema.nullable(),
  vehicle: DeliveryReviewMemberVehicleSchema.optional(),
  reviewTarget: ReviewTargetSchema,
  requirement: ReviewRequirementV2Schema,
  actorIdentity: IdentifierSchema,
  requestFailureReason: z.string().trim().min(1).nullable(),
  sealedResult: HostedSealedResultSchema.optional(),
  dispositionSetId: CanonicalDigestSchema.nullable(),
  dispositionSetLineage: z.array(HostedDispositionSetLineageNodeSchema),
  settledFindingIds: z.array(z.string().trim().min(1)),
  settlementEvidence: z.array(HostedSettlementEvidenceSchema),
}).superRefine((hosted, context) => {
  if (hosted.requestedCoverage === "complete"
    && hosted.effectiveCoverage !== null
    && hosted.effectiveCoverage !== "complete") {
    context.addIssue({
      code: "custom",
      path: ["effectiveCoverage"],
      message: "effective coverage must not weaken requested complete coverage",
    });
  }
  const evidenceKeys = hosted.settlementEvidence.map((evidence) =>
    `${evidence.dispositionSetId}\u0000${evidence.findingId}`);
  if (new Set(evidenceKeys).size !== evidenceKeys.length) {
    context.addIssue({
      code: "custom",
      path: ["settlementEvidence"],
      message: "hosted settlement evidence must be unique per disposition set and finding",
    });
  }
  const lineageIds = hosted.dispositionSetLineage.map(({ dispositionSetId }) => dispositionSetId);
  if (new Set(lineageIds).size !== lineageIds.length) {
    context.addIssue({
      code: "custom",
      path: ["dispositionSetLineage"],
      message: "hosted disposition-set lineage identities must be unique",
    });
  }
  if (hosted.dispositionSetId === null) {
    if (hosted.dispositionSetLineage.length > 0 || hosted.settlementEvidence.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["dispositionSetLineage"],
        message: "unbound hosted attempts cannot retain disposition lineage or settlement evidence",
      });
    }
  } else if (lineageIds.at(-1) !== hosted.dispositionSetId) {
    context.addIssue({
      code: "custom",
      path: ["dispositionSetId"],
      message: "hosted current disposition set must identify the lineage tail",
    });
  }
  hosted.dispositionSetLineage.forEach((node, index) => {
    const predecessor = hosted.dispositionSetLineage[index - 1];
    const successor = hosted.dispositionSetLineage[index + 1];
    if (node.predecessorDispositionSetId !== (predecessor?.dispositionSetId ?? null)
      || node.successorDispositionSetId !== (successor?.dispositionSetId ?? null)) {
      context.addIssue({
        code: "custom",
        path: ["dispositionSetLineage", index],
        message: "hosted disposition-set lineage edges must be exact and ordered",
      });
    }
    const findingIds = node.findingActions.map(({ findingId }) => findingId);
    if (new Set(findingIds).size !== findingIds.length) {
      context.addIssue({
        code: "custom",
        path: ["dispositionSetLineage", index, "findingActions"],
        message: "hosted disposition-set finding actions must be unique",
      });
    }
  });
  for (const evidence of hosted.settlementEvidence) {
    const node = hosted.dispositionSetLineage.find(({ dispositionSetId }) =>
      dispositionSetId === evidence.dispositionSetId);
    const action = node?.findingActions.find(({ findingId }) => findingId === evidence.findingId);
    if (node === undefined
      || action?.disposition !== evidence.disposition
      || action.channelAction !== evidence.channelAction
      || (evidence.carriedFromDispositionSetId !== null
        && evidence.carriedFromDispositionSetId !== node.predecessorDispositionSetId)) {
      context.addIssue({
        code: "custom",
        path: ["settlementEvidence"],
        message: "hosted settlement evidence must bind one lineage node and its direct predecessor",
      });
    }
  }
});

const LocalLaneAttemptBindingSchema = z.strictObject({
  operationId: IdentifierSchema,
  requestId: CanonicalDigestSchema,
  vehicle: ReviewVehicleSchema,
  target: ReviewTargetSchema,
  requestedCoverage: HostedReviewCoverageSchema,
  correctionScope: IncrementalReviewScopeSchema.optional(),
  effectiveCoverage: HostedReviewCoverageSchema.nullable(),
  scopeMode: ReviewScopeModeSchema,
  deliveryAdmission: DeliveryLocalReviewAdmissionSchema.optional(),
}).superRefine((local, context) => {
  const coverageAdmission = LocalReviewCoverageAdmissionSchema.safeParse({
    requestedCoverage: local.requestedCoverage,
    ...(local.correctionScope === undefined ? {} : { correctionScope: local.correctionScope }),
  });
  if (!coverageAdmission.success) {
    context.addIssue({
      code: "custom",
      path: ["requestedCoverage"],
      message: "local lane progress has invalid coverage admission",
    });
  }
  if (local.requestedCoverage === "complete"
    && local.effectiveCoverage !== null
    && local.effectiveCoverage !== "complete") {
    context.addIssue({
      code: "custom",
      path: ["effectiveCoverage"],
      message: "effective coverage must not weaken requested complete coverage",
    });
  }
  if ((local.vehicle.kind === "delivery-member") !== (local.target.kind === "delivery-member")) {
    context.addIssue({
      code: "custom",
      path: ["target", "kind"],
      message: "local delivery-member progress must retain a delivery-member target",
    });
  }
  if (local.deliveryAdmission !== undefined
    && (local.vehicle.kind !== "delivery-member"
      || local.scopeMode !== (local.deliveryAdmission.scopeSelection?.mode ?? "whole-target")
      || canonicalize({
        requestedCoverage: local.requestedCoverage,
        ...(local.correctionScope === undefined ? {} : { correctionScope: local.correctionScope }),
      }) !== canonicalize({
        requestedCoverage: local.deliveryAdmission.requestedCoverage,
        ...(local.deliveryAdmission.correctionScope === undefined
          ? {}
          : { correctionScope: local.deliveryAdmission.correctionScope }),
      })
      || local.vehicle.identity !== local.deliveryAdmission.vehicle.deliverableId
      || local.target.kind !== "delivery-member"
      || local.target.headSha !== local.deliveryAdmission.vehicle.head)) {
    context.addIssue({
      code: "custom",
      path: ["deliveryAdmission"],
      message: "local lane progress does not match its delivery admission",
    });
  }
});

const FrontlineLaneAttemptBindingSchema = z.strictObject({
  admission: FrontlineAdmissionSchema,
  effectiveCoverage: z.literal("complete").nullable(),
});

const LaneAttemptSchema = z.strictObject({
  attemptId: IdentifierSchema,
  logicalPass: z.number().int().positive(),
  retryGeneration: z.number().int().nonnegative(),
  changeRequestId: IdentifierSchema.nullable(),
  headSha: GitObjectIdSchema,
  terminalProducer: z.boolean(),
  sourceId: LaneSourceIdSchema,
  outcome: LaneAttemptOutcomeSchema,
  conditionalPassAuthorizations: ConditionalPassAuthorizationsSchema.optional(),
  // Superseded non-hosted approved sets retain their performed-response evidence in order.
  responsePerformanceHistory: z.array(LaneResponsePerformanceSchema).optional(),
  responsePerformance: LaneResponsePerformanceSchema.optional(),
  chunkSeriesComplete: z.boolean().optional(),
  hosted: HostedLaneAttemptBindingSchema.optional(),
  local: LocalLaneAttemptBindingSchema.optional(),
  frontline: FrontlineLaneAttemptBindingSchema.optional(),
}).superRefine((attempt, context) => {
  const bindingCount = [attempt.hosted, attempt.local, attempt.frontline]
    .filter((binding) => binding !== undefined).length;
  if (bindingCount > 1) {
    context.addIssue({
      code: "custom",
      message: "one lane attempt cannot carry multiple source bindings",
    });
  }
  if (attempt.local !== undefined && attempt.sourceId !== "delegated-agent") {
    context.addIssue({
      code: "custom",
      path: ["sourceId"],
      message: "local attempt source must be delegated-agent",
    });
  }
  if (attempt.local !== undefined && attempt.local.operationId !== attempt.attemptId) {
    context.addIssue({
      code: "custom",
      path: ["local", "operationId"],
      message: "local attempt operation must match its attempt identity",
    });
  }
  if (attempt.hosted !== undefined && !HostedProviderIdSchema.safeParse(attempt.sourceId).success) {
    context.addIssue({
      code: "custom",
      path: ["sourceId"],
      message: "hosted attempt source must be a hosted provider",
    });
  }
  const frontline = attempt.frontline;
  const frontlineSource = frontline?.admission.frontlineReview.source;
  if (frontline !== undefined
    && (frontlineSource === undefined
      || frontlineSource === null
      || attempt.attemptId !== frontline.admission.operationId
      || attempt.logicalPass !== frontline.admission.logicalPass
      || attempt.retryGeneration !== frontline.admission.retryGeneration
      || attempt.headSha !== frontline.admission.target.headSha
      || attempt.sourceId !== frontlineSource.sourceId)) {
    context.addIssue({
      code: "custom",
      path: ["frontline"],
      message: "frontline progress must match its admitted producer",
    });
  }
  if (frontline !== undefined) {
    const complete = attempt.outcome === "clean"
      || attempt.outcome === "findings"
      || attempt.outcome === "settled-findings";
    if (complete !== (frontline.effectiveCoverage === "complete")
      || complete !== attempt.terminalProducer) {
      context.addIssue({
        code: "custom",
        path: ["frontline"],
        message: "frontline coverage and terminal authority must match a complete result",
      });
    }
  }
  const responsePerformances = [
    ...(attempt.responsePerformanceHistory ?? []),
    ...(attempt.responsePerformance === undefined ? [] : [attempt.responsePerformance]),
  ];
  if (responsePerformances.some((performance) => (
    performance.producerId !== attempt.attemptId
      || performance.originatingHeadSha !== attempt.headSha
  ))
    || (responsePerformances.length > 0
      && (!attempt.terminalProducer
        || (attempt.outcome !== "findings" && attempt.outcome !== "settled-findings")))) {
    context.addIssue({
      code: "custom",
      path: ["responsePerformance"],
      message: "lane response performance must bind its terminal findings producer",
    });
  }
  const responseDispositionSetIds = responsePerformances.map(({ dispositionSetId }) => dispositionSetId);
  if (new Set(responseDispositionSetIds).size !== responseDispositionSetIds.length
    || (attempt.responsePerformanceHistory !== undefined
      && attempt.responsePerformanceHistory.length > 0
      && attempt.responsePerformance === undefined)
    || (attempt.hosted !== undefined && (attempt.responsePerformanceHistory?.length ?? 0) > 0)) {
    context.addIssue({
      code: "custom",
      path: ["responsePerformanceHistory"],
      message: "lane response performance history must be unique, retained, and non-hosted",
    });
  }
  if (attempt.hosted === undefined) return;
  try {
    const target = validateReviewTarget(attempt.hosted.reviewTarget);
    validateReviewRequirement(target, attempt.hosted.requirement);
    if (target.headSha !== attempt.hosted.target.headSha) {
      context.addIssue({
        code: "custom",
        path: ["hosted", "target", "headSha"],
        message: "hosted and review targets must identify the same head",
      });
    }
    if ((target.kind === "delivery-member") !== (attempt.hosted.vehicle !== undefined)) {
      context.addIssue({
        code: "custom",
        path: ["hosted", "vehicle"],
        message: "hosted delivery-member targets require one exact delivery vehicle",
      });
    }
    if (attempt.hosted.vehicle !== undefined && attempt.hosted.vehicle.head !== target.headSha) {
      context.addIssue({
        code: "custom",
        path: ["hosted", "vehicle", "head"],
        message: "hosted delivery vehicle must identify the review target head",
      });
    }
    const admission = attempt.hosted.admission;
    if (attempt.logicalPass !== admission.logicalPass
      || attempt.sourceId !== admission.sourceId
      || attempt.headSha !== admission.target.headSha
      || canonicalize(attempt.hosted.target) !== canonicalize(admission.target)
      || attempt.hosted.requestedCoverage !== admission.requestedCoverage
      || canonicalize(attempt.hosted.vehicle ?? null)
        !== canonicalize(admission.vehicle?.kind === "delivery-member" ? admission.vehicle : null)
      || canonicalize(attempt.hosted.reviewTarget) !== canonicalize(admission.reviewTarget)
      || canonicalize(attempt.hosted.requirement) !== canonicalize(admission.requirement)
      || attempt.hosted.actorIdentity !== admission.actorIdentity) {
      throw new Error("hosted lane attempt does not match its durable admission");
    }
    const handle = attempt.hosted.handle;
    const expectedAttemptId = handle === undefined
      ? admission.admissionId
      : hostedLaneAttemptId(handle);
    if (attempt.attemptId !== expectedAttemptId) {
      context.addIssue({
        code: "custom",
        path: ["attemptId"],
        message: handle === undefined
          ? "unacknowledged hosted attempt identity must match its admission"
          : "acknowledged hosted attempt identity must derive from its handle",
      });
    }
    if (handle !== undefined && !hostedRequestHandleMatchesProgress(handle, { admission })) {
      context.addIssue({
        code: "custom",
        path: ["hosted", "handle"],
        message: "hosted request handle does not match its lane-attempt binding",
      });
    }
  } catch (error) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "reviewTarget"],
      message: error instanceof Error ? error.message : "invalid hosted review binding",
    });
  }
  const sealedResult = attempt.hosted.sealedResult;
  const findingIds = sealedResult?.findings.map(({ findingId }) => findingId) ?? [];
  const originalOutcome = attempt.outcome === "settled-findings" ? "findings" : attempt.outcome;
  const verdictBearing = originalOutcome === "clean" || originalOutcome === "findings";
  if (verdictBearing !== (sealedResult !== undefined)
    || verdictBearing !== attempt.terminalProducer
    || (sealedResult !== undefined && sealedResult.outcome !== originalOutcome)) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "sealedResult"],
      message: "hosted terminal authority must exactly match one sealed producer result",
    });
  }
  if (sealedResult !== undefined) {
    const hosted = attempt.hosted;
    if (hosted.handle === undefined) {
      context.addIssue({
        code: "custom",
        path: ["hosted", "sealedResult"],
        message: "hosted sealed result requires its acknowledged execution binding",
      });
    } else {
      const nativeIncremental = hosted.requestedCoverage === "incremental"
        && hosted.effectiveCoverage !== "complete";
      const evidence = sealedResult.coverageEvidence;
      if (nativeIncremental !== (evidence !== undefined)) {
        context.addIssue({
          code: "custom",
          path: ["hosted", "sealedResult", "coverageEvidence"],
          message: nativeIncremental
            ? "provider-native incremental sealed results require coverage evidence"
            : "provider-native coverage evidence belongs only to incremental hosted results",
        });
      }
      if (evidence !== undefined) {
        const scope = hosted.admission.correctionScope;
        const established = evidence.status === "established";
        if (evidence.requestArtifactId !== hosted.handle.artifact.id
          || (established
            && (scope === undefined
              || !scope.predecessorHeadSha.startsWith(evidence.baselineSha)
              || !scope.headSha.startsWith(evidence.headSha)
              || evidence.providerGeneration.updatedAt < hosted.handle.artifact.createdAt))) {
          context.addIssue({
            code: "custom",
            path: ["hosted", "sealedResult", "coverageEvidence"],
            message: "hosted provider evidence does not establish its admitted request generation and range",
          });
        }
        const expectedCoverage = established ? "incremental" : null;
        if (hosted.effectiveCoverage !== expectedCoverage) {
          context.addIssue({
            code: "custom",
            path: ["hosted", "effectiveCoverage"],
            message: "hosted effective coverage must derive from its sealed provider evidence",
          });
        }
      } else if (hosted.effectiveCoverage !== hosted.handle.effectiveCoverage) {
        context.addIssue({
          code: "custom",
          path: ["hosted", "effectiveCoverage"],
          message: "hosted effective coverage must derive from its acknowledged carrier result",
        });
      }
      const expectedResultId = computeHostedResultId({
        attemptId: attempt.attemptId,
        admission: hosted.admission,
        handle: hosted.handle,
        target: hosted.target,
        requestedCoverage: hosted.requestedCoverage,
        effectiveCoverage: hosted.effectiveCoverage,
        ...(hosted.vehicle === undefined ? {} : { vehicle: hosted.vehicle }),
        reviewTarget: hosted.reviewTarget,
        requirement: hosted.requirement,
        outcome: sealedResult.outcome,
        reviewUrl: sealedResult.reviewUrl,
        findings: sealedResult.findings,
        ...(sealedResult.coverageEvidence === undefined
          ? {}
          : { coverageEvidence: sealedResult.coverageEvidence }),
      });
      if (sealedResult.hostedResultId !== expectedResultId) {
        context.addIssue({
          code: "custom",
          path: ["hosted", "sealedResult", "hostedResultId"],
          message: "hosted result identity does not match its canonical producer content",
        });
      }
    }
  } else if (attempt.hosted.effectiveCoverage !== null) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "effectiveCoverage"],
      message: "hosted effective coverage requires one sealed terminal result",
    });
  }
  if (new Set(attempt.hosted.settledFindingIds).size !== attempt.hosted.settledFindingIds.length
    || attempt.hosted.settledFindingIds.some((findingId) => !findingIds.includes(findingId))) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "settledFindingIds"],
      message: "settled hosted finding IDs must be a unique subset of the attempt findings",
    });
  }
  if (attempt.hosted.dispositionSetId === null && attempt.hosted.settledFindingIds.length > 0) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "dispositionSetId"],
      message: "hosted findings cannot settle before an approved disposition set is bound",
    });
  }
  if (attempt.hosted.settlementEvidence.some((evidence) => !findingIds.includes(evidence.findingId))) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "settlementEvidence"],
      message: "hosted settlement evidence must reference an attempt finding",
    });
  }
  for (const [index, node] of attempt.hosted.dispositionSetLineage.entries()) {
    const actionFindingIds = node.findingActions.map(({ findingId }) => findingId).sort();
    if (canonicalize(actionFindingIds) !== canonicalize([...findingIds].sort())) {
      context.addIssue({
        code: "custom",
        path: ["hosted", "dispositionSetLineage", index, "findingActions"],
        message: "hosted disposition-set actions must exactly cover the attempt findings",
      });
    }
  }
  const currentEvidenceFindingIds = attempt.hosted.dispositionSetId === null
    ? []
    : attempt.hosted.settlementEvidence
      .filter(({ dispositionSetId }) => dispositionSetId === attempt.hosted?.dispositionSetId)
      .map(({ findingId }) => findingId)
      .sort();
  if (canonicalize(currentEvidenceFindingIds)
    !== canonicalize([...attempt.hosted.settledFindingIds].sort())) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "settlementEvidence"],
      message: "current hosted settlement IDs must have exact current-set evidence",
    });
  }
  if ((attempt.outcome === "terminal-failure") !== (attempt.hosted.requestFailureReason !== null)) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "requestFailureReason"],
      message: "hosted terminal request failure must retain exactly one reason",
    });
  }
  const currentNode = attempt.hosted.dispositionSetLineage.at(-1);
  const dispositionHasFix = currentNode?.findingActions.some(({ disposition }) => disposition === "fix") ?? false;
  const responseComplete = !dispositionHasFix
    || attempt.responsePerformance?.dispositionSetId === attempt.hosted.dispositionSetId;
  const complete = findingIds.length > 0
    && attempt.hosted.settledFindingIds.length === findingIds.length
    && responseComplete;
  if ((attempt.outcome === "settled-findings") !== complete) {
    context.addIssue({
      code: "custom",
      path: ["outcome"],
      message: "settled-findings must exactly match complete hosted finding settlement",
    });
  }
});

export const LaneProgressStateSchema = z.strictObject({
  ...OperationEnvelopeShape,
  kind: z.literal("lane-progress"),
  lane: z.enum(["frontline", "standard"]),
  repositoryId: IdentifierSchema,
  lineage: LaneSubjectLineageSchema,
  completedPasses: z.number().int().nonnegative(),
  attempts: z.array(LaneAttemptSchema),
}).superRefine((state, context) => {
  const hostedAdmissionIds = state.attempts.flatMap((attempt) => (
    attempt.hosted === undefined ? [] : [attempt.hosted.admission.admissionId]
  ));
  if (new Set(hostedAdmissionIds).size !== hostedAdmissionIds.length) {
    context.addIssue({
      code: "custom",
      path: ["attempts"],
      message: "hosted admission identities must be unique within lane progress",
    });
  }
  state.attempts.forEach((attempt, index) => {
    for (const [authorizationIndex, authorization] of
      (attempt.conditionalPassAuthorizations?.authorizations ?? []).entries()) {
      if (authorization.repositoryId !== state.repositoryId
        || authorization.lane !== state.lane
        || !laneSubjectOwnerMatches(authorization.lineage, state.lineage)
        || authorization.producerId !== attempt.attemptId
        || authorization.originatingHeadSha !== attempt.headSha
        || authorization.exhaustedPassCount !== attempt.logicalPass
        || authorization.nextPass !== attempt.logicalPass + 1
        || !attempt.terminalProducer) {
        context.addIssue({
          code: "custom",
          path: ["attempts", index, "conditionalPassAuthorizations", "authorizations", authorizationIndex],
          message: "conditional pass authorization must bind its terminal producer and lane owner",
        });
      }
    }
    if (state.lane === "frontline" && attempt.frontline === undefined) {
      context.addIssue({
        code: "custom",
        path: ["attempts", index, "frontline"],
        message: "frontline lane attempts require durable admission",
      });
    }
    if (state.lineage.kind === "head-bound"
      && state.lineage.vehicleKind === "review-target"
      && attempt.headSha !== state.lineage.headSha) {
      context.addIssue({
        code: "custom",
        path: ["attempts", index, "headSha"],
        message: "attempt target must remain inside its head-bound lineage",
      });
    }
    const deliveryVehicle = attempt.hosted?.vehicle;
    const localDeliverableId = attempt.local?.vehicle.kind === "delivery-member"
      ? attempt.local.vehicle.identity
      : null;
    if (state.lineage.kind === "delivery-member") {
      const hostedMatches = deliveryVehicle === undefined
        || (deliveryVehicle.planId === state.lineage.planId
          && deliveryVehicle.workUnitId === state.lineage.workUnitId
          && deliveryVehicle.deliverableId === state.lineage.deliverableId);
      const localMatches = localDeliverableId === null
        || localDeliverableId === state.lineage.deliverableId;
      if (!hostedMatches || !localMatches) {
        context.addIssue({
          code: "custom",
          path: ["attempts", index],
          message: "delivery attempt must remain inside its member lineage",
        });
      }
    }
    if (attempt.local !== undefined) {
      if (attempt.terminalProducer
        && attempt.local.effectiveCoverage !== attempt.local.requestedCoverage) {
        context.addIssue({
          code: "custom",
          path: ["attempts", index, "local", "effectiveCoverage"],
          message: "terminal local coverage must equal its admitted requested coverage",
        });
      }
      if (!attempt.terminalProducer && attempt.local.effectiveCoverage !== null) {
        context.addIssue({
          code: "custom",
          path: ["attempts", index, "local", "effectiveCoverage"],
          message: "nonterminal local attempts cannot claim effective coverage",
        });
      }
    }
    if (attempt.frontline !== undefined
      && (state.lane !== "frontline"
        || attempt.frontline.admission.target.repositoryId !== state.repositoryId
        || !laneSubjectOwnerMatches(attempt.frontline.admission.lineage, state.lineage))) {
      context.addIssue({
        code: "custom",
        path: ["attempts", index, "frontline"],
        message: "frontline attempt must remain inside its lane owner",
      });
    }
    if (attempt.hosted !== undefined
      && (!laneSubjectOwnerMatches(attempt.hosted.admission.lineage, state.lineage)
        || attempt.hosted.admission.repositoryId !== state.repositoryId)) {
      context.addIssue({
        code: "custom",
        path: ["attempts", index, "hosted", "admission"],
        message: "hosted attempt must remain inside its lane owner",
      });
    }
  });
  const pendingPasses = state.attempts
    .filter(({ outcome }) => outcome === "pending")
    .map(({ logicalPass }) => logicalPass);
  if (new Set(pendingPasses).size !== pendingPasses.length) {
    context.addIssue({
      code: "custom",
      path: ["attempts"],
      message: "a logical pass may have only one pending source attempt",
    });
  }
  const terminalPasses = state.attempts
    .filter(({ terminalProducer }) => terminalProducer)
    .map(({ logicalPass }) => logicalPass);
  const terminalPassSet = new Set(terminalPasses);
  if (pendingPasses.some((logicalPass) => terminalPassSet.has(logicalPass))) {
    context.addIssue({
      code: "custom",
      path: ["attempts"],
      message: "a logical pass cannot retain a pending source after its terminal producer",
    });
  }
  if (new Set(terminalPasses).size !== terminalPasses.length) {
    context.addIssue({
      code: "custom",
      path: ["attempts"],
      message: "a logical pass may have only one authoritative terminal producer",
    });
  }
  if (state.completedPasses !== new Set(terminalPasses).size) {
    context.addIssue({
      code: "custom",
      path: ["completedPasses"],
      message: "completed passes must equal authoritative terminal claims",
    });
  }
});
export type LaneProgressState = z.infer<typeof LaneProgressStateSchema>;

export const ReviewOperationStateSchema = z.discriminatedUnion("kind", [
  FrontlineRunStateSchema,
  ReviewSuspensionStateSchema,
  LocalReviewStateSchema,
  LaneProgressStateSchema,
]);
export type ReviewOperationState = z.infer<typeof ReviewOperationStateSchema>;

/** Register resumable operation records separately from gate evidence. */
export function registerReviewOperationStateSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(FrontlineRunStateSchema, {
    id: "frontline-run-state",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewSuspensionStateSchema, {
    id: "review-suspension-state",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(LocalReviewStateSchema, {
    id: "local-review-state",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(LaneProgressStateSchema, {
    id: "lane-progress-state",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewOperationStateSchema, {
    id: "review-operation-state",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
