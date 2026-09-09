/** Typed request contract for hosted pull-request review sources. */

import { z } from "zod";

import { canonicalDigest, canonicalize } from "../../../lib/kernel/index.js";
import {
  DeliveryReviewMemberVehicleSchema,
  type DeliveryReviewMemberVehicle,
} from "../../../lib/delivery/review-vehicle.js";
import type { DeliveryMemberLookup } from "../core/delivery-member-lookup.js";
import { StandardReviewObligationProjectionSchema } from
  "../policy/standard-review-projection-schema.js";
import {
  ReviewCeilingOverrideSchema,
  type ReviewCeilingOverride,
} from "../policy/review-policy-driver.js";
import {
  ReviewIdentifierSchema,
  ReviewRequirementV2Schema,
  ReviewTargetSchema,
} from "../core/gate-contract-v2-schema.js";
import {
  validateReviewRequirement,
  validateReviewTarget,
} from "../core/gate-contract-v2.js";
import { LaneSubjectLineageSchema } from "../core/lane-admission.js";

const GitHubObjectIdSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const ReviewSourceIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);

export const HostedProviderIdSchema = z.enum(["coderabbit-pr", "codex-pr"]);
export type HostedProviderId = z.infer<typeof HostedProviderIdSchema>;

export const HostedReviewCoverageSchema = z.enum(["complete", "incremental"]);
export type HostedReviewCoverage = z.infer<typeof HostedReviewCoverageSchema>;

export const HostedTargetSchema = z.strictObject({
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
  pullRequest: z.int().positive(),
  headSha: GitHubObjectIdSchema,
});
export type HostedTarget = z.infer<typeof HostedTargetSchema>;

