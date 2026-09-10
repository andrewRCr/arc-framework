/** Durable per-attempt lane progress at the fidelity the review-policy driver reads. */

import { createHash } from "node:crypto";

import { canonicalize } from "../../lib/kernel/index.js";
import { validateReviewReceipt } from "./core/gate-contract-v2.js";
import type { ReviewReceiptV2 } from "./core/gate-contract-v2-schema.js";
import {
  computeConditionalPassAuthorizationId,
  createHostedSealedResult,
  LaneProgressStateSchema,
  type LocalReviewState,
  type LaneProgressState,
} from "./core/operation-state-schema.js";
import type { FrontlineAdmission } from "./core/frontline-admission.js";
import type { LaneSubjectLineage } from "./core/lane-admission.js";
import type {
  ReviewOperationStateSnapshotIndex,
  ReviewOperationStateStore,
} from "./core/ports.js";
import {
  isReviewVersionConflict,
  REVIEW_VERSION_RETRY_ATTEMPTS,
} from "./core/version-conflict.js";
import type { HostedAwaitResult } from "./hosted/await.js";
import type {
  HostedAdmission,
  HostedProgressVehicle,
  HostedRequestEnvelope,
  HostedRequestHandle,
  HostedRequestAdmissionResolution,
  HostedRequestResult,
  HostedTarget,
} from "./hosted/request.js";
import {
  createHostedAdmission,
  hostedAdmissionMatchesRequest,
  hostedAwaitAction,
  hostedLaneAttemptId,
  HostedRequestEnvelopeSchema,
} from "./hosted/request.js";
export { hostedLaneAttemptId } from "./hosted/request.js";
import type { FrontlineExecutionOutcome } from "./policy/frontline-outcome.js";

type LaneAttempt = LaneProgressState["attempts"][number];
type LaneAttemptOutcome = LaneAttempt["outcome"];

function conditionalContinuationLineageMatches(
  left: LaneSubjectLineage,
  right: LaneSubjectLineage,
): boolean {
  return canonicalize(left) === canonicalize(right)
    || (left.kind === "head-bound"
      && right.kind === "head-bound"
      && left.vehicleKind === right.vehicleKind
      && left.vehicleIdentity === right.vehicleIdentity);
}

function bindCompletedConditionalPassAuthorization(
  attempt: LaneAttempt,
  input: { dispositionSetId: string; producedHeadSha: string; now: string },
): LaneAttempt {
  const authorization = attempt.conditionalPassAuthorization;
  if (authorization === undefined) return attempt;
  if (authorization.dispositionSetId !== input.dispositionSetId) {
    throw new Error("conditional pass authorization does not match the performed response");
  }
  if (authorization.status === "invalidated") {
    throw new Error("invalidated conditional pass authorization cannot be bound");
  }
  if (authorization.status === "bound" || authorization.status === "consumed") {
    if (authorization.producedHeadSha !== input.producedHeadSha) {
      throw new Error("conditional pass authorization response-head replay conflicts");
    }
    return attempt;
  }
  if (authorization.responseHeadSha !== undefined
    && authorization.responseHeadSha !== input.producedHeadSha) {
    throw new Error("conditional pass authorization response-head evidence conflicts");
  }
  return {
    ...attempt,
    conditionalPassAuthorization: {
      schemaVersion: authorization.schemaVersion,
      authorizationId: authorization.authorizationId,
      status: "bound",
      authorizedBy: authorization.authorizedBy,
      repositoryId: authorization.repositoryId,
      lane: authorization.lane,
      lineage: authorization.lineage,
      producerId: authorization.producerId,
      dispositionSetId: authorization.dispositionSetId,
      originatingHeadSha: authorization.originatingHeadSha,
      exhaustedPassCount: authorization.exhaustedPassCount,
      nextPass: authorization.nextPass,
      capturedAt: authorization.capturedAt,
      producedHeadSha: input.producedHeadSha,
      boundAt: input.now,
    },
  };
}

function sealedHostedReplayMatches(current: LaneAttempt, proposed: LaneAttempt): boolean {
  const currentHosted = current.hosted;
  const proposedHosted = proposed.hosted;
  if (currentHosted?.sealedResult === undefined || proposedHosted?.sealedResult === undefined
    || currentHosted.sealedResult.hostedResultId !== proposedHosted.sealedResult.hostedResultId) {
    return false;
  }
  return canonicalize({
    attemptId: current.attemptId,
    logicalPass: current.logicalPass,
    retryGeneration: current.retryGeneration,
    changeRequestId: current.changeRequestId,
    headSha: current.headSha,
    sourceId: current.sourceId,
    chunkSeriesComplete: current.chunkSeriesComplete ?? null,
    admission: currentHosted.admission,
    handle: currentHosted.handle ?? null,
    target: currentHosted.target,
    requestedCoverage: currentHosted.requestedCoverage,
    effectiveCoverage: currentHosted.effectiveCoverage,
    vehicle: currentHosted.vehicle ?? null,
    reviewTarget: currentHosted.reviewTarget,
    requirement: currentHosted.requirement,
    actorIdentity: currentHosted.actorIdentity,
  }) === canonicalize({
    attemptId: proposed.attemptId,
    logicalPass: proposed.logicalPass,
    retryGeneration: proposed.retryGeneration,
    changeRequestId: proposed.changeRequestId,
    headSha: proposed.headSha,
    sourceId: proposed.sourceId,
    chunkSeriesComplete: proposed.chunkSeriesComplete ?? null,
    admission: proposedHosted.admission,
    handle: proposedHosted.handle ?? null,
    target: proposedHosted.target,
    requestedCoverage: proposedHosted.requestedCoverage,
    effectiveCoverage: proposedHosted.effectiveCoverage,
    vehicle: proposedHosted.vehicle ?? null,
    reviewTarget: proposedHosted.reviewTarget,
    requirement: proposedHosted.requirement,
    actorIdentity: proposedHosted.actorIdentity,
  });
}

function pendingAttemptCanAdvance(pending: LaneAttempt, next: LaneAttempt): boolean {
  const pendingHosted = pending.hosted;
  const nextHosted = next.hosted;
  if (pending.outcome !== "pending" || next.outcome === "pending") return false;
  if (pending.frontline !== undefined || next.frontline !== undefined) {
    return pending.frontline !== undefined
      && next.frontline !== undefined
      && canonicalize(pending.frontline.admission) === canonicalize(next.frontline.admission);
  }
  if (pending.local !== undefined || next.local !== undefined) {
    return pending.local !== undefined
      && next.local !== undefined
      && canonicalize({
        attemptId: pending.attemptId,
        logicalPass: pending.logicalPass,
        retryGeneration: pending.retryGeneration,
        changeRequestId: pending.changeRequestId,
        headSha: pending.headSha,
        sourceId: pending.sourceId,
        local: { ...pending.local, effectiveCoverage: null },
      }) === canonicalize({
        attemptId: next.attemptId,
        logicalPass: next.logicalPass,
        retryGeneration: next.retryGeneration,
        changeRequestId: next.changeRequestId,
        headSha: next.headSha,
        sourceId: next.sourceId,
        local: { ...next.local, effectiveCoverage: null },
      });
  }
  if (pendingHosted === undefined || nextHosted === undefined
    || pendingHosted.sealedResult !== undefined || pendingHosted.dispositionSetId !== null
    || pendingHosted.dispositionSetLineage.length !== 0
    || pendingHosted.settledFindingIds.length !== 0
    || pendingHosted.settlementEvidence.length !== 0) return false;
  return canonicalize({
    attemptId: pending.attemptId,
    logicalPass: pending.logicalPass,
    retryGeneration: pending.retryGeneration,
    changeRequestId: pending.changeRequestId,
    headSha: pending.headSha,
    sourceId: pending.sourceId,
    ...(pending.chunkSeriesComplete === undefined ? {} : { chunkSeriesComplete: pending.chunkSeriesComplete }),
    admission: pendingHosted.admission,
    handle: pendingHosted.handle ?? null,
    target: pendingHosted.target,
    requestedCoverage: pendingHosted.requestedCoverage,
    effectiveCoverage: pendingHosted.effectiveCoverage,
    ...(pendingHosted.vehicle === undefined ? {} : { vehicle: pendingHosted.vehicle }),
    reviewTarget: pendingHosted.reviewTarget,
    requirement: pendingHosted.requirement,
    actorIdentity: pendingHosted.actorIdentity,
  }) === canonicalize({
    attemptId: next.attemptId,
    logicalPass: next.logicalPass,
    retryGeneration: next.retryGeneration,
    changeRequestId: next.changeRequestId,
    headSha: next.headSha,
    sourceId: next.sourceId,
    ...(next.chunkSeriesComplete === undefined ? {} : { chunkSeriesComplete: next.chunkSeriesComplete }),
    admission: nextHosted.admission,
    handle: nextHosted.handle ?? null,
    target: nextHosted.target,
    requestedCoverage: nextHosted.requestedCoverage,
    effectiveCoverage: nextHosted.effectiveCoverage,
    ...(nextHosted.vehicle === undefined ? {} : { vehicle: nextHosted.vehicle }),
    reviewTarget: nextHosted.reviewTarget,
    requirement: nextHosted.requirement,
    actorIdentity: nextHosted.actorIdentity,
  });
}

/** Derive the local carrier's requested coverage from its admitted requirement. */
export function localReviewRequestedCoverage(
  requirement: { readonly retrigger: "none" | "incremental" | "full-final" },
): "incremental" | "complete" {
  if (requirement.retrigger === "none") {
    throw new Error("local review admission requires a reviewable coverage policy");
  }
  return requirement.retrigger === "incremental" ? "incremental" : "complete";
}

function localLaneAttemptMatchesState(attempt: LaneAttempt, state: LocalReviewState): boolean {
  const requestedCoverage = localReviewRequestedCoverage(state.requirement);
  return attempt.attemptId === state.operationId
    && attempt.logicalPass === state.logicalPass
    && attempt.retryGeneration === state.retryGeneration
    && attempt.changeRequestId === null
    && attempt.headSha === state.target.headSha
    && attempt.sourceId === state.laneSourceId
    && attempt.local !== undefined
    && canonicalize(attempt.local) === canonicalize({
      operationId: state.operationId,
      requestId: state.requestId,
      vehicle: state.vehicle,
      target: state.target,
      requestedCoverage,
      effectiveCoverage: attempt.terminalProducer ? requestedCoverage : null,
      scopeMode: state.scopeMode,
      ...(state.deliveryAdmission === undefined
        ? {}
        : { deliveryAdmission: state.deliveryAdmission }),
    });
}

