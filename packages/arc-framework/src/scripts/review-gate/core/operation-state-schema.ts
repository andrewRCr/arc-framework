/** Registered non-evidentiary state for resumable review operations. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
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
import { BoundFrontlineResponseBindingSchema } from "./frontline-response-binding.js";
import { HostedFindingSchema } from "../hosted/await.js";
import {
  HostedProviderIdSchema,
  HostedRequestHandleSchema,
  HostedReviewCoverageSchema,
  HostedTargetSchema,
  hostedRequestHandleMatchesProgress,
} from "../hosted/request.js";
import { DeliveryLocalReviewAdmissionSchema } from "../policy/delivery-local-review-admission.js";

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
  targetId: CanonicalDigestSchema,
  sourceIdentity: IdentifierSchema,
  generation: z.number().int().nonnegative(),
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
  passCount: z.number().int().nonnegative(),
  policyVersion: CanonicalDigestSchema,
  sourceBindingId: CanonicalDigestSchema,
  responseBinding: BoundFrontlineResponseBindingSchema.optional(),
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
  deliveryAdmission: DeliveryLocalReviewAdmissionSchema.optional(),
  policyVersion: CanonicalDigestSchema,
  policyBindingDigest: CanonicalDigestSchema,
  attestationRuntimeKind: IdentifierSchema,
  sourceRef: z.string().trim().min(1),
  sourceDigest: CanonicalDigestSchema,
  guidanceDigest: CanonicalDigestSchema,
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
  handle: HostedRequestHandleSchema.optional(),
  target: HostedTargetSchema,
  requestedCoverage: HostedReviewCoverageSchema,
  effectiveCoverage: HostedReviewCoverageSchema.nullable(),
  vehicle: DeliveryReviewMemberVehicleSchema.optional(),
  reviewTarget: ReviewTargetSchema,
  requirement: ReviewRequirementV2Schema,
  actorIdentity: IdentifierSchema,
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
  vehicle: ReviewVehicleSchema,
  target: ReviewTargetSchema,
  deliveryAdmission: DeliveryLocalReviewAdmissionSchema.optional(),
}).superRefine((local, context) => {
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

const LaneAttemptSchema = z.strictObject({
  attemptId: IdentifierSchema,
  sourceId: LaneSourceIdSchema,
  outcome: LaneAttemptOutcomeSchema,
  chunkSeriesComplete: z.boolean().optional(),
  hosted: HostedLaneAttemptBindingSchema.optional(),
  local: LocalLaneAttemptBindingSchema.optional(),
}).superRefine((attempt, context) => {
  if (attempt.hosted !== undefined && attempt.local !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["local"],
      message: "one lane attempt cannot carry both hosted and local progress",
    });
  }
  if (attempt.local !== undefined && attempt.sourceId !== "delegated-agent") {
    context.addIssue({
      code: "custom",
      path: ["sourceId"],
      message: "local attempt source must be delegated-agent",
    });
  }
  if (attempt.hosted !== undefined && !HostedProviderIdSchema.safeParse(attempt.sourceId).success) {
    context.addIssue({
      code: "custom",
      path: ["sourceId"],
      message: "hosted attempt source must be a hosted provider",
    });
  }
  if (attempt.outcome === "pending" && attempt.hosted?.handle === undefined) {
    context.addIssue({
      code: "custom",
      path: ["hosted", "handle"],
      message: "a pending hosted attempt requires its complete request handle",
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
    const handle = attempt.hosted.handle;
    if (handle !== undefined && !hostedRequestHandleMatchesProgress(handle, {
      sourceId: attempt.sourceId,
      target: attempt.hosted.target,
      requestedCoverage: attempt.hosted.requestedCoverage,
      effectiveCoverage: attempt.hosted.effectiveCoverage,
      ...(attempt.hosted.vehicle === undefined ? {} : { vehicle: attempt.hosted.vehicle }),
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
  changeRequestId: IdentifierSchema.nullable(),
  headSha: GitObjectIdSchema,
  completedPasses: z.number().int().nonnegative(),
  attempts: z.array(LaneAttemptSchema),
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