export const HostedArtifactSchema = z.strictObject({
  kind: z.enum(["issue-comment", "pull-request-review"]),
  id: z.string().min(1),
  url: z.url(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type HostedArtifact = z.infer<typeof HostedArtifactSchema>;

export const HostedErrandRequestVehicleSchema = z.strictObject({
  kind: z.literal("errand"),
  standardReview: StandardReviewObligationProjectionSchema,
});
export type HostedErrandRequestVehicle = z.infer<typeof HostedErrandRequestVehicleSchema>;

export const HostedDeliveryMemberRequestVehicleSchema = DeliveryReviewMemberVehicleSchema;
export type HostedDeliveryMemberRequestVehicle = DeliveryReviewMemberVehicle;

export const HostedRequestVehicleSchema = z.discriminatedUnion("kind", [
  HostedErrandRequestVehicleSchema,
  HostedDeliveryMemberRequestVehicleSchema,
]);
export type HostedRequestVehicle = z.infer<typeof HostedRequestVehicleSchema>;

export const HostedErrandProgressBindingSchema = z.strictObject({
  kind: z.literal("errand"),
  key: z.string().trim().min(1),
  claimId: z.string().trim().min(1),
  branch: z.string().trim().min(1),
  sources: z.array(ReviewSourceIdSchema).min(1).readonly(),
  standardReview: StandardReviewObligationProjectionSchema,
});
export type HostedErrandProgressBinding = z.infer<typeof HostedErrandProgressBindingSchema>;

export const HostedProgressVehicleSchema = z.discriminatedUnion("kind", [
  HostedErrandProgressBindingSchema,
  DeliveryReviewMemberVehicleSchema,
]);
export type HostedProgressVehicle = z.infer<typeof HostedProgressVehicleSchema>;

const HostedAdmissionPreimageSchema = z.strictObject({
  schemaVersion: z.literal(1),
  repositoryId: ReviewIdentifierSchema,
  lineage: LaneSubjectLineageSchema,
  logicalPass: z.number().int().positive(),
  sourceId: HostedProviderIdSchema,
  target: HostedTargetSchema,
  requestedCoverage: HostedReviewCoverageSchema,
  vehicle: HostedProgressVehicleSchema.optional(),
  reviewTarget: ReviewTargetSchema,
  requirement: ReviewRequirementV2Schema,
  actorIdentity: ReviewIdentifierSchema,
});

export const HostedAdmissionSchema = HostedAdmissionPreimageSchema.extend({
  admissionId: ReviewIdentifierSchema,
}).superRefine((admission, context) => {
  try {
    const target = validateReviewTarget(admission.reviewTarget);
    validateReviewRequirement(target, admission.requirement);
    if (target.repositoryId !== admission.repositoryId || target.headSha !== admission.target.headSha) {
      throw new Error("hosted admission target does not match its lane owner or change request");
    }
    const acceptable = admission.requirement.acceptableSources.some((source) => (
      source.sourceKind === "hosted" && source.qualifier === admission.sourceId
    ));
    if (!acceptable) throw new Error("hosted admission source is not accepted by its requirement");
    const deliveryVehicle = admission.vehicle?.kind === "delivery-member" ? admission.vehicle : undefined;
    if ((target.kind === "delivery-member") !== (deliveryVehicle !== undefined)) {
      throw new Error("hosted delivery admission requires one exact delivery vehicle");
    }
    if (deliveryVehicle !== undefined
      && (admission.lineage.kind !== "delivery-member"
        || admission.lineage.planId !== deliveryVehicle.planId
        || admission.lineage.workUnitId !== deliveryVehicle.workUnitId
        || admission.lineage.deliverableId !== deliveryVehicle.deliverableId
        || deliveryVehicle.head !== target.headSha)) {
      throw new Error("hosted delivery admission does not match its member lineage");
    }
    if (admission.vehicle?.kind === "errand" && admission.lineage.kind !== "head-bound") {
      throw new Error("hosted Errand admission requires one head-bound lineage");
    }
  } catch (error) {
    context.addIssue({
      code: "custom",
      path: ["reviewTarget"],
      message: error instanceof Error ? error.message : "invalid hosted admission",
    });
  }
  const { admissionId: _admissionId, ...preimage } = admission;
  void _admissionId;
  const expectedId = hostedAdmissionId(preimage);
  if (admission.admissionId !== expectedId) {
    context.addIssue({
      code: "custom",
      path: ["admissionId"],
      message: "hosted admission identity does not match its canonical binding",
    });
  }
});
export type HostedAdmission = z.infer<typeof HostedAdmissionSchema>;

/** Derive one source-specific hosted admission identity before dispatch. */
export function hostedAdmissionId(input: z.infer<typeof HostedAdmissionPreimageSchema>): string {
  return `hosted-admission/${canonicalDigest({
    domain: "arc.review.hosted-admission/v1",
    admission: HostedAdmissionPreimageSchema.parse(input),
  }).slice("sha256:".length)}`;
}

/** Create one complete hosted admission from runtime-resolved authority. */
export function createHostedAdmission(
  input: z.infer<typeof HostedAdmissionPreimageSchema>,
): HostedAdmission {
  const preimage = HostedAdmissionPreimageSchema.parse(input);
  return HostedAdmissionSchema.parse({ ...preimage, admissionId: hostedAdmissionId(preimage) });
}

export const HostedRequestHandleSchema = z.strictObject({
  schemaVersion: z.literal(1),
  provider: HostedProviderIdSchema,
  requestedCoverage: HostedReviewCoverageSchema,
  effectiveCoverage: HostedReviewCoverageSchema,
  target: HostedTargetSchema,
  artifact: HostedArtifactSchema,
  vehicle: HostedProgressVehicleSchema.optional(),
  admission: HostedAdmissionSchema,
}).superRefine((handle, context) => {
  if (handle.requestedCoverage === "complete" && handle.effectiveCoverage !== "complete") {
    context.addIssue({
      code: "custom",
      message: "effective coverage must not weaken requested complete coverage",
      path: ["effectiveCoverage"],
    });
  }
  if (handle.provider !== handle.admission.sourceId
    || handle.requestedCoverage !== handle.admission.requestedCoverage
    || canonicalize(handle.target) !== canonicalize(handle.admission.target)
    || canonicalize(handle.vehicle ?? null) !== canonicalize(handle.admission.vehicle ?? null)) {
    context.addIssue({
      code: "custom",
      message: "hosted request handle does not match its admitted request",
      path: ["admission"],
    });
  }
});
export type HostedRequestHandle = z.infer<typeof HostedRequestHandleSchema>;

/** Resolve the stable lane-attempt identity of one acknowledged hosted request. */
export function hostedLaneAttemptId(handle: HostedRequestHandle): string {
  return `hosted/${canonicalDigest(HostedRequestHandleSchema.parse(handle)).slice("sha256:".length)}`;
}

/** Submit-ready input for one bounded await of an acknowledged hosted request. */
export const HostedAwaitActionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  handle: HostedRequestHandleSchema,
}).readonly();
export type HostedAwaitAction = z.infer<typeof HostedAwaitActionSchema>;

/**
 * Project an acknowledged hosted request into the next command's exact input.
 *
 * @param handle - Durable identity and target binding for the acknowledged request.
 * @returns A schema-validated action accepted directly by the hosted-await command.
 */
export function hostedAwaitAction(handle: HostedRequestHandle): HostedAwaitAction {
  return HostedAwaitActionSchema.parse({ schemaVersion: 1, handle });
}

/** Compare a durable hosted request handle with its lane-progress binding. */
export function hostedRequestHandleMatchesProgress(
  handle: HostedRequestHandle,
  progress: {
    readonly admission: HostedAdmission;
    readonly effectiveCoverage: HostedReviewCoverage | null;
  },
): boolean {
  return canonicalize(handle.admission) === canonicalize(progress.admission)
    && handle.effectiveCoverage === progress.effectiveCoverage
    && canonicalize(handle.vehicle ?? null) === canonicalize(progress.admission.vehicle ?? null);
}

export interface HostedRequestEnvelope {
  schemaVersion: 1;
  target: HostedTarget;
  provider: HostedProviderId;
  coverage: HostedReviewCoverage;
  vehicle?: HostedRequestVehicle;
  invocation?: { readonly mode: "force"; readonly sourceId: string };
  ceilingOverride?: ReviewCeilingOverride;
}

export const HostedRequestEnvelopeSchema: z.ZodType<HostedRequestEnvelope> = z.strictObject({
  schemaVersion: z.literal(1),
  target: HostedTargetSchema,
  provider: HostedProviderIdSchema,
  coverage: HostedReviewCoverageSchema,
  vehicle: HostedRequestVehicleSchema.optional(),
  invocation: z.strictObject({
    mode: z.literal("force"),
    sourceId: ReviewSourceIdSchema,
  }).readonly().optional(),
  ceilingOverride: ReviewCeilingOverrideSchema.optional(),
}).superRefine((request, context) => {
  if (request.invocation !== undefined && request.invocation.sourceId !== request.provider) {
    context.addIssue({
      code: "custom",
      path: ["invocation", "sourceId"],
      message: "hosted source invocation must select the request provider",
    });
  }
});

export type HostedRequestOutcome =
  | {
    kind: "created";
    artifact: HostedArtifact;
    effectiveCoverage: HostedReviewCoverage;
  }
  | { kind: "rate-limited" | "transient-unavailable" }
  | { kind: "ambiguous-delivery" }
  | { kind: "terminal-failure"; reason: string };

export interface HostedReviewAdapter {
  id: HostedProviderId;
  identities: {
    botUserId: string;
    appId?: string;
  };
  request(target: HostedTarget, coverage: HostedReviewCoverage): Promise<HostedRequestOutcome>;
}

function resolveErrandBinding(
  vehicle: HostedErrandRequestVehicle,
  binding: HostedErrandProgressBinding | undefined,
): HostedErrandProgressBinding {
  const resolved = HostedErrandProgressBindingSchema.parse(binding);
  if (canonicalize(vehicle.standardReview) !== canonicalize(resolved.standardReview)) {
    throw new Error("Hosted Errand progress binding does not match the requested standard-review obligation.");
  }
  return resolved;
}

async function validateDeliveryMemberBinding(
  vehicle: HostedDeliveryMemberRequestVehicle,
  targetHead: string,
  lookup: DeliveryMemberLookup | undefined,
): Promise<void> {
  if (vehicle.head !== targetHead) {
    throw new Error("Hosted delivery-member binding does not match the requested exact head.");
  }
  if (lookup === undefined) throw new Error("Hosted delivery-member binding is unavailable.");
  const resolution = await lookup.resolveMemberByVehicle(vehicle);
  if (resolution.status === "unavailable") throw new Error("Hosted delivery-member binding is unavailable.");
  if (resolution.status === "unbound") throw new Error("Hosted delivery-member binding is unbound.");
  if (resolution.member.planId !== vehicle.planId
    || resolution.member.deliverableId !== vehicle.deliverableId
    || resolution.member.workUnitId !== vehicle.workUnitId
    || resolution.member.head !== vehicle.head) {
    throw new Error("Hosted delivery-member binding does not match the requested member.");
  }
}

const HostedRequestResultBaseShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-hosted-request"),
  requestedCoverage: HostedReviewCoverageSchema,
  attemptedProviders: z.array(HostedProviderIdSchema).min(1),
};

