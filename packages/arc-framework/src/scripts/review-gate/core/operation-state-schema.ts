/** Registered non-evidentiary state for resumable review operations. */

import { z } from "zod";
import { CanonicalDigestSchema } from "../../../lib/kernel/schema/vocabulary.js";

import { canonicalDigest, canonicalize, type CanonicalDigest, type KernelRegistry } from "../../../lib/kernel/index.js";
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
import { validateLaneProgressState } from "./lane-progress-state-validation.js";
import { validateLaneAttempt } from "./lane-attempt-validation.js";
import { BoundFrontlineResponseBindingSchema } from "./frontline-response-binding.js";
import {
  HostedCoverageEvidenceSchema,
  HostedFindingsSchema,
} from "../hosted/await.js";
import {
  HostedAdmissionSchema,
  HostedRequestHandleSchema,
  HostedReviewCoverageSchema,
  HostedTargetSchema,
} from "../hosted/request.js";
import { DeliveryLocalReviewAdmissionSchema } from "../policy/delivery-local-review-admission.js";
import {
  laneSubjectLineageId,
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
import { ReviewRubricIdentitySchema } from "../policy/standard-review-schema.js";

const IdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u);
const OperationEnvelopeShape = {
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("review-operation/v1"),
  operationId: IdentifierSchema,
  updatedAt: z.iso.datetime({ offset: true }),
};
const ReviewVehicleSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("work-unit"), identity: IdentifierSchema }),
  // Older local attempts have no claim binding; readers must not let them settle a new Errand claim.
  z.strictObject({ kind: z.literal("errand"), identity: IdentifierSchema, claimId: IdentifierSchema.optional() }),
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
  responseBinding: BoundFrontlineResponseBindingSchema.optional(),
});
export type FrontlineRunState = z.infer<typeof FrontlineRunStateSchema>;

/** Durable singleton Candidate phase closure for an accepted initial frontline skip. */
export const FrontlinePhaseStateSchema = z.strictObject({
  ...OperationEnvelopeShape,
  kind: z.literal("frontline-phase"),
  repositoryId: IdentifierSchema,
  candidateId: CanonicalDigestSchema,
  closedBy: z.literal("initial-skip"),
});
export type FrontlinePhaseState = z.infer<typeof FrontlinePhaseStateSchema>;

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
    if (state.deliveryAdmission !== undefined && !localStateMatchesDeliveryAdmission(state)) {
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

function localStateMatchesDeliveryAdmission(state: LocalReviewState): boolean {
  const admission = state.deliveryAdmission;
  if (admission === undefined) return true;
  return state.laneSourceId === admission.sourceId
    && state.scopeMode === (admission.scopeSelection?.mode ?? "whole-target")
    && canonicalize(state.coverageAdmission) === canonicalize({
      requestedCoverage: admission.requestedCoverage,
      ...(admission.correctionScope === undefined ? {} : { correctionScope: admission.correctionScope }),
    })
    && state.vehicle.kind === "delivery-member"
    && state.vehicle.identity === admission.vehicle.deliverableId
    && state.target.kind === "delivery-member"
    && state.target.headSha === admission.vehicle.head;
}

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
): CanonicalDigest {
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
  /** Immutable digest of the complete performed Candidate response, when the owner is a Candidate. */
  candidateResponseId: CanonicalDigestSchema.optional(),
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
export function computeHostedResultId(input: HostedResultDigestPreimage): CanonicalDigest {
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
  validateHostedSettlementEvidence(hosted, context);
});

function validateHostedSettlementEvidence(
  hosted: z.infer<typeof HostedLaneAttemptBindingSchema>,
  context: z.RefinementCtx,
): void {
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
}

const LocalLaneAttemptBindingSchema = z.strictObject({
  operationId: IdentifierSchema,
  requestId: CanonicalDigestSchema,
  vehicle: ReviewVehicleSchema,
  target: ReviewTargetSchema,
  requestedCoverage: HostedReviewCoverageSchema,
  correctionScope: IncrementalReviewScopeSchema.optional(),
  effectiveCoverage: HostedReviewCoverageSchema.nullable(),
  scopeMode: ReviewScopeModeSchema,
  // Older attempts remain readable but cannot settle a current rubric without this binding.
  rubricIdentity: ReviewRubricIdentitySchema.optional(),
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
  if (local.deliveryAdmission !== undefined && !localAttemptMatchesDeliveryAdmission(local)) {
    context.addIssue({
      code: "custom",
      path: ["deliveryAdmission"],
      message: "local lane progress does not match its delivery admission",
    });
  }
});

function localAttemptMatchesDeliveryAdmission(local: z.infer<typeof LocalLaneAttemptBindingSchema>): boolean {
  const admission = local.deliveryAdmission;
  if (admission === undefined) return true;
  return local.vehicle.kind === "delivery-member"
    && local.scopeMode === (admission.scopeSelection?.mode ?? "whole-target")
    && canonicalize({
      requestedCoverage: local.requestedCoverage,
      ...(local.correctionScope === undefined ? {} : { correctionScope: local.correctionScope }),
    }) === canonicalize({
      requestedCoverage: admission.requestedCoverage,
      ...(admission.correctionScope === undefined ? {} : { correctionScope: admission.correctionScope }),
    })
    && local.vehicle.identity === admission.vehicle.deliverableId
    && local.target.kind === "delivery-member"
    && local.target.headSha === admission.vehicle.head;
}

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
  validateLaneAttempt(attempt, context, computeHostedResultId);
});

export const LaneProgressStateSchema = z.strictObject({
  ...OperationEnvelopeShape,
  kind: z.literal("lane-progress"),
  lane: z.enum(["frontline", "standard"]),
  repositoryId: IdentifierSchema,
  lineage: LaneSubjectLineageSchema,
  completedPasses: z.number().int().nonnegative(),
  attempts: z.array(LaneAttemptSchema),
}).superRefine(validateLaneProgressState);
export type LaneProgressState = z.infer<typeof LaneProgressStateSchema>;

export const ReviewOperationStateSchema = z.discriminatedUnion("kind", [
  FrontlineRunStateSchema,
  FrontlinePhaseStateSchema,
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
  registry.register(FrontlinePhaseStateSchema, {
    id: "frontline-phase-state",
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
