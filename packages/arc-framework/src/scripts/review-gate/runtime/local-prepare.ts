/** End-to-end orchestration for `arc review local prepare`. */

import { z } from "zod";

import type { LocalTargetConfirmation } from "../hosts/local/repository-target.js";
import type { LocalReviewPolicyBindingResolution } from "../policy/local-review-policy.js";
import type { LocalReviewGuidance } from "../policy/local-review-guidance.js";
import type { ReviewMethodActivity, ReviewAssuranceInput } from "../policy/assurance-schema.js";
import { resolveReviewRouting } from "../policy/routing.js";
import { LocalReviewRoutingInputSchema } from "../policy/routing-schema.js";
import { projectStandardReviewObligation } from "../policy/standard-review-projection.js";
import { createReviewRequirement } from "../core/gate-contract-v2.js";
import {
  GitObjectIdSchema,
  ReviewIdentifierSchema,
  type ReviewTarget,
} from "../core/gate-contract-v2-schema.js";
import {
  createLocalReviewAdmission,
  resolveLocalReviewAdmission,
  type LocalReviewAdmissionResolution,
} from "../core/local-operation.js";
import {
  createLocalReviewSourcePayload,
  publishLocalReviewPreparation,
  type LocalReviewPreparation,
} from "../core/local-prepare.js";
import {
  LocalPrepareEnvelopeSchema,
} from "../core/review-command-envelope.js";
import {
  LocalReviewSourceSchema,
  type LocalReviewSource,
} from "../core/local-review-source.js";
import type {
  LocalReviewAuthority,
  LocalReviewAuthorityResolution,
  LocalReviewMemberCoordinates,
} from "../core/local-review-authority.js";
import {
  LocalReviewStateSchema,
  type LocalReviewState,
} from "../core/operation-state-schema.js";
import type {
  ForwardReceiptLedger,
  LocalReviewSourceStore,
  ReviewOperationStateStore,
} from "../core/ports.js";
import {
  isReviewVersionConflict,
  REVIEW_VERSION_RETRY_ATTEMPTS,
} from "../core/version-conflict.js";
import type { LocalReviewPolicyBinding } from "../policy/local-review-policy.js";
import {
  DeliveryLocalReviewAdmissionSchema,
  type DeliveryLocalReviewAdmission,
} from "../policy/delivery-local-review-admission.js";

const DEFAULT_LOCAL_REVIEW_FRESHNESS_MS = 24 * 60 * 60 * 1_000;

export const LocalPrepareRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  evaluatorIdentity: ReviewIdentifierSchema,
  routingFacts: LocalReviewRoutingInputSchema,
  freshnessMs: z.number().int().positive().optional(),
  /** Exact head of the delivery member to review; absent reviews the control branch. */
  memberHeadObjectId: GitObjectIdSchema.optional(),
  /** Exact standard-lane admission returned by delivery-member status. */
  deliveryAdmission: DeliveryLocalReviewAdmissionSchema.optional(),
}).superRefine((request, context) => {
  if (request.memberHeadObjectId !== undefined
    && request.deliveryAdmission !== undefined
    && request.memberHeadObjectId !== request.deliveryAdmission.vehicle.head) {
    context.addIssue({
      code: "custom",
      path: ["memberHeadObjectId"],
      message: "member selector must match the exact delivery admission",
    });
  }
});
export type LocalPrepareRequest = z.infer<typeof LocalPrepareRequestSchema>;

type AssuranceComposition =
  | {
      status: "resolved";
      assurance: ReviewAssuranceInput;
      activity: ReviewMethodActivity;
      guidance: LocalReviewGuidance;
      diagnostics: readonly string[];
    }
  | { status: "refused"; diagnostics: readonly string[] };

export interface LocalPrepareDependencies {
  sweep(): Promise<void>;
  withSourceLock<T>(action: () => Promise<T>): Promise<T>;
  resolveRepositoryId(): Promise<string>;
  /** Configured review-policy source represented by this local carrier. */
  laneSourceId: string;
  deriveTarget(
    repositoryId: string,
    member?: LocalReviewMemberCoordinates,
  ): Promise<ReviewTarget>;
  confirmTarget(target: ReviewTarget): Promise<LocalTargetConfirmation>;
  resolveAuthority(
    evaluatorIdentity: string,
    memberHeadObjectId?: string,
    deliveryAdmission?: DeliveryLocalReviewAdmission,
  ): Promise<LocalReviewAuthorityResolution>;
  composeAssurance(authority: LocalReviewAuthority): Promise<AssuranceComposition>;
  resolvePolicy(): LocalReviewPolicyBindingResolution;
  validatePolicySelection(
    binding: LocalReviewPolicyBinding,
    authority: LocalReviewAuthority,
  ): void;
  validateDeliveryAdmission(admission: DeliveryLocalReviewAdmission): Promise<void>;
  operationStore: ReviewOperationStateStore;
  sourceStore: LocalReviewSourceStore;
  readReceipts(targetId: string): Promise<ForwardReceiptLedger>;
  describeSource(operationId: string, target: ReviewTarget): Promise<LocalReviewSource>;
  materialize(source: LocalReviewSource): Promise<{ reviewRoot: string }>;
  now(): string;
}