export const HostedRequestResultSchema = z.union([
  z.strictObject({
    ...HostedRequestResultBaseShape,
    state: z.literal("requested"),
    nextAction: z.literal("await"),
    handle: HostedRequestHandleSchema,
    action: HostedAwaitActionSchema,
  }),
  z.strictObject({
    ...HostedRequestResultBaseShape,
    state: z.literal("source-unavailable"),
    nextAction: z.literal("stop"),
    provider: HostedProviderIdSchema,
  }),
  z.strictObject({
    ...HostedRequestResultBaseShape,
    state: z.enum(["rate-limited", "transient-unavailable"]),
    nextAction: z.literal("try-next-source"),
    provider: HostedProviderIdSchema,
  }),
  z.strictObject({
    ...HostedRequestResultBaseShape,
    state: z.literal("ambiguous-delivery"),
    nextAction: z.literal("stop"),
    provider: HostedProviderIdSchema,
  }),
  z.strictObject({
    ...HostedRequestResultBaseShape,
    state: z.literal("terminal-failure"),
    nextAction: z.literal("stop"),
    provider: HostedProviderIdSchema,
    reason: z.string().min(1),
  }),
]);
export type HostedRequestResult = z.infer<typeof HostedRequestResultSchema>;

export type HostedRequestAdmissionResolution =
  | { readonly state: "admitted"; readonly admission: HostedAdmission }
  | {
    readonly state: "acknowledged";
    readonly handle: HostedRequestHandle;
    readonly action: HostedAwaitAction;
  }
  | { readonly state: "ambiguous-delivery" }
  | {
    readonly state: "concluded";
    readonly result: Extract<HostedRequestResult, { nextAction: "try-next-source" | "stop" }>;
  };