/** Reconcile one persisted local receipt into its canonical terminal lane attempt. */
export async function recordLocalReceiptConclusion(
  store: ReviewOperationStateStore,
  input: {
    state: LocalReviewState;
    receipt: ReviewReceiptV2;
    now: string;
  },
): Promise<LaneProgressState> {
  const { state } = input;
  const receipt = validateReviewReceipt(
    state.target,
    state.requirement,
    state.request,
    input.receipt,
  );
  const consumedPass = receipt.result === "clean" || receipt.result === "findings";
  const requestedCoverage = localReviewRequestedCoverage(state.requirement);
  const outcome = receipt.result === "unavailable"
    ? "transient-unavailable"
    : receipt.result === "failed" ? "terminal-failure" : receipt.result;
  const existingOwner = await readLaneProgressOwner(store, {
    lane: "standard",
    repositoryId: state.repositoryId,
    headSha: state.target.headSha,
    lineage: state.lineage,
  });
  const existing = existingOwner?.attempts.filter((attempt) => (
    localLaneAttemptMatchesState(attempt, state)
  )) ?? [];
  const existingAttempt = existing.length === 1 ? existing[0] : undefined;
  if (existingOwner !== null && existingAttempt !== undefined && existingAttempt.outcome !== "pending") {
    const outcomeCompatible = existingAttempt.outcome === outcome
      || (outcome === "findings" && existingAttempt.outcome === "settled-findings");
    if (!outcomeCompatible || existingAttempt.terminalProducer !== consumedPass) {
      throw new Error("conflicting local receipt conclusion");
    }
    return existingOwner;
  }
  return recordLaneAttempt(store, {
    lane: "standard",
    repositoryId: state.repositoryId,
    changeRequestId: null,
    headSha: state.target.headSha,
    lineage: state.lineage,
    logicalPass: state.logicalPass,
    retryGeneration: state.retryGeneration,
    attemptId: state.operationId,
    sourceId: state.laneSourceId,
    outcome,
    consumedPass,
    chunkSeriesComplete: consumedPass,
    advancePendingAttempt: true,
    local: {
      operationId: state.operationId,
      requestId: state.requestId,
      vehicle: state.vehicle,
      target: state.target,
      requestedCoverage,
      effectiveCoverage: consumedPass ? requestedCoverage : null,
      scopeMode: state.scopeMode,
      ...(state.deliveryAdmission === undefined
        ? {}
        : { deliveryAdmission: state.deliveryAdmission }),
    },
    now: input.now,
  });
}

function countCompleteLogicalPasses(attempts: readonly LaneAttempt[]): number {
  return new Set(attempts.filter((attempt) => (
    attempt.terminalProducer
      && (attempt.local?.effectiveCoverage === "complete"
        || attempt.hosted?.effectiveCoverage === "complete"
        || attempt.frontline?.effectiveCoverage === "complete")
  )).map(({ logicalPass }) => logicalPass)).size;
}

/** Hosted await states that conclude an attempt, keyed to the driver's outcome vocabulary. */
const HOSTED_AWAIT_OUTCOMES = {
  clean: "clean",
  findings: "findings",
  "rate-limited": "rate-limited",
  "transient-unavailable": "transient-unavailable",
  "stale-target": "stale-target",
  "source-unavailable": "source-unbound",
  "malformed-output": "malformed",
  "terminal-failure": "terminal-failure",
} as const satisfies Record<string, LaneAttemptOutcome>;

/**
 * Map one hosted await state onto the driver's attempt vocabulary.
 *
 * @param state - The `state` field of a hosted await result.
 * @returns The driver-grade outcome, or `null` when the state concluded no attempt.
 */
export function hostedAwaitLaneOutcome(state: string): LaneAttemptOutcome | null {
  return state in HOSTED_AWAIT_OUTCOMES
    ? HOSTED_AWAIT_OUTCOMES[state as keyof typeof HOSTED_AWAIT_OUTCOMES]
    : null;
}

/**
 * Resolve the stable operation identity holding one lane's progress against one exact head.
 *
 * @param input - The lane and the exact target it is reviewing.
 * @returns The operation identifier for that lane and target.
 */
export function laneProgressOperationId(input: {
  lane: LaneProgressState["lane"];
  repositoryId: string;
  headSha: string;
  lineage?: LaneSubjectLineage;
}): string {
  const subject = input.lineage ?? {
    kind: "head-bound" as const,
    vehicleKind: "review-target",
    vehicleIdentity: `${input.repositoryId}/${input.headSha}`,
    headSha: input.headSha,
  };
  const digest = createHash("sha256")
    .update(canonicalize({
      domain: "arc.review.lane-progress-owner/v1",
      lane: input.lane,
      repositoryId: input.repositoryId,
      subject,
    }))
    .digest("hex");
  return `lane-progress/${digest}`;
}

/**
 * Record one attempt state in its lane's durable progress.
 *
 * `consumedPass` is the caller's, not this function's: the review-policy driver reports whether a
 * resolution consumed a pass, so pass accounting follows that same distinction rather than being
 * inferred from the outcome here.
 *
 * @param store - Versioned operation-state storage boundary.
 * @param input - The lane, its exact target, the attempt state, and whether it consumed a pass.
 * @returns The published lane-progress record.
 */
export async function recordLaneAttempt(
  store: ReviewOperationStateStore,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    changeRequestId: string | null;
    headSha: string;
    lineage?: LaneSubjectLineage;
    attemptId: string;
    sourceId: string;
    outcome: LaneAttemptOutcome;
    consumedPass: boolean;
    chunkSeriesComplete?: boolean;
    hosted?: LaneAttempt["hosted"];
    local?: LaneAttempt["local"];
    frontline?: LaneAttempt["frontline"];
    now: string;
    advancePendingAttempt?: boolean;
    logicalPass?: number;
    retryGeneration?: number;
    expectedOwnerVersion?: number;
  },
): Promise<LaneProgressState> {
  const lineage = input.lineage ?? {
    kind: "head-bound" as const,
    vehicleKind: "review-target",
    vehicleIdentity: `${input.repositoryId}/${input.headSha}`,
    headSha: input.headSha,
  };
  const operationId = laneProgressOperationId({ ...input, lineage });
  for (let writeAttempt = 0; writeAttempt < REVIEW_VERSION_RETRY_ATTEMPTS; writeAttempt += 1) {
    const { version, state } = await store.readOperation(operationId);
    if (input.expectedOwnerVersion !== undefined && version !== input.expectedOwnerVersion) {
      throw Object.assign(new Error("version-conflict"), { code: "version-conflict" });
    }
    const existing = state !== null && state.kind === "lane-progress" ? state : null;
    const replay = existing?.attempts.find((candidate) => candidate.attemptId === input.attemptId);
    const attempt: LaneAttempt = {
      attemptId: input.attemptId,
      logicalPass: input.logicalPass ?? replay?.logicalPass ?? (existing?.completedPasses ?? 0) + 1,
      retryGeneration: input.retryGeneration ?? replay?.retryGeneration ?? 0,
      changeRequestId: input.changeRequestId,
      headSha: input.headSha,
      terminalProducer: input.consumedPass,
      sourceId: input.sourceId,
      outcome: input.outcome,
      ...(input.chunkSeriesComplete === undefined ? {} : { chunkSeriesComplete: input.chunkSeriesComplete }),
      ...(input.hosted === undefined ? {} : { hosted: input.hosted }),
      ...(input.local === undefined ? {} : { local: input.local }),
      ...(input.frontline === undefined ? {} : { frontline: input.frontline }),
    };
    if (replay !== undefined && canonicalize(replay) === canonicalize(attempt)) {
      if (existing === null) throw new Error("lane-attempt replay has no lane progress record");
      return LaneProgressStateSchema.parse(existing);
    }
    if (replay !== undefined && sealedHostedReplayMatches(replay, attempt)) {
      if (existing === null) throw new Error("lane-attempt replay has no lane progress record");
      return LaneProgressStateSchema.parse(existing);
    }
    let next: LaneProgressState;
    if (replay !== undefined) {
      if (input.advancePendingAttempt !== true || !pendingAttemptCanAdvance(replay, attempt)) {
        throw new Error("conflicting lane-attempt replay");
      }
      if (existing === null) throw new Error("lane-attempt replay has no lane progress record");
      const attempts = existing.attempts.map((candidate) => candidate.attemptId === input.attemptId
        ? attempt
        : candidate);
      const completedPasses = new Set(attempts
        .filter(({ terminalProducer }) => terminalProducer)
        .map(({ logicalPass }) => logicalPass)).size;
      next = LaneProgressStateSchema.parse({
        ...existing,
        updatedAt: input.now,
        completedPasses,
        attempts,
      });
    } else {
      const attempts = [...existing?.attempts ?? [], attempt];
      const completedPasses = new Set(attempts
        .filter(({ terminalProducer }) => terminalProducer)
        .map(({ logicalPass }) => logicalPass)).size;
      next = LaneProgressStateSchema.parse({
        schemaVersion: 1,
        semanticsVersion: "review-operation/v1",
        operationId,
        updatedAt: input.now,
        kind: "lane-progress",
        lane: input.lane,
        repositoryId: input.repositoryId,
        lineage,
        completedPasses,
        attempts,
      });
    }
    try {
      await store.publishOperation(next, version);
      return next;
    } catch (error) {
      if (!isReviewVersionConflict(error)) throw error;
      if (input.expectedOwnerVersion !== undefined) throw error;
    }
  }
  throw new Error("lane progress exceeded version-conflict retry attempts");
}

export type HostedRequestAdmissionDecision = HostedRequestAdmissionResolution;

function replayHostedRequestResult(
  request: HostedRequestEnvelope,
  attempt: LaneAttempt,
): HostedRequestAdmissionDecision | null {
  const hosted = attempt.hosted;
  if (hosted === undefined) return null;
  if (attempt.outcome === "pending") {
    return hosted.handle === undefined
      ? { state: "ambiguous-delivery" }
      : { state: "acknowledged", handle: hosted.handle, action: hostedAwaitAction(hosted.handle) };
  }
  const base = {
    schemaVersion: 1 as const,
    mode: "review-hosted-request" as const,
    provider: request.provider,
    requestedCoverage: request.coverage,
    attemptedProviders: [request.provider],
  };
  if (attempt.outcome === "rate-limited" || attempt.outcome === "transient-unavailable") {
    return {
      state: "concluded",
      result: { ...base, state: attempt.outcome, nextAction: "try-next-source" },
    };
  }
  if (attempt.outcome === "terminal-failure" && hosted.requestFailureReason !== null) {
    return {
      state: "concluded",
      result: {
        ...base,
        state: "terminal-failure",
        nextAction: "stop",
        reason: hosted.requestFailureReason,
      },
    };
  }
  if (attempt.outcome === "ambiguous-delivery") return { state: "ambiguous-delivery" };
  return null;
}

/**
 * Resolve an admitted hosted request before current policy, actor, or member selection.
 *
 * @param store - Complete operation-snapshot reader for the current repository.
 * @param input - Repository identity and caller-visible hosted request.
 * @returns The one replayable admission decision, `null` when none exists, or a conservative ambiguous stop.
 */
export async function readHostedRequestAdmissionReplay(
  store: ReviewOperationStateSnapshotIndex,
  input: { repositoryId: string; request: HostedRequestEnvelope },
): Promise<HostedRequestAdmissionDecision | null> {
  const request = HostedRequestEnvelopeSchema.parse(input.request);
  const snapshot = await store.readOperationSnapshot();
  if (snapshot.status !== "complete") return { state: "ambiguous-delivery" };
  const matchingAttempts: LaneAttempt[] = [];
  for (const record of snapshot.records) {
    if (record.state.kind !== "lane-progress"
      || record.state.lane !== "standard"
      || record.state.repositoryId !== input.repositoryId) continue;
    const progress = LaneProgressStateSchema.parse(record.state);
    const activeLogicalPass = progress.completedPasses + 1;
    matchingAttempts.push(...progress.attempts.filter((attempt) => (
      attempt.logicalPass === activeLogicalPass
      && attempt.hosted !== undefined
      && hostedAdmissionMatchesRequest(attempt.hosted.admission, request)
    )));
  }
  if (matchingAttempts.length === 0) return null;
  if (matchingAttempts.length !== 1) return { state: "ambiguous-delivery" };
  const matchingAttempt = matchingAttempts[0];
  if (matchingAttempt === undefined) return { state: "ambiguous-delivery" };
  return replayHostedRequestResult(request, matchingAttempt)
    ?? { state: "ambiguous-delivery" };
}

