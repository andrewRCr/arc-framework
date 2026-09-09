/** Registered non-evidentiary state for resumable review operations. */

import { z } from "zod";

import { canonicalize, type KernelRegistry } from "../../../lib/kernel/index.js";
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
import { HostedFindingSchema } from "../hosted/await.js";
import {
  HostedAdmissionSchema,
  HostedProviderIdSchema,
  HostedRequestHandleSchema,
  HostedReviewCoverageSchema,
  HostedTargetSchema,
  hostedRequestHandleMatchesProgress,
} from "../hosted/request.js";
import { DeliveryLocalReviewAdmissionSchema } from "../policy/delivery-local-review-admission.js";
import { laneSubjectLineageId, LaneSubjectLineageSchema } from "./lane-admission.js";
import { StandardReviewGuidanceProjectionSchema } from "../policy/standard-review-guidance.js";

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
  lineage: LaneSubjectLineageSchema,
  logicalPass: z.number().int().positive(),
  retryGeneration: z.number().int().nonnegative(),
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
  findings: z.array(HostedFindingSchema),
  dispositionSetId: CanonicalDigestSchema.nullable(),
  settledFindingIds: z.array(z.string().trim().min(1)),
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
});

const LocalLaneAttemptBindingSchema = z.strictObject({
  operationId: IdentifierSchema,
  requestId: CanonicalDigestSchema,
  vehicle: ReviewVehicleSchema,
  target: ReviewTargetSchema,
  requestedCoverage: HostedReviewCoverageSchema,
  effectiveCoverage: HostedReviewCoverageSchema.nullable(),
  deliveryAdmission: DeliveryLocalReviewAdmissionSchema.optional(),
}).superRefine((local, context) => {
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
    if (handle !== undefined && !hostedRequestHandleMatchesProgress(handle, {
      admission,
      effectiveCoverage: attempt.hosted.effectiveCoverage,
    })) {
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
  const findingIds = attempt.hosted.findings.map(({ findingId }) => findingId);
  if (new Set(findingIds).size !== findingIds.length) {
    context.addIssue({ code: "custom", path: ["hosted", "findings"], message: "hosted finding IDs must be unique" });
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
  if ((attempt.outcome === "terminal-failure") !== (attempt.hosted.requestFailureReason !== null)) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "requestFailureReason"],
      message: "hosted terminal request failure must retain exactly one reason",
    });
  }
  const complete = findingIds.length > 0 && attempt.hosted.settledFindingIds.length === findingIds.length;
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
  state.attempts.forEach((attempt, index) => {
    if (state.lane === "frontline" && attempt.frontline === undefined) {
      context.addIssue({
        code: "custom",
        path: ["attempts", index, "frontline"],
        message: "frontline lane attempts require durable admission",
      });
    }
    if (state.lineage.kind === "head-bound" && attempt.headSha !== state.lineage.headSha) {
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
    if (attempt.frontline !== undefined
      && (state.lane !== "frontline"
        || attempt.frontline.admission.target.repositoryId !== state.repositoryId
        || laneSubjectLineageId(attempt.frontline.admission.lineage) !== laneSubjectLineageId(state.lineage))) {
      context.addIssue({
        code: "custom",
        path: ["attempts", index, "frontline"],
        message: "frontline attempt must remain inside its lane owner",
      });
    }
    if (attempt.hosted !== undefined
      && (laneSubjectLineageId(attempt.hosted.admission.lineage) !== laneSubjectLineageId(state.lineage)
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