/** Compare one stored admission with the caller-visible request facts that can identify it. */
export function hostedAdmissionMatchesRequest(
  admission: HostedAdmission,
  request: HostedRequestEnvelope,
): boolean {
  const vehicleMatches = request.vehicle?.kind === "errand"
    ? admission.vehicle?.kind === "errand"
      && canonicalize(admission.vehicle.standardReview) === canonicalize(request.vehicle.standardReview)
    : canonicalize(admission.vehicle ?? null) === canonicalize(request.vehicle ?? null);
  return admission.sourceId === request.provider
    && admission.requestedCoverage === request.coverage
    && canonicalize(admission.target) === canonicalize(request.target)
    && vehicleMatches;
}

/**
 * Project a durable admission replay into the hosted-request command result.
 *
 * @param request - The caller-visible request being replayed.
 * @param resolution - The durable admission state found for that request.
 * @returns The replayed command result, or `null` when fresh dispatch may continue.
 */
export function projectHostedRequestAdmissionResolution(
  request: HostedRequestEnvelope,
  resolution: HostedRequestAdmissionResolution,
): HostedRequestResult | null {
  const resultBase = {
    schemaVersion: 1 as const,
    mode: "review-hosted-request" as const,
    requestedCoverage: request.coverage,
    attemptedProviders: [request.provider],
  };
  if (resolution.state === "admitted") return null;
  if (resolution.state === "acknowledged") {
    const handle = HostedRequestHandleSchema.parse(resolution.handle);
    const action = HostedAwaitActionSchema.parse(resolution.action);
    if (!hostedAdmissionMatchesRequest(handle.admission, request)
      || canonicalize(action.handle) !== canonicalize(handle)) {
      throw new Error("Hosted request replay does not match its durable acknowledgment.");
    }
    return HostedRequestResultSchema.parse({
      ...resultBase,
      state: "requested",
      nextAction: "await",
      handle,
      action,
    });
  }
  if (resolution.state === "concluded") {
    const result = HostedRequestResultSchema.parse(resolution.result);
    if (result.nextAction === "await"
      || result.requestedCoverage !== request.coverage
      || result.attemptedProviders.length !== 1
      || result.attemptedProviders[0] !== request.provider
      || result.provider !== request.provider) {
      throw new Error("Hosted request replay does not match its durable conclusion.");
    }
    return result;
  }
  return HostedRequestResultSchema.parse({
    ...resultBase,
    state: "ambiguous-delivery",
    nextAction: "stop",
    provider: request.provider,
  });
}