/** Admit one hosted source attempt before its external request effect. */
export async function recordHostedRequestAdmission(
  store: ReviewOperationStateStore,
  input: {
    repositoryId: string;
    lineage: LaneSubjectLineage;
    request: HostedRequestEnvelope;
    progressVehicle?: HostedProgressVehicle;
    reviewTarget: NonNullable<LaneAttempt["hosted"]>["reviewTarget"];
    requirement: NonNullable<LaneAttempt["hosted"]>["requirement"];
    actorIdentity: string;
    authorizeCapacity(input: {
      ownerVersion: number;
      progress: LaneProgressState | null;
      logicalPass: number;
    }): Promise<void>;
    confirmDispositionSetCurrent?: (
      producerId: string,
      dispositionSetId: string,
    ) => Promise<boolean>;
    now: string;
  },
): Promise<HostedRequestAdmissionDecision> {
  const operationId = laneProgressOperationId({
    lane: "standard",
    repositoryId: input.repositoryId,
    headSha: input.request.target.headSha,
    lineage: input.lineage,
  });
  for (let writeAttempt = 0; writeAttempt < REVIEW_VERSION_RETRY_ATTEMPTS; writeAttempt += 1) {
    const { version, state } = await store.readOperation(operationId);
    const existing = state !== null && state.kind === "lane-progress"
      ? LaneProgressStateSchema.parse(state)
      : null;
    const logicalPass = (existing?.completedPasses ?? 0) + 1;
    const admittedReplay = existing?.attempts.find((attempt) => (
      attempt.logicalPass === logicalPass
      && attempt.hosted !== undefined
      && attempt.hosted.admission.sourceId === input.request.provider
      && attempt.hosted.admission.requestedCoverage === input.request.coverage
      && canonicalize(attempt.hosted.admission.target) === canonicalize(input.request.target)
      && canonicalize(attempt.hosted.admission.vehicle ?? null)
        === canonicalize(input.progressVehicle ?? null)
    ));
    if (admittedReplay !== undefined) {
      const result = replayHostedRequestResult(input.request, admittedReplay);
      if (result !== null) return result;
      throw new Error("hosted admission already concluded with an incompatible result");
    }
    const retainedRequestedCoverage = new Set(existing?.attempts
      .filter((attempt) => attempt.logicalPass === logicalPass)
      .flatMap((attempt) => {
        const coverage = attempt.local?.requestedCoverage ?? attempt.hosted?.requestedCoverage;
        return coverage === undefined ? [] : [coverage];
      }) ?? []);
    if (retainedRequestedCoverage.size > 1
      || (retainedRequestedCoverage.size === 1
        && !retainedRequestedCoverage.has(input.request.coverage))) {
      throw new Error("hosted admission requested coverage does not match its logical pass");
    }
    const admission = createHostedAdmission({
      schemaVersion: 1,
      repositoryId: input.repositoryId,
      lineage: input.lineage,
      logicalPass,
      sourceId: input.request.provider,
      target: input.request.target,
      requestedCoverage: input.request.coverage,
      ...(input.progressVehicle === undefined ? {} : { vehicle: input.progressVehicle }),
      reviewTarget: input.reviewTarget,
      requirement: input.requirement,
      actorIdentity: input.actorIdentity,
    });
    const replay = existing?.attempts.find((attempt) => (
      attempt.hosted?.admission.admissionId === admission.admissionId
    ));
    if (replay !== undefined) {
      const result = replayHostedRequestResult(input.request, replay);
      if (result !== null) return result;
      throw new Error("hosted admission already concluded with an incompatible result");
    }
    const unresolved = existing?.attempts.find((attempt) => (
      attempt.logicalPass === logicalPass
      && attempt.hosted !== undefined
      && (attempt.outcome === "pending"
        || attempt.outcome === "ambiguous-delivery"
        || attempt.outcome === "terminal-failure")
    ));
    if (unresolved !== undefined) return { state: "ambiguous-delivery" };
    await input.authorizeCapacity({
      ownerVersion: version,
      progress: existing,
      logicalPass,
    });
    const conditionalPassAuthorizationId = input.request.ceilingOverride
      ?.conditionalPassAuthorizationId;
    if (conditionalPassAuthorizationId !== undefined) {
      const confirmDispositionSetCurrent = input.confirmDispositionSetCurrent;
      if (confirmDispositionSetCurrent === undefined) {
        throw new Error("conditional pass authorization disposition reader is unavailable");
      }
      await consumeConditionalNextPassAuthorization(store, {
        authorizationId: conditionalPassAuthorizationId,
        repositoryId: input.repositoryId,
        lane: "standard",
        lineage: input.lineage,
        producedHeadSha: input.request.target.headSha,
        nextPass: logicalPass,
        admissionId: admission.admissionId,
        now: input.now,
      }, (producerId, dispositionSetId) => confirmDispositionSetCurrent(
        producerId,
        dispositionSetId,
      ));
    }
    const attempt: LaneAttempt = {
      attemptId: admission.admissionId,
      logicalPass,
      retryGeneration: 0,
      changeRequestId: `pull/${input.request.target.pullRequest}`,
      headSha: input.request.target.headSha,
      terminalProducer: false,
      sourceId: input.request.provider,
      outcome: "pending",
      hosted: {
        admission,
        target: admission.target,
        requestedCoverage: admission.requestedCoverage,
        effectiveCoverage: null,
        ...(admission.vehicle?.kind === "delivery-member" ? { vehicle: admission.vehicle } : {}),
        reviewTarget: admission.reviewTarget,
        requirement: admission.requirement,
        actorIdentity: admission.actorIdentity,
        requestFailureReason: null,
        dispositionSetId: null,
        dispositionSetLineage: [],
        settledFindingIds: [],
        settlementEvidence: [],
      },
    };
    const next = LaneProgressStateSchema.parse(existing === null
      ? {
          schemaVersion: 1,
          semanticsVersion: "review-operation/v1",
          operationId,
          updatedAt: input.now,
          kind: "lane-progress",
          lane: "standard",
          repositoryId: input.repositoryId,
          lineage: input.lineage,
          completedPasses: 0,
          attempts: [attempt],
        }
      : { ...existing, updatedAt: input.now, attempts: [...existing.attempts, attempt] });
    try {
      await store.publishOperation(next, version);
      return { state: "admitted", admission };
    } catch (error) {
      if (!isReviewVersionConflict(error)) throw error;
    }
  }
  throw new Error("hosted admission exceeded version-conflict retry attempts");
}

/** Bind a provider acknowledgment back to the exact pre-effect admission. */
export async function acknowledgeHostedRequest(
  store: ReviewOperationStateStore,
  input: { admission: HostedAdmission; handle: HostedRequestHandle; now: string },
): Promise<LaneProgressState> {
  if (canonicalize(input.handle.admission) !== canonicalize(input.admission)) {
    throw new Error("hosted request acknowledgment does not match its admission");
  }
  const operationId = laneProgressOperationId({
    lane: "standard",
    repositoryId: input.admission.repositoryId,
    headSha: input.admission.target.headSha,
    lineage: input.admission.lineage,
  });
  for (let writeAttempt = 0; writeAttempt < REVIEW_VERSION_RETRY_ATTEMPTS; writeAttempt += 1) {
    const { version, state } = await store.readOperation(operationId);
    if (state === null || state.kind !== "lane-progress") {
      throw new Error("hosted request admission is unavailable");
    }
    const existing = LaneProgressStateSchema.parse(state);
    const index = existing.attempts.findIndex((attempt) => (
      attempt.hosted?.admission.admissionId === input.admission.admissionId
    ));
    const admitted = index < 0 ? undefined : existing.attempts[index];
    if (admitted?.hosted === undefined) throw new Error("hosted request admission is unavailable");
    const attemptId = hostedLaneAttemptId(input.handle);
    if (admitted.hosted.handle !== undefined) {
      if (admitted.attemptId === attemptId
        && canonicalize(admitted.hosted.handle) === canonicalize(input.handle)) return existing;
      throw new Error("hosted request admission already binds a different acknowledgment");
    }
    if (admitted.outcome !== "pending") {
      throw new Error("hosted request admission has already concluded");
    }
    if (existing.attempts.some((attempt, candidateIndex) => (
      candidateIndex !== index && attempt.attemptId === attemptId
    ))) throw new Error("hosted request acknowledgment identity already exists");
    const acknowledged: LaneAttempt = {
      ...admitted,
      attemptId,
      hosted: {
        ...admitted.hosted,
        handle: input.handle,
        effectiveCoverage: input.handle.effectiveCoverage,
      },
    };
    const attempts = existing.attempts.map((attempt, candidateIndex) => (
      candidateIndex === index ? acknowledged : attempt
    ));
    const next = LaneProgressStateSchema.parse({ ...existing, updatedAt: input.now, attempts });
    try {
      await store.publishOperation(next, version);
      return next;
    } catch (error) {
      if (!isReviewVersionConflict(error)) throw error;
    }
  }
  throw new Error("hosted acknowledgment exceeded version-conflict retry attempts");
}

/** Revalidate one acknowledged pending handle against its durable admission owner. */
export async function readHostedAcknowledgedRequest(
  store: ReviewOperationStateStore,
  handle: HostedRequestHandle,
): Promise<LaneProgressState> {
  const recorded = await readHostedRequestProgress(store, handle);
  if (recorded.attempt.outcome !== "pending") {
    throw new Error("hosted acknowledged request does not match durable progress");
  }
  return recorded.progress;
}

async function readHostedRequestProgress(
  store: ReviewOperationStateStore,
  handle: HostedRequestHandle,
): Promise<{ progress: LaneProgressState; attempt: LaneAttempt }> {
  const admission = handle.admission;
  const { state } = await store.readOperation(laneProgressOperationId({
    lane: "standard",
    repositoryId: admission.repositoryId,
    headSha: admission.target.headSha,
    lineage: admission.lineage,
  }));
  if (state === null || state.kind !== "lane-progress") {
    throw new Error("hosted acknowledged request is unavailable");
  }
  const progress = LaneProgressStateSchema.parse(state);
  const attempt = progress.attempts.find((candidate) => (
    candidate.attemptId === hostedLaneAttemptId(handle)
  ));
  if (attempt?.hosted?.handle === undefined
    || canonicalize(attempt.hosted.handle) !== canonicalize(handle)) {
    throw new Error("hosted acknowledged request does not match durable progress");
  }
  return { progress, attempt };
}

/** Resolve an already-sealed hosted result before any provider observation. */
export async function readHostedAwaitReplay(
  store: ReviewOperationStateStore,
  handle: HostedRequestHandle,
): Promise<{
  progress: LaneProgressState;
  result: Extract<HostedAwaitResult, { state: "clean" | "findings" }>;
  hostedResultId: string;
} | null> {
  const recorded = await readHostedRequestProgress(store, handle);
  const sealedResult = recorded.attempt.hosted?.sealedResult;
  if (sealedResult === undefined) return null;
  const result = sealedResult.outcome === "clean"
    ? {
        schemaVersion: 1 as const,
        mode: "review-hosted-await" as const,
        handle,
        state: "clean" as const,
        nextAction: "complete" as const,
        reviewUrl: sealedResult.reviewUrl,
      }
    : {
        schemaVersion: 1 as const,
        mode: "review-hosted-await" as const,
        handle,
        state: "findings" as const,
        nextAction: "triage" as const,
        reviewUrl: sealedResult.reviewUrl,
        findings: sealedResult.findings,
      };
  return {
    progress: recorded.progress,
    result,
    hostedResultId: sealedResult.hostedResultId,
  };
}

