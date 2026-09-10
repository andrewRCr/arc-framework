/** End-to-end orchestration for `arc review local prepare`. */

import { z } from "zod";

import { canonicalize } from "../../../lib/kernel/index.js";

import type { LocalTargetConfirmation } from "../hosts/local/repository-target.js";
import type { LocalReviewPolicyBindingResolution } from "../policy/local-review-policy.js";
import type { LocalReviewGuidance } from "../policy/local-review-guidance.js";
import type { ReviewMethodActivity, ReviewAssuranceInput } from "../policy/assurance-schema.js";
import { resolveReviewRouting } from "../policy/routing.js";
import { LocalReviewRoutingInputSchema } from "../policy/routing-schema.js";
import { projectStandardReviewObligation } from "../policy/standard-review-projection.js";
import type { StandardReviewObligationProjection } from
  "../policy/standard-review-projection-schema.js";
import {
  projectReviewPolicyAttempt,
  ReviewLaneJudgmentSchema,
  type ReviewLaneJudgment,
  type ReviewPolicyCommandRequest,
} from "../policy/review-policy-driver.js";
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
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import {
  consumeConditionalNextPassAuthorization,
  readLaneProgressOwner,
  readLaneProgressOwnerVersioned,
  recordLocalReceiptConclusion,
  recordLocalPendingAttempt,
} from "../lane-progress.js";
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
  /** Exact head of the delivery member to review; absent reviews the work-unit branch. */
  memberHeadObjectId: GitObjectIdSchema.optional(),
  /** Exact standard-lane admission returned by delivery-member status. */
  deliveryAdmission: DeliveryLocalReviewAdmissionSchema.optional(),
  /** Caller-held bounded judgment for a non-delivery standard-lane admission. */
  policyJudgment: ReviewLaneJudgmentSchema.optional(),
}).superRefine((request, context) => {
  if (request.memberHeadObjectId !== undefined && request.deliveryAdmission === undefined) {
    context.addIssue({
      code: "custom",
      path: ["memberHeadObjectId"],
      message: "a member selector requires the exact delivery admission",
    });
  }
  if (request.memberHeadObjectId !== undefined
    && request.deliveryAdmission !== undefined
    && request.memberHeadObjectId !== request.deliveryAdmission.vehicle.head) {
    context.addIssue({
      code: "custom",
      path: ["memberHeadObjectId"],
      message: "member selector must match the exact delivery admission",
    });
  }
  if (request.deliveryAdmission !== undefined && request.policyJudgment !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["policyJudgment"],
      message: "delivery admission already carries the exact standard-lane judgment",
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
  withLocalReviewLock<T>(action: () => Promise<T>): Promise<T>;
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
  resolveLineage(
    vehicle: LocalReviewAuthority["vehicle"],
    target: ReviewTarget,
    deliveryAdmission?: DeliveryLocalReviewAdmission,
    member?: LocalReviewMemberCoordinates,
  ): Promise<LaneSubjectLineage>;
  composeAssurance(authority: LocalReviewAuthority): Promise<AssuranceComposition>;
  resolvePolicy(): LocalReviewPolicyBindingResolution;
  validatePolicySelection(
    binding: LocalReviewPolicyBinding,
    authority: LocalReviewAuthority,
  ): void;
  validatePolicyAdmission(input: {
    repositoryId: string;
    target: ReviewTarget;
    standardReview: StandardReviewObligationProjection;
    completedPasses: number;
    attempts: ReviewPolicyCommandRequest["attempts"];
    terminalResponsePerformed: boolean;
    judgment?: ReviewLaneJudgment;
  }): Promise<number>;
  validateDeliveryAdmission(
    admission: DeliveryLocalReviewAdmission,
  ): Promise<StandardReviewObligationProjection | undefined>;
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

async function retryLaneOwnerConflicts<T>(
  action: (attempt: number) => Promise<T>,
): Promise<T | null> {
  for (let attempt = 0; attempt < REVIEW_VERSION_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await action(attempt);
    } catch (error) {
      if (!isReviewVersionConflict(error)) throw error;
    }
  }
  return null;
}

/** Stable durable-state failure at the local prepare boundary. */
export class LocalPrepareCommandError extends Error {
  readonly code = "corrupt-state" as const;

  constructor(message: string) {
    super(message);
    this.name = "LocalPrepareCommandError";
  }
}

async function replayPendingLocalAdmission(input: {
  request: LocalPrepareRequest;
  dependencies: LocalPrepareDependencies;
  repositoryId: string;
  target: ReviewTarget;
  lineage: LaneSubjectLineage;
  cleanupTtlMs: number;
}): Promise<z.infer<typeof LocalPrepareEnvelopeSchema> | null> {
  const owner = await readLaneProgressOwner(input.dependencies.operationStore, {
    lane: "standard",
    repositoryId: input.repositoryId,
    headSha: input.target.headSha,
    lineage: input.lineage,
  });
  const pending = owner?.attempts.filter((attempt) => attempt.outcome === "pending"
    && attempt.local !== undefined) ?? [];
  if (pending.length > 1) {
    throw new LocalPrepareCommandError("local lane has multiple pending admissions");
  }
  const completed = owner?.attempts
    .filter((attempt) => attempt.terminalProducer
      && attempt.local !== undefined
      && attempt.headSha === input.target.headSha
      && (input.request.deliveryAdmission !== undefined
        || attempt.outcome !== "settled-findings")
      && (input.request.deliveryAdmission === undefined
        || attempt.logicalPass === input.request.deliveryAdmission.pass))
    .sort((left, right) => right.logicalPass - left.logicalPass) ?? [];
  const attempt = pending[0] ?? completed[0];
  if (attempt === undefined) return null;
  const binding = attempt.local;
  if (binding === undefined) {
    throw new LocalPrepareCommandError("local pending admission is incomplete");
  }
  const persisted = await input.dependencies.operationStore.readOperation(binding.operationId);
  const state = persisted.state;
  if (state === null
    || state.kind !== "local-review"
    || state.operationId !== attempt.attemptId
    || state.operationId !== binding.operationId
    || state.requestId !== binding.requestId
    || state.logicalPass !== attempt.logicalPass
    || state.retryGeneration !== attempt.retryGeneration
    || canonicalize(state.lineage) !== canonicalize(input.lineage)) {
    throw new LocalPrepareCommandError("local pending admission does not match its operation");
  }
  const conditionalPassAuthorizationId = input.request.policyJudgment?.ceilingOverride
    ?.conditionalPassAuthorizationId;
  if (conditionalPassAuthorizationId !== undefined) {
    await consumeConditionalNextPassAuthorization(input.dependencies.operationStore, {
      authorizationId: conditionalPassAuthorizationId,
      repositoryId: input.repositoryId,
      lane: "standard",
      lineage: input.lineage,
      producedHeadSha: input.target.headSha,
      nextPass: attempt.logicalPass,
      admissionId: attempt.attemptId,
      now: input.dependencies.now(),
    });
  }
  const receipts = (await input.dependencies.readReceipts(state.targetId)).receipts
    .filter((receipt) => receipt.requestId === state.requestId);
  if (receipts.length > 1) {
    throw new LocalPrepareCommandError("local review operation has multiple terminal receipts");
  }
  const receipt = receipts[0];
  if (receipt !== undefined) {
    await recordLocalReceiptConclusion(input.dependencies.operationStore, {
      state,
      receipt,
      now: input.dependencies.now(),
    });
    return LocalPrepareEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-prepare",
      diagnostics: [],
      state: "review-complete",
      nextAction: "reduce",
      payload: {
        operationId: state.operationId,
        persistedVersion: persisted.version,
        target: state.target,
      },
    });
  }
  const source = await input.dependencies.sourceStore.readSource(state.sourceRef);
  if (source === null
    || source.sourceDigest !== state.sourceDigest
    || source.targetId !== state.targetId) {
    throw new LocalPrepareCommandError("local review source reference mismatch");
  }
  const confirmation = await input.dependencies.confirmTarget(state.target);
  if (confirmation.state === "stale-target") {
    return LocalPrepareEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-local-prepare",
      diagnostics: [],
      state: "stale-target",
      nextAction: "prepare-current-target",
      payload: {
        attemptedTarget: confirmation.attemptedTarget,
        currentTarget: confirmation.currentTarget,
      },
    });
  }
  const memberHead = state.vehicle.kind === "delivery-member" ? state.target.headSha : undefined;
  const authority = state.deliveryAdmission === undefined
    ? await input.dependencies.resolveAuthority(state.request.evaluatorIdentity, memberHead)
    : await input.dependencies.resolveAuthority(
        state.request.evaluatorIdentity,
        memberHead,
        state.deliveryAdmission,
      );
  if (canonicalize(authority.authority.vehicle) !== canonicalize(state.vehicle)
    || authority.authority.authorIdentity !== state.request.authorIdentity
    || authority.authority.evaluatorIdentity !== state.request.evaluatorIdentity
    || authority.authority.attestationRuntimeKind !== state.attestationRuntimeKind
    || authority.authority.attestationMechanism !== state.attestation.mechanism) {
    throw new LocalPrepareCommandError("local pending admission authority mismatch");
  }
  let replayState = state;
  let replayVersion = persisted.version;
  const refreshLiveness = cleanupExpired(state, input.dependencies.now());
  if (refreshLiveness || authority.authority.runtimeIdentity !== state.attestation.runtimeIdentity) {
    replayState = LocalReviewStateSchema.parse({
      ...state,
      ...(refreshLiveness
        ? { updatedAt: input.dependencies.now(), cleanupTtlMs: input.cleanupTtlMs }
        : {}),
      attestation: {
        ...state.attestation,
        runtimeIdentity: authority.authority.runtimeIdentity,
      },
    });
    replayVersion = (await input.dependencies.operationStore.publishOperation(
      replayState,
      persisted.version,
    )).version;
  }
  const materialized = await input.dependencies.materialize(source);
  return LocalPrepareEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-local-prepare",
    diagnostics: [],
    state: "ready",
    nextAction: "launch-review",
    payload: {
      operationId: replayState.operationId,
      persistedVersion: replayVersion,
      target: replayState.target,
      request: replayState.request,
      reviewerPayload: {
        schemaVersion: 1,
        reviewRoot: materialized.reviewRoot,
        diffBaseSha: replayState.target.diffBaseSha,
        headSha: replayState.target.headSha,
        sourceRef: replayState.sourceRef,
        sourceDigest: replayState.sourceDigest,
        guidance: replayState.guidance,
        guidanceDigest: replayState.guidanceDigest,
        reviewerInstructions: replayState.reviewerInstructions,
      },
      sourceRef: replayState.sourceRef,
      sourceDigest: replayState.sourceDigest,
    },
  });
}