/** Request one hosted review through caller-supplied durable admission boundaries. */
export async function requestHostedReview(
  input: unknown,
  dependencies: {
    adapters: readonly HostedReviewAdapter[];
    errandBinding?: HostedErrandProgressBinding;
    deliveryMemberLookup?: DeliveryMemberLookup;
    admitRequest?: (
      request: HostedRequestEnvelope,
      progressVehicle: HostedProgressVehicle | undefined,
    ) => Promise<HostedRequestAdmissionResolution>;
    acknowledgeRequest?: (
      admission: HostedAdmission,
      handle: HostedRequestHandle,
    ) => Promise<void>;
    concludeRequest?: (
      admission: HostedAdmission,
      result: Extract<HostedRequestResult, { state:
        | "rate-limited"
        | "transient-unavailable"
        | "ambiguous-delivery"
        | "terminal-failure" }>,
    ) => Promise<void>;
  },
): Promise<HostedRequestResult> {
  const request = HostedRequestEnvelopeSchema.parse(input);
  let progressVehicle: HostedProgressVehicle | undefined;
  if (request.vehicle?.kind === "errand") {
    progressVehicle = resolveErrandBinding(request.vehicle, dependencies.errandBinding);
  } else if (request.vehicle?.kind === "delivery-member") {
    await validateDeliveryMemberBinding(
      request.vehicle,
      request.target.headSha,
      dependencies.deliveryMemberLookup,
    );
    progressVehicle = request.vehicle;
  }
  const attemptedProviders = [request.provider];
  const resultBase = {
    schemaVersion: 1 as const,
    mode: "review-hosted-request" as const,
    requestedCoverage: request.coverage,
    attemptedProviders,
  };
  const adapter = dependencies.adapters.find((candidate) => candidate.id === request.provider);
  if (adapter === undefined) {
    return {
      ...resultBase,
      state: "source-unavailable",
      nextAction: "stop",
      provider: request.provider,
    };
  }

  if (dependencies.admitRequest === undefined) {
    throw new Error("Hosted review dispatch requires capacity-checked durable request admission.");
  }
  const admissionResolution = await dependencies.admitRequest(request, progressVehicle);
  const replay = projectHostedRequestAdmissionResolution(request, admissionResolution);
  if (replay !== null) return replay;
  if (admissionResolution.state !== "admitted") {
    throw new Error("Hosted request admission did not authorize dispatch.");
  }
  const admission = HostedAdmissionSchema.parse(admissionResolution.admission);
  if (admission.sourceId !== request.provider
    || admission.requestedCoverage !== request.coverage
    || canonicalize(admission.target) !== canonicalize(request.target)
    || canonicalize(admission.vehicle ?? null) !== canonicalize(progressVehicle ?? null)) {
    throw new Error("Hosted review dispatch does not match its durable admission.");
  }

  let outcome: HostedRequestOutcome;
  try {
    outcome = await adapter.request(request.target, request.coverage);
  } catch {
    outcome = { kind: "ambiguous-delivery" };
  }
  if (outcome.kind === "created") {
    const handle = HostedRequestHandleSchema.parse({
      schemaVersion: 1,
      provider: adapter.id,
      requestedCoverage: request.coverage,
      effectiveCoverage: outcome.effectiveCoverage,
      target: request.target,
      artifact: outcome.artifact,
      ...(progressVehicle === undefined ? {} : { vehicle: progressVehicle }),
      admission,
    });
    if (dependencies.acknowledgeRequest === undefined) {
      throw new Error("Hosted review acknowledgment requires durable admission binding.");
    }
    await dependencies.acknowledgeRequest(admission, handle);
    return {
      ...resultBase,
      state: "requested",
      nextAction: "await",
      handle,
      action: hostedAwaitAction(handle),
    };
  }
  if (outcome.kind === "rate-limited" || outcome.kind === "transient-unavailable") {
    const result = {
      ...resultBase,
      state: outcome.kind,
      nextAction: "try-next-source",
      provider: request.provider,
    } as const;
    if (dependencies.concludeRequest === undefined) {
      throw new Error("Hosted review outcome requires durable admission binding.");
    }
    await dependencies.concludeRequest(admission, result);
    return result;
  }
  if (outcome.kind === "terminal-failure") {
    const result = {
      ...resultBase,
      state: "terminal-failure",
      nextAction: "stop",
      provider: request.provider,
      reason: outcome.reason,
    } as const;
    if (dependencies.concludeRequest === undefined) {
      throw new Error("Hosted review outcome requires durable admission binding.");
    }
    await dependencies.concludeRequest(admission, result);
    return result;
  }
  const result = {
    ...resultBase,
    state: "ambiguous-delivery",
    nextAction: "stop",
    provider: request.provider,
  } as const;
  if (dependencies.concludeRequest === undefined) {
    throw new Error("Hosted review outcome requires durable admission binding.");
  }
  await dependencies.concludeRequest(admission, result);
  return result;
}