/** Resolve sealed replay before invoking the callback that performs provider observation. */
export async function resolveHostedAwaitResult(
  store: ReviewOperationStateStore,
  input: {
    repositoryId: string;
    handle: HostedRequestHandle;
    observe(): Promise<HostedAwaitResult>;
    now(): string;
  },
): Promise<{
  progress: LaneProgressState;
  result: HostedAwaitResult;
  hostedResultId: string | null;
}> {
  if (input.handle.admission.repositoryId !== input.repositoryId) {
    throw new Error("hosted await does not match its admitted repository");
  }
  const replay = await readHostedAwaitReplay(store, input.handle);
  if (replay !== null) return replay;
  await readHostedAcknowledgedRequest(store, input.handle);
  const result = await input.observe();
  const progress = await recordHostedAwaitAttempt(store, {
    repositoryId: input.repositoryId,
    result,
    now: input.now(),
  });
  const sealedResult = progress.attempts.find(({ attemptId }) => (
    attemptId === hostedLaneAttemptId(input.handle)
  ))?.hosted?.sealedResult;
  return {
    progress,
    result,
    hostedResultId: sealedResult?.hostedResultId ?? null,
  };
}

/**
 * Record one hosted await against its standard-lane progress.
 *
 * Pending results preserve the request handle without consuming a pass. A verdict-bearing outcome
 * advances that same attempt and consumes a pass; unavailable or failed attempts advance it without
 * consuming one, matching the review-policy driver's own `consumedPass` distinction.
 *
 * `repositoryId` is the store's own repository identity, not the host's `owner/repo` slug — every
 * sibling operation record keys on that identity, and both lanes must key alike for one reader to
 * find either. The host coordinates travel on `changeRequestId` and the caller's policy target.
 *
 * @param store - Versioned operation-state storage boundary.
 * @param input - The repository identity, the hosted await result, and the timestamp.
 * @returns The published lane-progress record.
 */
export async function recordHostedAwaitAttempt(
  store: ReviewOperationStateStore,
  input: {
    repositoryId: string;
    result: HostedAwaitResult;
    now: string;
  },
): Promise<LaneProgressState> {
  const outcome = hostedAwaitLaneOutcome(input.result.state);
  const { handle } = input.result;
  if (handle.admission.repositoryId !== input.repositoryId) {
    throw new Error("hosted await does not match its admitted repository");
  }
  const recorded = await readHostedRequestProgress(store, handle);
  if (outcome === null) {
    if (recorded.attempt.outcome !== "pending") {
      throw new Error("hosted pending await requires its acknowledged request");
    }
    return recorded.progress;
  }
  return await recordLaneAttempt(store, {
    lane: "standard",
    repositoryId: input.repositoryId,
    changeRequestId: `pull/${handle.target.pullRequest}`,
    headSha: handle.target.headSha,
    lineage: handle.admission.lineage,
    logicalPass: handle.admission.logicalPass,
    attemptId: hostedLaneAttemptId(handle),
    sourceId: handle.provider,
    outcome,
    consumedPass: outcome === "clean" || outcome === "findings",
    advancePendingAttempt: true,
    hosted: {
      admission: handle.admission,
      handle,
      target: handle.target,
      requestedCoverage: handle.requestedCoverage,
      effectiveCoverage: handle.effectiveCoverage,
      ...(handle.vehicle?.kind === "delivery-member" ? { vehicle: handle.vehicle } : {}),
      reviewTarget: handle.admission.reviewTarget,
      requirement: handle.admission.requirement,
      actorIdentity: handle.admission.actorIdentity,
      requestFailureReason: outcome === "terminal-failure"
        && "reason" in input.result ? input.result.reason : null,
      ...((input.result.state === "clean" || input.result.state === "findings")
        ? {
            sealedResult: createHostedSealedResult({
              attemptId: hostedLaneAttemptId(handle),
              admission: handle.admission,
              handle,
              target: handle.target,
              requestedCoverage: handle.requestedCoverage,
              effectiveCoverage: handle.effectiveCoverage,
              ...(handle.vehicle?.kind === "delivery-member" ? { vehicle: handle.vehicle } : {}),
              reviewTarget: handle.admission.reviewTarget,
              requirement: handle.admission.requirement,
              outcome: input.result.state,
              reviewUrl: input.result.reviewUrl,
              findings: input.result.state === "findings" ? input.result.findings : [],
            }),
          }
        : {}),
      dispositionSetId: null,
      dispositionSetLineage: [],
      settledFindingIds: [],
      settlementEvidence: [],
    },
    now: input.now,
  });
}

/** Persist one admitted local producer before its executable inputs leave the runtime. */
export async function recordLocalPendingAttempt(
  store: ReviewOperationStateStore,
  input: {
    state: Extract<import("./core/operation-state-schema.js").ReviewOperationState, { kind: "local-review" }>;
    ownerVersion: number;
    now: string;
  },
): Promise<LaneProgressState> {
  const { state } = input;
  const requestedCoverage = localReviewRequestedCoverage(state.requirement);
  return recordLaneAttempt(store, {
    lane: "standard",
    repositoryId: state.repositoryId,
    changeRequestId: null,
    headSha: state.target.headSha,
    lineage: state.lineage,
    logicalPass: state.logicalPass,
    retryGeneration: state.retryGeneration,
    attemptId: state.operationId,
    sourceId: state.laneSourceId,
    outcome: "pending",
    consumedPass: false,
    expectedOwnerVersion: input.ownerVersion,
    local: {
      operationId: state.operationId,
      requestId: state.requestId,
      vehicle: state.vehicle,
      target: state.target,
      requestedCoverage,
      effectiveCoverage: null,
      scopeMode: state.scopeMode,
      ...(state.deliveryAdmission === undefined ? {} : { deliveryAdmission: state.deliveryAdmission }),
    },
    now: input.now,
  });
}

/** Conclude one admitted hosted dispatch that did not produce an acknowledgment handle. */
export async function recordHostedRequestConclusion(
  store: ReviewOperationStateStore,
  input: {
    admission: HostedAdmission;
    result: Extract<HostedRequestResult, { state:
      | "rate-limited"
      | "transient-unavailable"
      | "ambiguous-delivery"
      | "terminal-failure" }>;
    now: string;
  },
): Promise<LaneProgressState> {
  const { admission, result } = input;
  if (result.provider !== admission.sourceId
    || result.requestedCoverage !== admission.requestedCoverage
    || result.attemptedProviders.length !== 1
    || result.attemptedProviders[0] !== admission.sourceId) {
    throw new Error("hosted request conclusion does not match its admission");
  }
  const operationId = laneProgressOperationId({
    lane: "standard",
    repositoryId: admission.repositoryId,
    headSha: admission.target.headSha,
    lineage: admission.lineage,
  });
  const admittedState = await store.readOperation(operationId);
  const admitted = admittedState.state?.kind === "lane-progress"
    ? admittedState.state.attempts.find((attempt) => attempt.attemptId === admission.admissionId)
    : undefined;
  if (admitted?.outcome !== "pending"
    || admitted.hosted?.handle !== undefined
    || canonicalize(admitted.hosted?.admission ?? null) !== canonicalize(admission)) {
    throw new Error("hosted request conclusion requires its unacknowledged pending admission");
  }
  return recordLaneAttempt(store, {
    lane: "standard",
    repositoryId: admission.repositoryId,
    changeRequestId: `pull/${admission.target.pullRequest}`,
    headSha: admission.target.headSha,
    lineage: admission.lineage,
    logicalPass: admission.logicalPass,
    attemptId: admission.admissionId,
    sourceId: admission.sourceId,
    outcome: result.state,
    consumedPass: false,
    advancePendingAttempt: true,
    hosted: {
      admission,
      target: admission.target,
      requestedCoverage: admission.requestedCoverage,
      effectiveCoverage: null,
      ...(admission.vehicle?.kind === "delivery-member" ? { vehicle: admission.vehicle } : {}),
      reviewTarget: admission.reviewTarget,
      requirement: admission.requirement,
      actorIdentity: admission.actorIdentity,
      requestFailureReason: result.state === "terminal-failure" ? result.reason : null,
      dispositionSetId: null,
      dispositionSetLineage: [],
      settledFindingIds: [],
      settlementEvidence: [],
    },
    now: input.now,
  });
}

/** Bind approval to one hosted findings attempt and settle findings with no host-side action. */
export async function bindHostedAttemptDisposition(
  store: ReviewOperationStateStore,
  input: {
    operationId: string;
    attemptId: string;
    dispositionSetId: string;
    findingDispositions: readonly {
      findingId: string;
      disposition: "fix" | "defer" | "reject";
      channelAction: "record-only" | "reply-and-resolve";
    }[];
    now: string;
  },
): Promise<LaneProgressState> {
  const { version, state } = await store.readOperation(input.operationId);
  if (state === null || state.kind !== "lane-progress" || state.lane !== "standard") {
    throw new Error("hosted lane findings attempt is unavailable");
  }
  const index = state.attempts.findIndex(({ attemptId }) => attemptId === input.attemptId);
  const attempt = state.attempts[index];
  if (attempt?.outcome !== "findings" || attempt.hosted === undefined) {
    throw new Error("hosted lane findings attempt is unavailable");
  }
  const recordedFindingIds = attempt.hosted.sealedResult?.findings.map(({ findingId }) => findingId).sort() ?? [];
  const dispositionFindingIds = input.findingDispositions.map(({ findingId }) => findingId).sort();
  if (new Set(dispositionFindingIds).size !== dispositionFindingIds.length
    || canonicalize(dispositionFindingIds)
    !== canonicalize(recordedFindingIds)) {
    throw new Error("approved disposition details do not cover the hosted finding set");
  }
  const dispositionByFindingId = new Map(input.findingDispositions.map((finding) => [finding.findingId, finding]));
  const noHostSettlementFindingIds = input.findingDispositions
    .filter(({ channelAction }) => channelAction === "record-only")
    .map(({ findingId }) => findingId);
  if (attempt.hosted.dispositionSetId !== null
    && attempt.hosted.dispositionSetId !== input.dispositionSetId) {
    throw new Error("hosted lane attempt already binds a different disposition set");
  }
  if (attempt.hosted.dispositionSetId === input.dispositionSetId) {
    const currentActions = attempt.hosted.dispositionSetLineage.at(-1)?.findingActions;
    if (canonicalize(currentActions ?? null) !== canonicalize(input.findingDispositions)) {
      throw new Error("hosted disposition binding replay conflicts with the recorded action plan");
    }
    return state;
  }
  const settledFindingIds = [...new Set([
    ...attempt.hosted.settledFindingIds,
    ...noHostSettlementFindingIds,
  ])].sort();
  if (settledFindingIds.some((findingId) => !recordedFindingIds.includes(findingId))) {
    throw new Error("hosted settlement references an unknown finding");
  }
  const complete = settledFindingIds.length === recordedFindingIds.length;
  const settlementEvidence = [
    ...attempt.hosted.settlementEvidence,
    ...noHostSettlementFindingIds
      .filter((findingId) => !attempt.hosted?.settlementEvidence.some((evidence) =>
        evidence.dispositionSetId === input.dispositionSetId && evidence.findingId === findingId))
      .map((findingId) => {
        const finding = dispositionByFindingId.get(findingId);
        if (finding === undefined) throw new Error("hosted settlement references an unknown disposition");
        return {
          findingId,
          dispositionSetId: input.dispositionSetId,
          disposition: finding.disposition,
          channelAction: "record-only" as const,
          performedAt: input.now,
          carriedFromDispositionSetId: null,
        };
      }),
  ];
  const attempts = [...state.attempts];
  const dispositionHasFix = input.findingDispositions.some(({ disposition }) => disposition === "fix");
  const boundAttempt: LaneAttempt = {
    ...attempt,
    outcome: complete ? "settled-findings" : "findings",
    hosted: {
      ...attempt.hosted,
      dispositionSetId: input.dispositionSetId,
      dispositionSetLineage: attempt.hosted.dispositionSetId === null
        ? [{
            dispositionSetId: input.dispositionSetId,
            predecessorDispositionSetId: null,
            successorDispositionSetId: null,
            findingActions: [...input.findingDispositions],
          }]
        : attempt.hosted.dispositionSetLineage,
      settledFindingIds,
      settlementEvidence,
    },
  };
  attempts[index] = complete && !dispositionHasFix
    ? bindCompletedConditionalPassAuthorization(boundAttempt, {
        dispositionSetId: input.dispositionSetId,
        producedHeadSha: attempt.headSha,
        now: input.now,
      })
    : boundAttempt;
  const next = LaneProgressStateSchema.parse({ ...state, updatedAt: input.now, attempts });
  await store.publishOperation(next, version);
  return next;
}