/** Derive, admit, optionally renew liveness, and prove one local review operation. */
export async function prepareLocalReview(
  requestInput: unknown,
  dependencies: LocalPrepareDependencies,
): Promise<z.infer<typeof LocalPrepareEnvelopeSchema>> {
  const request = LocalPrepareRequestSchema.parse(requestInput);
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
  const cleanupTtlMs = request.freshnessMs ?? DEFAULT_LOCAL_REVIEW_FRESHNESS_MS;
  const lineage = await dependencies.resolveLineage(
    authority.vehicle,
    target,
    request.deliveryAdmission,
    member ?? undefined,
  );
  const pendingReplay = await dependencies.withLocalReviewLock(() => replayPendingLocalAdmission({
    request,
    dependencies,
    repositoryId,
    target,
    lineage,
    cleanupTtlMs,
  }));
  if (pendingReplay !== null) return pendingReplay;
  await dependencies.sweep();
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
  const routedProjection = projectStandardReviewObligation(routing.decision);
  const admittedProjection = request.deliveryAdmission === undefined
    ? undefined
    : await dependencies.validateDeliveryAdmission(request.deliveryAdmission);
  const projection = admittedProjection ?? routedProjection;
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
  }
  const settled = await retryLaneOwnerConflicts(() => dependencies.withLocalReviewLock(async () => {
    const concurrentReplay = await replayPendingLocalAdmission({
      request,
      dependencies,
      repositoryId,
      target,
      lineage,
      cleanupTtlMs,
    });
    if (concurrentReplay !== null) {
      return { state: "replayed" as const, envelope: concurrentReplay };
    }
    const { version: ownerVersion, state: owner } = await readLaneProgressOwnerVersioned(
      dependencies.operationStore,
      {
        lane: "standard",
        repositoryId,
        headSha: target.headSha,
        lineage,
      },
    );
    if (request.deliveryAdmission !== undefined) {
      const currentProjection = await dependencies.validateDeliveryAdmission(request.deliveryAdmission);
      if ((admittedProjection !== undefined && currentProjection === undefined)
        || (currentProjection !== undefined
          && canonicalize(currentProjection) !== canonicalize(projection))) {
        throw new LocalPrepareCommandError("local delivery review policy changed before preparation");
      }
    }
    const currentAttempts = owner?.attempts.filter((attempt): attempt is typeof attempt & {
      outcome: Exclude<typeof attempt.outcome, "pending">;
    } => attempt.headSha === target.headSha && attempt.outcome !== "pending") ?? [];
    const activeAttempts = currentAttempts;
    const retryableLocalFailure = activeAttempts.at(-1);
    const retryingLocalFailure = retryableLocalFailure?.outcome === "terminal-failure"
      && retryableLocalFailure.local !== undefined
      && retryableLocalFailure.sourceId === dependencies.laneSourceId
      ? retryableLocalFailure
      : undefined;
    const policyAttempts = activeAttempts.filter((attempt) => (
      retryingLocalFailure === undefined
      || attempt.outcome !== "terminal-failure"
      || attempt.local === undefined
      || attempt.sourceId !== dependencies.laneSourceId
      || attempt.logicalPass !== retryingLocalFailure.logicalPass
    )).map(projectReviewPolicyAttempt);
    const logicalPass = request.deliveryAdmission?.pass ?? await dependencies.validatePolicyAdmission({
      repositoryId,
      target,
      standardReview: projection,
      completedPasses: owner?.completedPasses ?? 0,
      attempts: policyAttempts,
      terminalResponsePerformed: currentAttempts.at(-1)?.outcome === "settled-findings",
      ...(request.policyJudgment === undefined ? {} : { judgment: request.policyJudgment }),
    });
    if (retryingLocalFailure !== undefined
      && logicalPass !== retryingLocalFailure.logicalPass) {
      throw new LocalPrepareCommandError("local review retry changed its admitted logical pass");
    }
    const priorRetryGenerations = owner?.attempts
      .filter((attempt) => attempt.logicalPass === logicalPass
        && attempt.sourceId === dependencies.laneSourceId
        && attempt.local !== undefined)
      .map(({ retryGeneration }) => retryGeneration) ?? [];
    const retryGeneration = priorRetryGenerations.length === 0
      ? 0
      : Math.max(...priorRetryGenerations) + 1;
    const admissionInput = {
      target,
      requirement,
      authority,
      laneSourceId: dependencies.laneSourceId,
      policyBindingDigest: policy.binding.bindingDigest,
      requestMechanism: policy.binding.requestMechanism,
      lineage,
      logicalPass,
      retryGeneration,
      ...(request.deliveryAdmission === undefined
        ? {}
        : { deliveryAdmission: request.deliveryAdmission }),
    };
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
            guidance: assurance.guidance,
          },
        );
        admitted = { state: "prepared", resolution, preparation };
        break;
      } catch (error) {
        if (!isReviewVersionConflict(error)) throw error;
      }
    }
    if (admitted?.state === "prepared") {
      let pendingOwnerVersion = ownerVersion;
      const conditionalPassAuthorizationId = request.policyJudgment?.ceilingOverride
        ?.conditionalPassAuthorizationId;
      if (conditionalPassAuthorizationId !== undefined) {
        await consumeConditionalNextPassAuthorization(dependencies.operationStore, {
          authorizationId: conditionalPassAuthorizationId,
          repositoryId,
          lane: "standard",
          lineage,
          producedHeadSha: target.headSha,
          nextPass: admitted.preparation.state.logicalPass,
          admissionId: admitted.preparation.state.operationId,
          now: dependencies.now(),
        });
        pendingOwnerVersion = (await readLaneProgressOwnerVersioned(
          dependencies.operationStore,
          {
            lane: "standard",
            repositoryId,
            headSha: target.headSha,
            lineage,
          },
        )).version;
      }
      await recordLocalPendingAttempt(dependencies.operationStore, {
        state: admitted.preparation.state,
        ownerVersion: pendingOwnerVersion,
        now: dependencies.now(),
      });
    }
    return admitted;
  }));
  if (settled === null) throw new Error("local review preparation exceeded version-conflict retry attempts");
  if (settled.state === "replayed") return settled.envelope;
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