function diagnostics(messages: readonly string[]) {
  return messages.map((message) => ({ code: "local-prepare", message }));
}

function cleanupExpired(state: LocalReviewState, nowInput: string): boolean {
  const admittedAt = Date.parse(state.updatedAt);
  const now = Date.parse(nowInput);
  if (!Number.isFinite(admittedAt) || !Number.isFinite(now)) {
    throw new Error("invalid local review cleanup clock");
  }
  return now >= admittedAt + state.cleanupTtlMs;
}

/** Stable durable-state failure at the local prepare boundary. */
export class LocalPrepareCommandError extends Error {
  readonly code = "corrupt-state" as const;

  constructor(message: string) {
    super(message);
    this.name = "LocalPrepareCommandError";
  }
}

/** Derive, admit, optionally renew liveness, and prove one local review operation. */
export async function prepareLocalReview(
  requestInput: unknown,
  dependencies: LocalPrepareDependencies,
): Promise<z.infer<typeof LocalPrepareEnvelopeSchema>> {
  const request = LocalPrepareRequestSchema.parse(requestInput);
  await dependencies.sweep();
  const repositoryId = await dependencies.resolveRepositoryId();
  // Authority resolves first: derivation needs the member coordinates it records,
  // and a named member's target is those coordinates rather than the checkout's.
  const authorityResolution = request.deliveryAdmission === undefined
    ? await dependencies.resolveAuthority(request.evaluatorIdentity, request.memberHeadObjectId)
    : await dependencies.resolveAuthority(
        request.evaluatorIdentity,
        request.deliveryAdmission.vehicle.head,
        request.deliveryAdmission,
      );
  const { authority, member } = authorityResolution;
  const target = await dependencies.deriveTarget(repositoryId, member ?? undefined);
  const assurance = await dependencies.composeAssurance(authority);
  if (assurance.status === "refused") {
    return LocalPrepareEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-prepare",
      diagnostics: diagnostics(assurance.diagnostics),
      state: "unavailable",
      nextAction: "operator-repair",
      payload: {},
    });
  }
  const routing = resolveReviewRouting({
    schemaVersion: 1,
    ...request.routingFacts,
    changeSetState: "known",
    assurance: assurance.assurance,
    activity: assurance.activity,
  });
  const projection = projectStandardReviewObligation(routing.decision);
  const allDiagnostics = [...assurance.diagnostics, ...routing.diagnostics];
  if (projection.obligation === "exempt") {
    return LocalPrepareEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-prepare",
      diagnostics: diagnostics(allDiagnostics),
      state: "exempt",
      nextAction: "none",
      payload: {},
    });
  }
  const policy = dependencies.resolvePolicy();
  if (policy.status === "unavailable") {
    return LocalPrepareEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-prepare",
      diagnostics: diagnostics([...allDiagnostics, ...policy.diagnostics]),
      state: "unavailable",
      nextAction: "operator-repair",
      payload: {},
    });
  }
  dependencies.validatePolicySelection(policy.binding, authority);
  const requirement = createReviewRequirement({
    target,
    projection,
    acceptableSources: policy.binding.acceptableSources,
    initialAdmission: policy.binding.initialAdmission,
  });
  if (requirement === null) throw new Error("non-exempt local review produced no requirement");
  const admissionInput = {
    target,
    requirement,
    authority,
    laneSourceId: dependencies.laneSourceId,
    policyBindingDigest: policy.binding.bindingDigest,
    requestMechanism: policy.binding.requestMechanism,
    ...(request.deliveryAdmission === undefined
      ? {}
      : { deliveryAdmission: request.deliveryAdmission }),
  };
  const confirmation = await dependencies.confirmTarget(target);
  if (confirmation.state === "stale-target") {
    return LocalPrepareEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-prepare",
      diagnostics: diagnostics(allDiagnostics),
      state: "stale-target",
      nextAction: "prepare-current-target",
      payload: {
        attemptedTarget: confirmation.attemptedTarget,
        currentTarget: confirmation.currentTarget,
      },
    });
  }
  if (request.deliveryAdmission !== undefined) {
    if (target.kind !== "delivery-member"
      || target.headSha !== request.deliveryAdmission.vehicle.head) {
      throw new LocalPrepareCommandError("local review target does not match its delivery admission");
    }
    await dependencies.validateDeliveryAdmission(request.deliveryAdmission);
  }
  const cleanupTtlMs = request.freshnessMs ?? DEFAULT_LOCAL_REVIEW_FRESHNESS_MS;
  const settled = await dependencies.withSourceLock(async () => {
    let admitted:
      | {
          state: "prepared";
          resolution: LocalReviewAdmissionResolution;
          preparation: LocalReviewPreparation;
        }
      | {
          state: "completed";
          operationId: string;
          persistedVersion: number;
        }
      | null = null;
    for (let attempt = 0; attempt < REVIEW_VERSION_RETRY_ATTEMPTS; attempt += 1) {
      const existingVerification: {
        value?: { source: LocalReviewSource; reviewRoot: string };
        renewal?: {
          source: LocalReviewSource;
          refreshLiveness: boolean;
        };
        completed?: true;
      } = {};
      const resolution = await resolveLocalReviewAdmission(admissionInput, {
        store: dependencies.operationStore,
        verifyExisting: async (state) => {
          const source = await dependencies.sourceStore.readSource(state.sourceRef);
          if (source === null
            || source.sourceDigest !== state.sourceDigest
            || source.targetId !== state.targetId) {
            throw new LocalPrepareCommandError("local review source reference mismatch");
          }
          const ledger = await dependencies.readReceipts(state.targetId);
          const receipts = ledger.receipts.filter((receipt) => receipt.requestId === state.requestId);
          if (receipts.length > 1) {
            throw new LocalPrepareCommandError(
              "local review operation has multiple terminal receipts",
            );
          }
          if (receipts.length === 1) {
            existingVerification.completed = true;
            return;
          }
          const refreshLiveness = cleanupExpired(state, dependencies.now());
          if (refreshLiveness
            || state.attestation.runtimeIdentity !== authority.runtimeIdentity) {
            existingVerification.renewal = { source, refreshLiveness };
            return;
          }
          const materialized = await dependencies.materialize(source);
          existingVerification.value = { source, reviewRoot: materialized.reviewRoot };
        },
      });
      if (resolution.state === "existing") {
        if (existingVerification.completed === true) {
          admitted = {
            state: "completed",
            operationId: resolution.operationId,
            persistedVersion: resolution.persistedVersion,
          };
          break;
        }
        const renewal = existingVerification.renewal;
        if (renewal !== undefined) {
          const renewedState = LocalReviewStateSchema.parse({
            ...resolution.persistedState,
            ...(renewal.refreshLiveness
              ? {
                  updatedAt: dependencies.now(),
                  cleanupTtlMs,
                }
              : {}),
            attestation: {
              ...resolution.persistedState.attestation,
              runtimeIdentity: authority.runtimeIdentity,
            },
          });
          const published = await dependencies.operationStore.publishOperation(
            renewedState,
            resolution.persistedVersion,
          );
          const materialized = await dependencies.materialize(renewal.source);
          admitted = {
            state: "prepared",
            resolution,
            preparation: {
              persistedVersion: published.version,
              state: renewedState,
              sourceRef: renewedState.sourceRef,
              sourceDigest: renewal.source.sourceDigest,
              reviewRoot: materialized.reviewRoot,
            },
          };
          break;
        }
        const verified = existingVerification.value;
        if (verified === undefined) throw new Error("existing local review was not verified");
        admitted = {
          state: "prepared",
          resolution,
          preparation: {
            persistedVersion: resolution.persistedVersion,
            state: resolution.persistedState,
            sourceRef: resolution.persistedState.sourceRef,
            sourceDigest: verified.source.sourceDigest,
            reviewRoot: verified.reviewRoot,
          },
        };
        break;
      }
      const source = LocalReviewSourceSchema.parse(
        await dependencies.describeSource(resolution.operationId, target),
      );
      try {
        const preparation = await publishLocalReviewPreparation(
          createLocalReviewAdmission(admissionInput),
          source,
          {
            sourceStore: dependencies.sourceStore,
            operationStore: dependencies.operationStore,
            materialize: (candidate) => dependencies.materialize(candidate),
            now: () => dependencies.now(),
            cleanupTtlMs,
            guidanceDigest: assurance.guidance.guidanceDigest,
          },
        );
        admitted = { state: "prepared", resolution, preparation };
        break;
      } catch (error) {
        if (!isReviewVersionConflict(error)) throw error;
      }
    }
    return admitted;
  });
  if (settled === null) throw new Error("local review preparation exceeded version-conflict retry attempts");
  if (settled.state === "completed") {
    return LocalPrepareEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-prepare",
      diagnostics: diagnostics(allDiagnostics),
      state: "review-complete",
      nextAction: "reduce",
      payload: {
        operationId: settled.operationId,
        persistedVersion: settled.persistedVersion,
        target,
      },
    });
  }
  const { resolution, preparation } = settled;
  const sourcePayload = createLocalReviewSourcePayload(resolution, preparation);
  return LocalPrepareEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-local-prepare",
    diagnostics: diagnostics(allDiagnostics),
    state: "ready",
    nextAction: "launch-review",
    payload: {
      operationId: resolution.operationId,
      persistedVersion: preparation.persistedVersion,
      target,
      request: resolution.carrier.request,
      reviewerPayload: {
        schemaVersion: 1,
        ...sourcePayload,
        guidance: assurance.guidance.projection,
        guidanceDigest: assurance.guidance.guidanceDigest,
        reviewerInstructions: assurance.guidance.reviewerInstructions,
      },
      sourceRef: preparation.sourceRef,
      sourceDigest: preparation.sourceDigest,
    },
  });
}