/** Record successful host-side settlement for one approved finding and close the attempt when complete. */
export async function settleHostedAttemptFinding(
  store: ReviewOperationStateStore,
  input: {
    operationId: string;
    attemptId: string;
    dispositionSetId: string;
    findingId: string;
    disposition: "fix" | "defer" | "reject";
    actorIdentity: string;
    target: HostedTarget;
    fixTarget: HostedTarget | null;
    commentId: string;
    threadId: string;
    replyDigest: string;
    replyId: string;
    now: string;
  },
): Promise<LaneProgressState> {
  const { version, state } = await store.readOperation(input.operationId);
  if (state === null || state.kind !== "lane-progress" || state.lane !== "standard") {
    throw new Error("hosted lane findings attempt is unavailable");
  }
  const index = state.attempts.findIndex(({ attemptId }) => attemptId === input.attemptId);
  const attempt = state.attempts[index];
  if (attempt === undefined
    || attempt.hosted === undefined
    || (attempt.outcome !== "findings" && attempt.outcome !== "settled-findings")
    || attempt.hosted.dispositionSetId !== input.dispositionSetId
    || !attempt.hosted.sealedResult?.findings.some(({ findingId }) => findingId === input.findingId)) {
    throw new Error("hosted finding settlement does not match the approved lane attempt");
  }
  const evidence = {
    findingId: input.findingId,
    dispositionSetId: input.dispositionSetId,
    disposition: input.disposition,
    channelAction: "reply-and-resolve" as const,
    actorIdentity: input.actorIdentity,
    target: input.target,
    fixTarget: input.fixTarget,
    commentId: input.commentId,
    threadId: input.threadId,
    replyDigest: input.replyDigest,
    replyId: input.replyId,
    performedAt: input.now,
    carriedFromDispositionSetId: null,
  };
  const currentEvidence = attempt.hosted.settlementEvidence.find((candidate) =>
    candidate.dispositionSetId === input.dispositionSetId && candidate.findingId === input.findingId);
  const currentDisposition = attempt.hosted.dispositionSetLineage.at(-1)?.findingActions
    .find(({ findingId }) => findingId === input.findingId);
  if (currentDisposition?.disposition !== input.disposition
    || currentDisposition.channelAction !== "reply-and-resolve") {
    throw new Error("hosted finding settlement does not match the approved channel action");
  }
  if (currentEvidence !== undefined) {
    const replayProjection = { ...evidence, performedAt: currentEvidence.performedAt };
    if (canonicalize(currentEvidence) !== canonicalize(replayProjection)) {
      throw new Error("hosted finding settlement conflicts with its recorded evidence");
    }
    return state;
  }
  const settledFindingIds = [...attempt.hosted.settledFindingIds, input.findingId].sort();
  const attempts = [...state.attempts];
  const settledAttempt: LaneAttempt = {
    ...attempt,
    outcome: settledFindingIds.length === attempt.hosted.sealedResult.findings.length
      ? "settled-findings"
      : "findings",
    hosted: {
      ...attempt.hosted,
      settledFindingIds,
      settlementEvidence: [...attempt.hosted.settlementEvidence, evidence],
    },
  };
  if (settledAttempt.outcome === "settled-findings") {
    const dispositionHasFix = attempt.hosted.dispositionSetLineage.at(-1)?.findingActions
      .some(({ disposition }) => disposition === "fix") ?? false;
    let producedHeadSha = attempt.headSha;
    if (dispositionHasFix && attempt.conditionalPassAuthorization !== undefined) {
      const responseHeadSha = attempt.conditionalPassAuthorization.status === "pending"
        ? attempt.conditionalPassAuthorization.responseHeadSha
        : attempt.conditionalPassAuthorization.status === "bound"
          || attempt.conditionalPassAuthorization.status === "consumed"
          ? attempt.conditionalPassAuthorization.producedHeadSha
          : undefined;
      if (responseHeadSha === undefined) {
        throw new Error("hosted fix settlement lacks durable response-head evidence");
      }
      const fixHeadShas = [...attempt.hosted.settlementEvidence, evidence]
        .flatMap((candidate) => candidate.disposition === "fix"
          && candidate.channelAction === "reply-and-resolve"
          && candidate.fixTarget !== null
          ? [candidate.fixTarget.headSha]
          : []);
      if (fixHeadShas.length === 0 || fixHeadShas.some((headSha) => headSha !== responseHeadSha)) {
        throw new Error("hosted fix settlement does not match durable response-head evidence");
      }
      producedHeadSha = responseHeadSha;
    }
    attempts[index] = bindCompletedConditionalPassAuthorization(settledAttempt, {
      dispositionSetId: input.dispositionSetId,
      producedHeadSha,
      now: input.now,
    });
  } else {
    attempts[index] = settledAttempt;
  }
  const next = LaneProgressStateSchema.parse({ ...state, updatedAt: input.now, attempts });
  await store.publishOperation(next, version);
  return next;
}

export interface HostedDispositionSupersessionResult {
  readonly progress: LaneProgressState;
  readonly carriedFindingIds: readonly string[];
  readonly reopenedFindingIds: readonly string[];
}

export interface HostedDispositionSupersessionInput {
  readonly operationId: string;
  readonly attemptId: string;
  readonly predecessorDispositionSetId: string;
  readonly successorDispositionSetId: string;
  readonly findingDispositions: readonly {
    readonly findingId: string;
    readonly disposition: "fix" | "defer" | "reject";
    readonly channelAction: "record-only" | "reply-and-resolve";
  }[];
  readonly now: string;
}

/** Typed hosted-settlement refusal that a response successor can expose without masking I/O failures. */
export class HostedDispositionSupersessionError extends Error {
  readonly code = "hosted-settlement-conflict" as const;

  constructor(
    readonly reason: "ambiguous-settlement" | "conflicting-successor",
    message: string,
  ) {
    super(message);
    this.name = "HostedDispositionSupersessionError";
  }
}

/**
 * Advance one hosted attempt from an approved disposition set to its exact successor.
 *
 * @param store - Versioned lane-progress owner to update.
 * @param input - Exact predecessor, successor, and approved finding-action bindings.
 * @returns Updated progress plus settlement carry/reopen projection.
 */
export async function supersedeHostedAttemptDisposition(
  store: ReviewOperationStateStore,
  input: HostedDispositionSupersessionInput,
): Promise<HostedDispositionSupersessionResult> {
  const { version, state } = await store.readOperation(input.operationId);
  if (state === null || state.kind !== "lane-progress" || state.lane !== "standard") {
    throw new Error("hosted lane findings attempt is unavailable");
  }
  const index = state.attempts.findIndex(({ attemptId }) => attemptId === input.attemptId);
  const attempt = state.attempts[index];
  const hosted = attempt?.hosted;
  if (attempt === undefined
    || hosted === undefined
    || hosted.sealedResult?.outcome !== "findings"
    || (attempt.outcome !== "findings" && attempt.outcome !== "settled-findings")) {
    throw new Error("hosted lane findings attempt is unavailable");
  }
  const recordedFindingIds = hosted.sealedResult.findings.map(({ findingId }) => findingId).sort();
  const successorFindingIds = input.findingDispositions.map(({ findingId }) => findingId).sort();
  if (new Set(successorFindingIds).size !== successorFindingIds.length
    || canonicalize(successorFindingIds) !== canonicalize(recordedFindingIds)) {
    throw new Error("successor dispositions do not cover the hosted finding set");
  }
  const successorByFindingId = new Map(input.findingDispositions.map((finding) => [finding.findingId, finding]));
  const predecessorEvidence = hosted.settlementEvidence.filter(({ dispositionSetId }) =>
    dispositionSetId === input.predecessorDispositionSetId);
  const predecessorEvidenceByFindingId = new Map(predecessorEvidence.map((evidence) => [evidence.findingId, evidence]));
  const predecessorSettledFindingIds = hosted.dispositionSetId === input.predecessorDispositionSetId
    ? hosted.settledFindingIds
    : predecessorEvidence.map(({ findingId }) => findingId);
  if (predecessorSettledFindingIds.some((findingId) => !predecessorEvidenceByFindingId.has(findingId))) {
    throw new HostedDispositionSupersessionError(
      "ambiguous-settlement",
      "hosted predecessor settlement cannot be attributed exactly",
    );
  }
  const carriedEvidence = predecessorSettledFindingIds.flatMap((findingId) => {
    const evidence = predecessorEvidenceByFindingId.get(findingId);
    const successor = successorByFindingId.get(findingId);
    if (evidence === undefined || successor === undefined
      || evidence.disposition !== successor.disposition
      || evidence.channelAction !== successor.channelAction) {
      return [];
    }
    return [{
      ...evidence,
      dispositionSetId: input.successorDispositionSetId,
      carriedFromDispositionSetId: input.predecessorDispositionSetId,
    }];
  });
  const carriedFindingIds = carriedEvidence.map(({ findingId }) => findingId).sort();
  const reopenedFindingIds = predecessorSettledFindingIds
    .filter((findingId) => !carriedFindingIds.includes(findingId))
    .sort();

  if (hosted.dispositionSetId === input.successorDispositionSetId) {
    const predecessorNode = hosted.dispositionSetLineage.find(({ dispositionSetId }) =>
      dispositionSetId === input.predecessorDispositionSetId);
    const successorNode = hosted.dispositionSetLineage.at(-1);
    const currentEvidence = hosted.settlementEvidence.filter(({ dispositionSetId }) =>
      dispositionSetId === input.successorDispositionSetId);
    if (predecessorNode?.successorDispositionSetId !== input.successorDispositionSetId
      || successorNode?.predecessorDispositionSetId !== input.predecessorDispositionSetId
      || canonicalize(successorNode.findingActions) !== canonicalize(input.findingDispositions)
      || canonicalize(currentEvidence) !== canonicalize(carriedEvidence)
      || canonicalize([...hosted.settledFindingIds].sort()) !== canonicalize(carriedFindingIds)) {
      throw new HostedDispositionSupersessionError(
        "conflicting-successor",
        "hosted disposition successor replay conflicts with recorded progress",
      );
    }
    return { progress: state, carriedFindingIds, reopenedFindingIds };
  }
  if (hosted.dispositionSetId !== input.predecessorDispositionSetId) {
    throw new HostedDispositionSupersessionError(
      "conflicting-successor",
      "hosted disposition successor does not advance the current predecessor",
    );
  }
  const predecessorNode = hosted.dispositionSetLineage.at(-1);
  if (predecessorNode?.dispositionSetId !== input.predecessorDispositionSetId
    || predecessorNode.successorDispositionSetId !== null) {
    throw new HostedDispositionSupersessionError(
      "conflicting-successor",
      "hosted disposition predecessor is stale or already superseded",
    );
  }
  const dispositionSetLineage = [
    ...hosted.dispositionSetLineage.slice(0, -1),
    { ...predecessorNode, successorDispositionSetId: input.successorDispositionSetId },
    {
      dispositionSetId: input.successorDispositionSetId,
      predecessorDispositionSetId: input.predecessorDispositionSetId,
      successorDispositionSetId: null,
      findingActions: [...input.findingDispositions],
    },
  ];
  const attempts = [...state.attempts];
  attempts[index] = {
    ...attempt,
    outcome: carriedFindingIds.length === recordedFindingIds.length
      ? "settled-findings"
      : "findings",
    hosted: {
      ...hosted,
      dispositionSetId: input.successorDispositionSetId,
      dispositionSetLineage,
      settledFindingIds: carriedFindingIds,
      settlementEvidence: [...hosted.settlementEvidence, ...carriedEvidence],
    },
  };
  const progress = LaneProgressStateSchema.parse({ ...state, updatedAt: input.now, attempts });
  await store.publishOperation(progress, version);
  return { progress, carriedFindingIds, reopenedFindingIds };
}

/**
 * Validate and project a hosted disposition successor without publishing it.
 *
 * @param store - Versioned lane-progress owner to inspect.
 * @param input - Exact predecessor, successor, and approved finding-action bindings.
 * @returns The same carry/reopen projection that publication would produce.
 */
export async function inspectHostedAttemptDispositionSupersession(
  store: ReviewOperationStateStore,
  input: HostedDispositionSupersessionInput,
): Promise<HostedDispositionSupersessionResult> {
  return supersedeHostedAttemptDisposition({
    readOperation: (operationId) => store.readOperation(operationId),
    publishOperation: (_state, expectedVersion) => Promise.resolve({ version: expectedVersion + 1 }),
  }, input);
}

/**
 * Persist one explicit next-pass authorization beside its terminal producer.
 *
 * @param store - Versioned lane-progress owner to update.
 * @param input - Authorizer, producer, lineage, and named-pass bindings.
 * @returns Updated progress and the stable authorization identity.
 */
export async function captureConditionalNextPassAuthorization(
  store: ReviewOperationStateStore,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    lineage: LaneSubjectLineage;
    producerId: string;
    dispositionSetId: string;
    authorizedBy: string;
    exhaustedPassCount: number;
    nextPass: number;
    now: string;
  },
): Promise<{ progress: LaneProgressState; authorizationId: string }> {
  const operationId = laneProgressOperationId(input);
  const authorizationId = computeConditionalPassAuthorizationId({
    authorizedBy: input.authorizedBy,
    repositoryId: input.repositoryId,
    lane: input.lane,
    lineage: input.lineage,
    producerId: input.producerId,
    dispositionSetId: input.dispositionSetId,
    originatingHeadSha: input.headSha,
    exhaustedPassCount: input.exhaustedPassCount,
    nextPass: input.nextPass,
  });
  for (let writeAttempt = 0; writeAttempt < REVIEW_VERSION_RETRY_ATTEMPTS; writeAttempt += 1) {
    const { version, state } = await store.readOperation(operationId);
    if (state === null
      || state.kind !== "lane-progress"
      || state.lane !== input.lane
      || state.repositoryId !== input.repositoryId
      || canonicalize(state.lineage) !== canonicalize(input.lineage)) {
      throw new Error("conditional pass authorization lane owner is unavailable");
    }
    const index = state.attempts.findIndex(({ attemptId }) => attemptId === input.producerId);
    const attempt = state.attempts[index];
    if (attempt === undefined
      || !attempt.terminalProducer
      || attempt.headSha !== input.headSha
      || attempt.logicalPass !== input.exhaustedPassCount
      || input.nextPass !== input.exhaustedPassCount + 1) {
      throw new Error("conditional pass authorization does not match its terminal producer");
    }
    const authorization = {
      schemaVersion: 1 as const,
      authorizationId,
      status: "pending" as const,
      authorizedBy: input.authorizedBy,
      repositoryId: input.repositoryId,
      lane: input.lane,
      lineage: input.lineage,
      producerId: input.producerId,
      dispositionSetId: input.dispositionSetId,
      originatingHeadSha: input.headSha,
      exhaustedPassCount: input.exhaustedPassCount,
      nextPass: input.nextPass,
      capturedAt: input.now,
    };
    if (attempt.conditionalPassAuthorization !== undefined) {
      const current = attempt.conditionalPassAuthorization;
      const replay = { ...authorization, capturedAt: current.capturedAt };
      if (current.authorizationId !== authorizationId
        || current.authorizedBy !== replay.authorizedBy
        || current.repositoryId !== replay.repositoryId
        || current.lane !== replay.lane
        || canonicalize(current.lineage) !== canonicalize(replay.lineage)
        || current.producerId !== replay.producerId
        || current.dispositionSetId !== replay.dispositionSetId
        || current.originatingHeadSha !== replay.originatingHeadSha
        || current.exhaustedPassCount !== replay.exhaustedPassCount
        || current.nextPass !== replay.nextPass) {
        throw new Error("conditional pass authorization replay conflicts with recorded authority");
      }
      return { progress: state, authorizationId };
    }
    const attempts = [...state.attempts];
    attempts[index] = { ...attempt, conditionalPassAuthorization: authorization };
    const progress = LaneProgressStateSchema.parse({ ...state, updatedAt: input.now, attempts });
    try {
      await store.publishOperation(progress, version);
      return { progress, authorizationId };
    } catch (error) {
      if (!isReviewVersionConflict(error)) throw error;
    }
  }
  throw new Error("conditional pass authorization exceeded version-conflict retry attempts");
}

export type ConditionalPassWithdrawalResult =
  | {
      state: "withdrawn" | "already-withdrawn";
      progress: LaneProgressState;
      authorizationId: string;
      dispositionSetId: string;
    }
  | {
      state: "refused";
      reason: "consumed" | "superseded" | "stale-current-set" | "foreign-authority";
      detail: string;
    };

/**
 * Withdraw one exact unconsumed response-gated pass authorization.
 *
 * @param store - Versioned lane-progress owner to update.
 * @param input - Exact source, authorization, and withdrawing-authority binding.
 * @param confirmDispositionSetCurrent - Current approved-disposition confirmation boundary.
 * @returns A typed withdrawal, replay, or refusal without rewriting other authority.
 */
export async function withdrawConditionalNextPassAuthorization(
  store: ReviewOperationStateStore,
  input: {
    authorizationId: string;
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    lineage: LaneSubjectLineage;
    producerId: string;
    dispositionSetId: string;
    withdrawnBy: string;
    now: string;
  },
  confirmDispositionSetCurrent: (
    producerId: string,
    dispositionSetId: string,
  ) => Promise<boolean>,
): Promise<ConditionalPassWithdrawalResult> {
  const operationId = laneProgressOperationId(input);
  const refuse = (
    reason: Extract<ConditionalPassWithdrawalResult, { state: "refused" }>["reason"],
    detail: string,
  ): ConditionalPassWithdrawalResult => ({ state: "refused", reason, detail });
  for (let writeAttempt = 0; writeAttempt < REVIEW_VERSION_RETRY_ATTEMPTS; writeAttempt += 1) {
    const { version, state } = await store.readOperation(operationId);
    if (state === null
      || state.kind !== "lane-progress"
      || state.lane !== input.lane
      || state.repositoryId !== input.repositoryId
      || canonicalize(state.lineage) !== canonicalize(input.lineage)) {
      return refuse("foreign-authority", "conditional pass authorization owner does not match the response source");
    }
    const index = state.attempts.findIndex(({ attemptId }) => attemptId === input.producerId);
    const attempt = state.attempts[index];
    const authorization = attempt?.conditionalPassAuthorization;
    if (attempt === undefined
      || authorization === undefined
      || !attempt.terminalProducer
      || attempt.headSha !== input.headSha
      || authorization.authorizationId !== input.authorizationId
      || authorization.authorizedBy !== input.withdrawnBy
      || authorization.repositoryId !== input.repositoryId
      || authorization.lane !== input.lane
      || canonicalize(authorization.lineage) !== canonicalize(input.lineage)
      || authorization.producerId !== input.producerId
      || authorization.dispositionSetId !== input.dispositionSetId
      || authorization.originatingHeadSha !== input.headSha) {
      return refuse("foreign-authority", "conditional pass authorization does not match the withdrawal request");
    }
    if (authorization.status === "invalidated") {
      if (authorization.reason === "superseded") {
        return refuse("superseded", "superseded conditional pass authorization cannot be withdrawn");
      }
      if (authorization.withdrawnBy !== input.withdrawnBy) {
        return refuse("foreign-authority", "conditional pass authorization was withdrawn by another authority");
      }
      return {
        state: "already-withdrawn",
        progress: state,
        authorizationId: authorization.authorizationId,
        dispositionSetId: authorization.dispositionSetId,
      };
    }
    if (authorization.status === "consumed") {
      return refuse("consumed", "consumed conditional pass authorization cannot be withdrawn");
    }
    if (!await confirmDispositionSetCurrent(input.producerId, input.dispositionSetId)) {
      return refuse("stale-current-set", "conditional pass authorization disposition set is not current");
    }
    const attempts = [...state.attempts];
    attempts[index] = {
      ...attempt,
      conditionalPassAuthorization: {
        schemaVersion: authorization.schemaVersion,
        authorizationId: authorization.authorizationId,
        status: "invalidated",
        authorizedBy: authorization.authorizedBy,
        repositoryId: authorization.repositoryId,
        lane: authorization.lane,
        lineage: authorization.lineage,
        producerId: authorization.producerId,
        dispositionSetId: authorization.dispositionSetId,
        originatingHeadSha: authorization.originatingHeadSha,
        exhaustedPassCount: authorization.exhaustedPassCount,
        nextPass: authorization.nextPass,
        capturedAt: authorization.capturedAt,
        reason: "withdrawn",
        withdrawnBy: input.withdrawnBy,
        invalidatedAt: input.now,
      },
    };
    const progress = LaneProgressStateSchema.parse({ ...state, updatedAt: input.now, attempts });
    try {
      await store.publishOperation(progress, version);
      return {
        state: "withdrawn",
        progress,
        authorizationId: authorization.authorizationId,
        dispositionSetId: authorization.dispositionSetId,
      };
    } catch (error) {
      if (!isReviewVersionConflict(error)) throw error;
    }
  }
  throw new Error("conditional pass withdrawal exceeded version-conflict retry attempts");
}

/**
 * Invalidate a pending response-gated pass authorization when its approved set is superseded.
 *
 * @param store - Versioned lane-progress owner to update.
 * @param input - Superseded authorization binding and successor disposition identity.
 * @returns Updated progress, unchanged progress when no capture exists, or null when the lane owner is absent.
 */
export async function invalidateConditionalNextPassAuthorization(
  store: ReviewOperationStateStore,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    lineage: LaneSubjectLineage;
    producerId: string;
    dispositionSetId: string;
    successorDispositionSetId: string;
    now: string;
  },
): Promise<LaneProgressState | null> {
  const operationId = laneProgressOperationId(input);
  for (let writeAttempt = 0; writeAttempt < REVIEW_VERSION_RETRY_ATTEMPTS; writeAttempt += 1) {
    const { version, state } = await store.readOperation(operationId);
    if (state === null
      || state.kind !== "lane-progress"
      || state.lane !== input.lane
      || state.repositoryId !== input.repositoryId
      || canonicalize(state.lineage) !== canonicalize(input.lineage)) return null;
    const index = state.attempts.findIndex(({ attemptId }) => attemptId === input.producerId);
    const attempt = state.attempts[index];
    const authorization = attempt?.conditionalPassAuthorization;
    if (attempt === undefined || authorization === undefined) return state;
    if (authorization.producerId !== input.producerId
      || authorization.dispositionSetId !== input.dispositionSetId) {
      throw new Error("conditional pass authorization does not match the superseded disposition");
    }
    if (authorization.status === "invalidated") {
      if (authorization.reason === "withdrawn") return state;
      if (authorization.successorDispositionSetId !== input.successorDispositionSetId) {
        throw new Error("conditional pass authorization invalidation replay conflicts");
      }
      return state;
    }
    if (authorization.status === "consumed") {
      throw new Error("consumed conditional pass authorization cannot be invalidated");
    }
    const attempts = [...state.attempts];
    attempts[index] = {
      ...attempt,
      conditionalPassAuthorization: {
        schemaVersion: authorization.schemaVersion,
        authorizationId: authorization.authorizationId,
        status: "invalidated",
        authorizedBy: authorization.authorizedBy,
        repositoryId: authorization.repositoryId,
        lane: authorization.lane,
        lineage: authorization.lineage,
        producerId: authorization.producerId,
        dispositionSetId: authorization.dispositionSetId,
        originatingHeadSha: authorization.originatingHeadSha,
        exhaustedPassCount: authorization.exhaustedPassCount,
        nextPass: authorization.nextPass,
        capturedAt: authorization.capturedAt,
        reason: "superseded",
        successorDispositionSetId: input.successorDispositionSetId,
        invalidatedAt: input.now,
      },
    };
    const progress = LaneProgressStateSchema.parse({ ...state, updatedAt: input.now, attempts });
    try {
      await store.publishOperation(progress, version);
      return progress;
    } catch (error) {
      if (!isReviewVersionConflict(error)) throw error;
    }
  }
  throw new Error("conditional pass authorization invalidation exceeded version-conflict retry attempts");
}

/**
 * Inspect whether supersession may invalidate a response-gated pass authorization.
 *
 * @param store - Versioned lane-progress owner to inspect.
 * @param input - Superseded authorization binding and successor disposition identity.
 * @returns A typed refusal only when the named authorization has already been consumed.
 */
export async function inspectConditionalNextPassInvalidation(
  store: ReviewOperationStateStore,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    lineage: LaneSubjectLineage;
    producerId: string;
    dispositionSetId: string;
    successorDispositionSetId: string;
  },
): Promise<
  | { state: "ready" }
  | { state: "refused"; reason: "fix-consumed"; detail: string }
> {
  const operationId = laneProgressOperationId(input);
  const { state } = await store.readOperation(operationId);
  if (state === null
    || state.kind !== "lane-progress"
    || state.lane !== input.lane
    || state.repositoryId !== input.repositoryId
    || canonicalize(state.lineage) !== canonicalize(input.lineage)) return { state: "ready" };
  const attempt = state.attempts.find(({ attemptId }) => attemptId === input.producerId);
  const authorization = attempt?.conditionalPassAuthorization;
  if (attempt === undefined || authorization === undefined) return { state: "ready" };
  if (authorization.producerId !== input.producerId
    || authorization.dispositionSetId !== input.dispositionSetId) {
    throw new Error("conditional pass authorization does not match the superseded disposition");
  }
  if (authorization.status === "invalidated") {
    if (authorization.reason === "withdrawn") return { state: "ready" };
    if (authorization.successorDispositionSetId !== input.successorDispositionSetId) {
      throw new Error("conditional pass authorization invalidation replay conflicts");
    }
    return { state: "ready" };
  }
  if (authorization.status === "consumed") {
    return {
      state: "refused",
      reason: "fix-consumed",
      detail: "consumed conditional pass authorization cannot be superseded",
    };
  }
  return { state: "ready" };
}

/**
 * Consume one bound response-gated authorization for its named logical pass.
 *
 * @param store - Versioned lane-progress store and complete snapshot reader.
 * @param input - Authorization identity and the exact pass admission it enables.
 * @returns The updated authorization owner and retained consumption evidence.
 */
export async function consumeConditionalNextPassAuthorization(
  store: ReviewOperationStateStore,
  input: {
    authorizationId: string;
    repositoryId: string;
    lane: LaneProgressState["lane"];
    lineage: LaneSubjectLineage;
    producedHeadSha: string;
    nextPass: number;
    admissionId: string;
    now: string;
  },
  confirmDispositionSetCurrent: (
    producerId: string,
    dispositionSetId: string,
  ) => Promise<boolean>,
): Promise<LaneProgressState> {
  const readOperationSnapshot = (store as Partial<ReviewOperationStateSnapshotIndex>)
    .readOperationSnapshot;
  if (typeof readOperationSnapshot !== "function") {
    throw new Error("conditional pass authorization snapshot reader is unavailable");
  }
  for (let writeAttempt = 0; writeAttempt < REVIEW_VERSION_RETRY_ATTEMPTS; writeAttempt += 1) {
    const snapshot: Awaited<ReturnType<ReviewOperationStateSnapshotIndex["readOperationSnapshot"]>> =
      await readOperationSnapshot.call(store);
    if (snapshot.status !== "complete") {
      throw new Error("conditional pass authorization snapshot is unavailable");
    }
    const matches = snapshot.records.flatMap((record) => {
      if (record.state.kind !== "lane-progress") return [];
      const attempt = record.state.attempts.find((candidate) =>
        candidate.conditionalPassAuthorization?.authorizationId === input.authorizationId);
      return attempt === undefined ? [] : [{ ...record, progress: record.state, attempt }];
    });
    if (matches.length !== 1) {
      throw new Error("conditional pass authorization is unavailable or ambiguous");
    }
    const match = matches[0];
    if (match === undefined) throw new Error("conditional pass authorization is unavailable");
    const authorization = match.attempt.conditionalPassAuthorization;
    if (authorization === undefined) throw new Error("conditional pass authorization is unavailable");
    if (authorization.repositoryId !== input.repositoryId
      || authorization.lane !== input.lane
      || !conditionalContinuationLineageMatches(authorization.lineage, input.lineage)
      || authorization.nextPass !== input.nextPass) {
      throw new Error("conditional pass authorization does not match the named admission");
    }
    if (!await confirmDispositionSetCurrent(
      authorization.producerId,
      authorization.dispositionSetId,
    )) {
      throw new Error("conditional pass authorization disposition set is not current");
    }
    if (authorization.status === "pending") {
      throw new Error("conditional pass authorization response is not complete");
    }
    if (authorization.status === "invalidated") {
      throw new Error("conditional pass authorization is invalidated");
    }
    if (authorization.producedHeadSha !== input.producedHeadSha) {
      throw new Error("conditional pass authorization does not match the produced head");
    }
    const terminalAlreadyRecorded = snapshot.records.some(({ state }) => (
      state.kind === "lane-progress"
      && state.repositoryId === input.repositoryId
      && state.lane === input.lane
      && conditionalContinuationLineageMatches(state.lineage, input.lineage)
      && state.attempts.some((attempt) => (
        attempt.headSha === input.producedHeadSha
        && attempt.logicalPass === input.nextPass
        && attempt.terminalProducer
      ))
    ));
    if (terminalAlreadyRecorded) {
      throw new Error("conditional pass authorization named pass is already complete");
    }
    if (authorization.status === "consumed") {
      if (authorization.admissionId !== input.admissionId) {
        throw new Error("conditional pass authorization was already consumed by another admission");
      }
      return match.progress;
    }
    const attemptIndex = match.progress.attempts.findIndex((candidate) =>
      candidate.attemptId === match.attempt.attemptId);
    const attempts = [...match.progress.attempts];
    attempts[attemptIndex] = {
      ...match.attempt,
      conditionalPassAuthorization: {
        ...authorization,
        status: "consumed",
        admissionId: input.admissionId,
        consumedAt: input.now,
      },
    };
    const progress = LaneProgressStateSchema.parse({
      ...match.progress,
      updatedAt: input.now,
      attempts,
    });
    try {
      await store.publishOperation(progress, match.version);
      return progress;
    } catch (error) {
      if (!isReviewVersionConflict(error)) throw error;
    }
  }
  throw new Error("conditional pass authorization consumption exceeded version-conflict retry attempts");
}

/**
 * Frontline reason classes keyed to the driver's outcome vocabulary.
 *
 * The four retryable carrier failures map onto `transient-unavailable` because that is the lane's
 * own classification of them — the frontline run command routes exactly these to a retry action —
 * and it is the only value in the driver's vocabulary carrying that meaning.
 */
const FRONTLINE_REASON_OUTCOMES = {
  "rate-limited": "rate-limited",
  "transient-unavailable": "transient-unavailable",
  "source-unbound": "source-unbound",
  "capability-unsupported": "capability-unsupported",
  "execution-timeout": "timed-out",
  "head-mismatch": "stale-target",
  "target-mismatch": "stale-target",
  "invalid-output": "malformed",
  "authorization-rejected": "terminal-failure",
  "transient-transport": "transient-unavailable",
  "process-failure": "transient-unavailable",
  "signal-termination": "transient-unavailable",
  "unexpected-adapter-failure": "transient-unavailable",
} as const satisfies Record<string, LaneAttemptOutcome>;

/**
 * Map one frontline execution outcome onto the driver's attempt vocabulary.
 *
 * @param outcome - The outcome discriminator.
 * @param reasonClass - The outcome's reason class, or `null` for a verdict-bearing outcome.
 * @returns The driver-grade outcome, or `null` when the outcome concluded no attempt.
 */
export function frontlineLaneOutcome(outcome: string, reasonClass: string | null): LaneAttemptOutcome | null {
  if (outcome === "clean" || outcome === "findings") return outcome;
  if (reasonClass !== null && reasonClass in FRONTLINE_REASON_OUTCOMES) {
    return FRONTLINE_REASON_OUTCOMES[reasonClass as keyof typeof FRONTLINE_REASON_OUTCOMES];
  }
  return null;
}

/**
 * Record one concluded frontline execution against its lane progress.
 *
 * @param store - Versioned operation-state storage boundary.
 * @param input - The frontline execution outcome and the timestamp to record it at.
 * @returns The published record, or `null` when the outcome concluded no attempt.
 */
export async function recordFrontlineAttempt(
  store: ReviewOperationStateStore,
  input: { admission: FrontlineAdmission; outcome: FrontlineExecutionOutcome; now: string },
): Promise<LaneProgressState | null> {
  const { admission, outcome } = input;
  const admittedSource = admission.frontlineReview.source;
  if (admittedSource === null
    || canonicalize(outcome.target) !== canonicalize(admission.target)
    || canonicalize(outcome.source) !== canonicalize(admittedSource)
    || outcome.pass !== admission.logicalPass
    || outcome.maxPasses !== admission.maxPasses) {
    throw new Error("frontline outcome does not match its admission");
  }
  const laneOutcome = frontlineLaneOutcome(outcome.outcome, outcome.reason?.class ?? null);
  if (laneOutcome === null) return null;
  const complete = laneOutcome === "clean" || laneOutcome === "findings";
  return await recordLaneAttempt(store, {
    lane: "frontline",
    repositoryId: outcome.target.repositoryId,
    changeRequestId: null,
    headSha: outcome.target.headSha,
    lineage: admission.lineage,
    logicalPass: admission.logicalPass,
    retryGeneration: admission.retryGeneration,
    attemptId: admission.operationId,
    sourceId: outcome.source.sourceId,
    outcome: laneOutcome,
    consumedPass: complete,
    chunkSeriesComplete: complete,
    frontline: {
      admission,
      effectiveCoverage: complete ? "complete" : null,
    },
    now: input.now,
    advancePendingAttempt: true,
  });
}

/** Mark one persisted findings verdict settled after its approved record is durable. */
export async function settleLaneAttempt(
  store: ReviewOperationStateStore,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    lineage?: LaneSubjectLineage;
    attemptId: string;
    dispositionSetId?: string;
    producedHeadSha?: string;
    now: string;
  },
): Promise<LaneProgressState> {
  const operationId = laneProgressOperationId(input);
  const { version, state } = await store.readOperation(operationId);
  if (state === null
    || state.kind !== "lane-progress"
    || state.lane !== input.lane
    || state.repositoryId !== input.repositoryId) {
    throw new Error("lane findings attempt is unavailable");
  }
  const index = state.attempts.findIndex((attempt) => attempt.attemptId === input.attemptId);
  const attempt = state.attempts[index];
  if (attempt === undefined) throw new Error("lane findings attempt is unavailable");
  if (attempt.headSha !== input.headSha) throw new Error("lane findings attempt is unavailable");
  if (attempt.outcome !== "findings" && attempt.outcome !== "settled-findings") {
    throw new Error("lane attempt does not carry findings");
  }
  let settledAttempt: LaneAttempt = attempt.outcome === "settled-findings"
    ? attempt
    : { ...attempt, outcome: "settled-findings" };
  const authorization = attempt.conditionalPassAuthorization;
  if (authorization !== undefined) {
    if (input.dispositionSetId === undefined || input.producedHeadSha === undefined) {
      throw new Error("conditional pass authorization requires exact response-performance evidence");
    }
    settledAttempt = bindCompletedConditionalPassAuthorization(settledAttempt, {
      dispositionSetId: input.dispositionSetId,
      producedHeadSha: input.producedHeadSha,
      now: input.now,
    });
  }
  if (canonicalize(settledAttempt) === canonicalize(attempt)) return state;
  const attempts = [...state.attempts];
  attempts[index] = settledAttempt;
  const next = LaneProgressStateSchema.parse({
    ...state,
    updatedAt: input.now,
    attempts,
  });
  await store.publishOperation(next, version);
  return next;
}

/** Record the durable head produced by a fully performed approved response. */
export async function recordLaneResponsePerformance(
  store: ReviewOperationStateStore,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    lineage: LaneSubjectLineage;
    attemptId: string;
    dispositionSetId: string;
    producedHeadSha: string;
    now: string;
  },
): Promise<LaneProgressState> {
  const operationId = laneProgressOperationId(input);
  for (let writeAttempt = 0; writeAttempt < REVIEW_VERSION_RETRY_ATTEMPTS; writeAttempt += 1) {
    const { version, state } = await store.readOperation(operationId);
    if (state === null
      || state.kind !== "lane-progress"
      || state.lane !== input.lane
      || state.repositoryId !== input.repositoryId
      || canonicalize(state.lineage) !== canonicalize(input.lineage)) {
      throw new Error("lane response performance owner is unavailable");
    }
    const index = state.attempts.findIndex(({ attemptId }) => attemptId === input.attemptId);
    const attempt = state.attempts[index];
    if (attempt === undefined
      || attempt.headSha !== input.headSha
      || (attempt.outcome !== "findings" && attempt.outcome !== "settled-findings")) {
      throw new Error("lane response performance does not match its findings producer");
    }
    const authorization = attempt.conditionalPassAuthorization;
    let performedAttempt = attempt;
    if (attempt.hosted === undefined) {
      performedAttempt = { ...attempt, outcome: "settled-findings" };
    }
    if (authorization !== undefined) {
      if (authorization.dispositionSetId !== input.dispositionSetId) {
        throw new Error("conditional pass authorization does not match the performed response");
      }
      if (authorization.status === "invalidated") {
        throw new Error("invalidated conditional pass authorization cannot record response performance");
      }
      if (authorization.status === "consumed") {
        if (authorization.producedHeadSha !== input.producedHeadSha) {
          throw new Error("conditional pass authorization response-head replay conflicts");
        }
        return state;
      }
      if (attempt.hosted === undefined || attempt.outcome === "settled-findings") {
        performedAttempt = bindCompletedConditionalPassAuthorization(performedAttempt, {
          dispositionSetId: input.dispositionSetId,
          producedHeadSha: input.producedHeadSha,
          now: input.now,
        });
      } else if (authorization.status === "pending") {
        if (authorization.responseHeadSha !== undefined) {
          if (authorization.responseHeadSha !== input.producedHeadSha) {
            throw new Error("conditional pass authorization response-head replay conflicts");
          }
          return state;
        }
        performedAttempt = {
          ...performedAttempt,
          conditionalPassAuthorization: {
            ...authorization,
            responseHeadSha: input.producedHeadSha,
            responsePerformedAt: input.now,
          },
        };
      }
    }
    if (canonicalize(performedAttempt) === canonicalize(attempt)) return state;
    const attempts = [...state.attempts];
    attempts[index] = performedAttempt;
    const next = LaneProgressStateSchema.parse({ ...state, updatedAt: input.now, attempts });
    try {
      await store.publishOperation(next, version);
      return next;
    } catch (error) {
      if (!isReviewVersionConflict(error)) throw error;
    }
  }
  throw new Error("lane response performance exceeded version-conflict retry attempts");
}

type LanePolicyLocalBinding = Omit<
  NonNullable<LaneAttempt["local"]>,
  "operationId" | "requestId"
> & Partial<Pick<NonNullable<LaneAttempt["local"]>, "operationId" | "requestId">>;

export type LanePolicyAttempt = Pick<
  LaneAttempt,
  "attemptId" | "logicalPass" | "sourceId" | "outcome" | "chunkSeriesComplete"
> & {
  hosted?: LaneAttempt["hosted"];
  local?: LanePolicyLocalBinding;
  frontline?: LaneAttempt["frontline"];
};

export type LaneProgressProjection =
  | { status: "unrecorded" }
  | {
    status: "recorded";
    completedPasses: number;
    completePasses: number;
    attempts: readonly LanePolicyAttempt[];
  };

/** Read one complete lineage owner without applying an exact-head projection. */
export async function readLaneProgressOwnerVersioned(
  store: ReviewOperationStateStore,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    lineage: LaneSubjectLineage;
  },
): Promise<{ version: number; state: LaneProgressState | null }> {
  const { version, state } = await store.readOperation(laneProgressOperationId(input));
  if (state === null
    || state.kind !== "lane-progress"
    || state.lane !== input.lane
    || state.repositoryId !== input.repositoryId
    || canonicalize(state.lineage) !== canonicalize(input.lineage)) return { version, state: null };
  return { version, state };
}

/** Read one complete lineage owner without applying an exact-head projection. */
export async function readLaneProgressOwner(
  store: ReviewOperationStateStore,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    lineage: LaneSubjectLineage;
  },
): Promise<LaneProgressState | null> {
  return (await readLaneProgressOwnerVersioned(store, input)).state;
}

/** Resolve the exact lane-owner attempt that authorizes one local operation. */
export async function readAdmittedLocalLaneAttempt(
  store: ReviewOperationStateStore,
  state: LocalReviewState,
): Promise<LaneAttempt | null> {
  const owner = await readLaneProgressOwner(store, {
    lane: "standard",
    repositoryId: state.repositoryId,
    headSha: state.target.headSha,
    lineage: state.lineage,
  });
  const matches = owner?.attempts.filter((attempt) => localLaneAttemptMatchesState(attempt, state)) ?? [];
  return matches.length === 1 ? matches[0] ?? null : null;
}

/**
 * Read one lane's recorded progress for an exact head.
 *
 * An unrecorded lane is reported as such rather than as zero attempts: the two are different facts,
 * and a caller composing a policy request must not read "nothing was kept" as "nothing happened".
 *
 * @param store - Versioned operation-state storage boundary.
 * @param input - The lane and the exact target to read progress for.
 * @returns The recorded pass count and ordered attempts, or an unrecorded result.
 */
export async function readLaneProgress(
  store: ReviewOperationStateStore,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    lineage?: LaneSubjectLineage;
  },
): Promise<LaneProgressProjection> {
  const { state } = await store.readOperation(laneProgressOperationId(input));
  if (state === null || state.kind !== "lane-progress") return { status: "unrecorded" };
  if (state.lane !== input.lane
    || state.repositoryId !== input.repositoryId) {
    return { status: "unrecorded" };
  }
  return {
    status: "recorded",
    completedPasses: state.completedPasses,
    completePasses: countCompleteLogicalPasses(state.attempts),
    attempts: state.attempts.filter((attempt) => attempt.headSha === input.headSha),
  };
}

/** Read current-head attempts while carrying consumed-pass counts across one authorized lineage. */
export async function readLaneProgressAcrossLineage(
  store: ReviewOperationStateStore,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    lineageHeadShas: readonly string[];
    lineage?: LaneSubjectLineage;
  },
): Promise<LaneProgressProjection> {
  const owner = input.lineage === undefined
    ? null
    : await readLaneProgressOwner(store, {
      lane: input.lane,
      repositoryId: input.repositoryId,
      headSha: input.headSha,
      lineage: input.lineage,
    });
  const heads = [...new Set([...input.lineageHeadShas, input.headSha])];
  const records = await Promise.all(heads.map(async (headSha) => ({
    headSha,
    progress: await readLaneProgress(store, {
      lane: input.lane,
      repositoryId: input.repositoryId,
      headSha,
    }),
  })));
  if (owner !== null) {
    return {
      status: "recorded",
      completedPasses: owner.completedPasses,
      completePasses: countCompleteLogicalPasses(owner.attempts),
      attempts: owner.attempts.filter((attempt) => attempt.headSha === input.headSha),
    };
  }
  const current = records.find(({ headSha }) => headSha === input.headSha)?.progress;
  const completedPasses = records.reduce((total, { progress }) => (
    total + (progress.status === "recorded" ? progress.completedPasses : 0)
  ), 0);
  const completePasses = records.reduce((total, { progress }) => (
    total + (progress.status === "recorded" ? progress.completePasses : 0)
  ), 0);
  if (completedPasses === 0 && current?.status !== "recorded") {
    return { status: "unrecorded" };
  }
  return {
    status: "recorded",
    completedPasses,
    completePasses,
    attempts: current?.status === "recorded" ? current.attempts : [],
  };
}
