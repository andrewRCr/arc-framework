/** Durable per-attempt lane progress at the fidelity the review-policy driver reads. */

import { createHash } from "node:crypto";

import { canonicalize, type CanonicalDigest } from "../../lib/kernel/index.js";
import { validateReviewReceipt } from "./core/gate-contract-v2.js";
import type { ReviewReceiptV2 } from "./core/gate-contract-v2-schema.js";
import {
  LaneProgressStateSchema,
  type LaneResponsePerformance,
  type LocalReviewState,
  type LaneProgressState,
} from "./core/operation-state-schema.js";
import type { ReviewResult } from "./core/review-result.js";
import type { FrontlineAdmission } from "./core/frontline-admission.js";
import {
  laneSubjectOwner,
  laneSubjectOwnerMatches,
  type LaneSubjectLineage,
} from "./core/lane-admission.js";
import type { ReviewOperationStateStore } from "./core/ports.js";
import {
  isReviewVersionConflict,
  REVIEW_VERSION_RETRY_ATTEMPTS,
} from "./core/version-conflict.js";
export { hostedLaneAttemptId } from "./hosted/request.js";
import type { FrontlineExecutionOutcome } from "./policy/frontline-outcome.js";

import { completeHostedAttemptIfReady } from "./hosted-response-completion.js";
export { completeHostedAttemptIfReady } from "./hosted-response-completion.js";
import type { ConfirmResponseHeadContinuation } from "./core/response-head-continuation.js";

type LaneAttempt = LaneProgressState["attempts"][number];
type LaneAttemptOutcome = LaneAttempt["outcome"];
import { currentConditionalPassAuthorization, bindCompletedConditionalPassAuthorization,
  bindConditionalPendingAdmission, type ConditionalPendingAdmission } from
  "./lane-progress-conditional.js";
import { resolveHostedSealPublishError, sealedHostedReplayMatches } from
  "./lane-progress-seal-recovery.js";

function responsePerformanceReplayMatches(
  attempt: LaneAttempt,
  input: { predecessorDispositionSetId?: CanonicalDigest; producedHeadSha: string },
): boolean {
  const current = attempt.responsePerformance;
  if (current === undefined) return false;
  const predecessor = attempt.responsePerformanceHistory?.at(-1);
  return current.producerId === attempt.attemptId
    && current.originatingHeadSha === attempt.headSha
    && current.producedHeadSha === input.producedHeadSha
    && !(input.predecessorDispositionSetId !== undefined
      && (attempt.responsePerformanceHistory?.length ?? 0) > 0
      && predecessor?.dispositionSetId !== input.predecessorDispositionSetId);
}

function recordResponsePerformanceOnAttempt(
  attempt: LaneAttempt,
  input: {
    dispositionSetId: CanonicalDigest;
    predecessorDispositionSetId?: CanonicalDigest;
    producedHeadSha: string;
    candidateResponseId?: CanonicalDigest;
    now: string;
  },
): LaneAttempt {
  const current = attempt.responsePerformance;
  if (current !== undefined) {
    if (current.dispositionSetId === input.dispositionSetId) {
      if (!responsePerformanceReplayMatches(attempt, input)) {
        throw new Error("lane response performance replay conflicts");
      }
      if (input.candidateResponseId === undefined) return attempt;
      if (current.candidateResponseId !== undefined) {
        if (current.candidateResponseId !== input.candidateResponseId) {
          throw new Error("lane Candidate response digest replay conflicts");
        }
        return attempt;
      }
      return { ...attempt, responsePerformance: { ...current, candidateResponseId: input.candidateResponseId } };
    }
    const hostedSuccessor = attempt.hosted === undefined
      || attempt.hosted.dispositionSetLineage.some((node) =>
        node.dispositionSetId === current.dispositionSetId
        && node.successorDispositionSetId === input.dispositionSetId);
    if (!hostedSuccessor || input.predecessorDispositionSetId !== current.dispositionSetId) {
      throw new Error("lane response performance replay conflicts");
    }
    return {
      ...attempt,
      responsePerformanceHistory: [
        ...(attempt.responsePerformanceHistory ?? []),
        current,
      ],
      responsePerformance: {
        schemaVersion: 1,
        producerId: attempt.attemptId,
        dispositionSetId: input.dispositionSetId,
        originatingHeadSha: attempt.headSha,
        producedHeadSha: input.producedHeadSha,
        ...(input.candidateResponseId === undefined ? {} : { candidateResponseId: input.candidateResponseId }),
        performedAt: input.now,
      },
    };
  }
  return {
    ...attempt,
    responsePerformance: {
      schemaVersion: 1,
      producerId: attempt.attemptId,
      dispositionSetId: input.dispositionSetId,
      originatingHeadSha: attempt.headSha,
      producedHeadSha: input.producedHeadSha,
      ...(input.candidateResponseId === undefined ? {} : { candidateResponseId: input.candidateResponseId }),
      performedAt: input.now,
    },
  };
}

function pendingAttemptCanAdvance(pending: LaneAttempt, next: LaneAttempt): boolean {
  if (pending.outcome !== "pending" || next.outcome === "pending") return false;
  if (pending.frontline !== undefined || next.frontline !== undefined) {
    return pending.frontline !== undefined
      && next.frontline !== undefined
      && canonicalize(pending.frontline.admission) === canonicalize(next.frontline.admission);
  }
  if (pending.local !== undefined || next.local !== undefined) return pendingLocalCanAdvance(pending, next);
  return pendingHostedCanAdvance(pending, next);
}

function pendingLocalCanAdvance(pending: LaneAttempt, next: LaneAttempt): boolean {
  if (pending.local === undefined || next.local === undefined) return false;
  return canonicalize({
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

function pendingHostedCanAdvance(pending: LaneAttempt, next: LaneAttempt): boolean {
  const pendingHosted = pending.hosted;
  const nextHosted = next.hosted;
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
    effectiveCoverage: null,
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
    effectiveCoverage: null,
    ...(nextHosted.vehicle === undefined ? {} : { vehicle: nextHosted.vehicle }),
    reviewTarget: nextHosted.reviewTarget,
    requirement: nextHosted.requirement,
    actorIdentity: nextHosted.actorIdentity,
  });
}

function retryableFrontlineAttemptCanAdvance(previous: LaneAttempt, next: LaneAttempt): boolean {
  return (previous.outcome === "timed-out"
      || previous.outcome === "rate-limited"
      || previous.outcome === "transient-unavailable")
    && previous.sourceId === next.sourceId
    && previous.logicalPass === next.logicalPass
    && next.retryGeneration > previous.retryGeneration
    && previous.chunkSeriesComplete === false
    && previous.hosted === undefined
    && previous.local === undefined
    && next.hosted === undefined
    && next.local === undefined;
}

/** Present retry generations as one policy attempt while retaining durable outcomes. */
function projectFrontlineAttempts(attempts: readonly LaneAttempt[]): readonly LaneAttempt[] {
  const projected: LaneAttempt[] = [];
  for (const attempt of attempts) {
    const previous = projected.at(-1);
    if (previous !== undefined && retryableFrontlineAttemptCanAdvance(previous, attempt)) {
      projected[projected.length - 1] = attempt;
    } else {
      projected.push(attempt);
    }
  }
  return projected;
}

function localLaneAttemptMatchesState(attempt: LaneAttempt, state: LocalReviewState): boolean {
  const requestedCoverage = state.coverageAdmission.requestedCoverage;
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
      ...(state.coverageAdmission.correctionScope === undefined
        ? {}
        : { correctionScope: state.coverageAdmission.correctionScope }),
      effectiveCoverage: attempt.terminalProducer ? requestedCoverage : null,
      scopeMode: state.scopeMode,
      rubricIdentity: {
        version: state.requirement.rubricVersion,
        digest: state.requirement.rubricDigest,
      },
      ...(state.deliveryAdmission === undefined
        ? {}
        : { deliveryAdmission: state.deliveryAdmission }),
    });
}

function localReceiptConclusionReplays(
  attempt: LaneAttempt,
  outcome: LaneAttemptOutcome,
  consumedPass: boolean,
): boolean {
  const outcomeCompatible = attempt.outcome === outcome
    || (outcome === "findings" && attempt.outcome === "settled-findings");
  return outcomeCompatible && attempt.terminalProducer === consumedPass;
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
  const requestedCoverage = state.coverageAdmission.requestedCoverage;
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
    if (!localReceiptConclusionReplays(existingAttempt, outcome, consumedPass)) {
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
      ...(state.coverageAdmission.correctionScope === undefined
        ? {}
        : { correctionScope: state.coverageAdmission.correctionScope }),
      effectiveCoverage: consumedPass ? requestedCoverage : null,
      scopeMode: state.scopeMode,
      rubricIdentity: {
        version: state.requirement.rubricVersion,
        digest: state.requirement.rubricDigest,
      },
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
 * Resolve the stable operation identity holding one subject's lane progress.
 *
 * @param input - The lane and exact subject lineage it is reviewing.
 * @returns The operation identifier for that lane and target.
 */
export function laneProgressOperationId(input: {
  lane: LaneProgressState["lane"];
  repositoryId: string;
  headSha: string;
  lineage?: LaneSubjectLineage;
}): string {
  const lineage = input.lineage ?? {
    kind: "head-bound" as const,
    vehicleKind: "review-target",
    vehicleIdentity: `${input.repositoryId}/${input.headSha}`,
    headSha: input.headSha,
  };
  const subject = laneSubjectOwner(lineage);
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

/** Resolve the serialization identity for mutations of one head-surviving lane continuation. */
export function laneContinuationOperationId(input: {
  lane: LaneProgressState["lane"];
  repositoryId: string;
  headSha: string;
  lineage: LaneSubjectLineage;
}): string {
  const subject = laneSubjectOwner(input.lineage);
  const digest = createHash("sha256")
    .update(canonicalize({
      domain: "arc.review.lane-continuation-lock/v1",
      lane: input.lane,
      repositoryId: input.repositoryId,
      subject,
    }))
    .digest("hex");
  return `lane-continuation/${digest}`;
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
type RecordLaneAttemptInput = Parameters<typeof recordLaneAttempt>[1];

function buildLaneAttempt(
  input: RecordLaneAttemptInput,
  existing: LaneProgressState | null,
  replay: LaneAttempt | undefined,
): LaneAttempt {
  return {
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
}

function buildNextLaneProgress(
  input: RecordLaneAttemptInput,
  operationId: string,
  lineage: LaneSubjectLineage,
  existing: LaneProgressState | null,
  replay: LaneAttempt | undefined,
  attempt: LaneAttempt,
): LaneProgressState {
  if (replay !== undefined) {
    if (input.advancePendingAttempt !== true || !pendingAttemptCanAdvance(replay, attempt)) {
      throw new Error("conflicting lane-attempt replay");
    }
    if (existing === null) throw new Error("lane-attempt replay has no lane progress record");
    const attempts = existing.attempts.map((candidate) => candidate.attemptId === input.attemptId
      ? attempt : candidate);
    const completedPasses = new Set(attempts.filter(({ terminalProducer }) => terminalProducer)
      .map(({ logicalPass }) => logicalPass)).size;
    return LaneProgressStateSchema.parse({ ...existing, updatedAt: input.now, completedPasses, attempts });
  }
  const attempts = [...existing?.attempts ?? [], attempt];
  const completedPasses = new Set(attempts.filter(({ terminalProducer }) => terminalProducer)
    .map(({ logicalPass }) => logicalPass)).size;
  return LaneProgressStateSchema.parse({
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

async function publishLaneAttemptVersion(
  store: ReviewOperationStateStore,
  input: RecordLaneAttemptInput,
  operationId: string, lineage: LaneSubjectLineage,
  existing: LaneProgressState | null, replay: LaneAttempt | undefined,
  attempt: LaneAttempt, version: number,
): Promise<LaneProgressState | null> {
  const pending = buildNextLaneProgress(input, operationId, lineage, existing, replay, attempt);
  let next: LaneProgressState;
  try {
    next = input.conditionalPendingAdmission === undefined ? pending
      : await bindConditionalPendingAdmission(store, input.conditionalPendingAdmission, version, pending);
  } catch (error) {
    if (!isReviewVersionConflict(error) || input.expectedOwnerVersion !== undefined) throw error;
    return null;
  }
  try {
    await store.publishOperation(next, version);
    return next;
  } catch (error) {
    if (isReviewVersionConflict(error) && input.conditionalPendingAdmission !== undefined) {
      if (input.expectedOwnerVersion !== undefined) throw error;
      return null;
    }
    return resolveHostedSealPublishError(store, next, attempt, error, input.expectedOwnerVersion);
  }
}

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
    conditionalPendingAdmission?: ConditionalPendingAdmission;
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
    const attempt = buildLaneAttempt(input, existing, replay);
    if (replay !== undefined
      && (canonicalize(replay) === canonicalize(attempt)
        || sealedHostedReplayMatches(replay, attempt))) {
      if (existing === null) throw new Error("lane-attempt replay has no lane progress record");
      return LaneProgressStateSchema.parse(existing);
    }
    const published = await publishLaneAttemptVersion(
      store, input, operationId, lineage, existing, replay, attempt, version,
    );
    if (published !== null) return published;
  }
  throw new Error("lane progress exceeded version-conflict retry attempts");
}

export { readHostedRequestAdmissionReplay, recordHostedRequestAdmission, acknowledgeHostedRequest,
  readHostedAcknowledgedRequest, readHostedAwaitReplay, resolveHostedAwaitResult,
  recordHostedAwaitAttempt } from "./lane-progress-hosted-request.js";
export type { HostedRequestAdmissionDecision } from "./lane-progress-hosted-request.js";

/** Persist one admitted local producer before its executable inputs leave the runtime. */
export async function recordLocalPendingAttempt(
  store: ReviewOperationStateStore,
  input: {
    state: Extract<import("./core/operation-state-schema.js").ReviewOperationState, { kind: "local-review" }>;
    ownerVersion: number;
    now: string;
    conditionalPendingAdmission?: ConditionalPendingAdmission;
  },
): Promise<LaneProgressState> {
  const { state } = input;
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
      requestedCoverage: state.coverageAdmission.requestedCoverage,
      ...(state.coverageAdmission.correctionScope === undefined
        ? {}
        : { correctionScope: state.coverageAdmission.correctionScope }),
      effectiveCoverage: null,
      scopeMode: state.scopeMode,
      rubricIdentity: {
        version: state.requirement.rubricVersion,
        digest: state.requirement.rubricDigest,
      },
      ...(state.deliveryAdmission === undefined ? {} : { deliveryAdmission: state.deliveryAdmission }),
    },
    now: input.now,
    conditionalPendingAdmission: input.conditionalPendingAdmission,
  });
}

/** Conclude one admitted hosted dispatch that did not produce an acknowledgment handle. */
export { recordHostedRequestConclusion, bindHostedAttemptDisposition, settleHostedAttemptFinding,
  supersedeHostedAttemptDisposition, inspectHostedAttemptDispositionSupersession,
  HostedDispositionSupersessionError } from "./lane-progress-hosted-settlement.js";
export type { HostedDispositionSupersessionResult, HostedDispositionSupersessionInput } from "./lane-progress-hosted-settlement.js";

export { captureConditionalNextPassAuthorization, withdrawConditionalNextPassAuthorization,
  invalidateConditionalNextPassAuthorization, inspectConditionalNextPassInvalidation } from
  "./lane-progress-conditional.js";
export type { ConditionalPassWithdrawalResult } from "./lane-progress-conditional.js";

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
type SettleLaneAttemptInput = Parameters<typeof settleLaneAttempt>[1];

function settledLaneAttempt(attempt: LaneAttempt, input: SettleLaneAttemptInput): LaneAttempt {
  let settled: LaneAttempt = attempt.outcome === "settled-findings"
    ? attempt : { ...attempt, outcome: "settled-findings" };
  if (input.dispositionSetId !== undefined && input.producedHeadSha !== undefined) {
    settled = recordResponsePerformanceOnAttempt(settled, {
      dispositionSetId: input.dispositionSetId,
      ...(input.predecessorDispositionSetId === undefined
        ? {} : { predecessorDispositionSetId: input.predecessorDispositionSetId }),
      producedHeadSha: input.producedHeadSha,
      now: input.now,
    });
  } else if (input.dispositionSetId !== undefined
    || input.predecessorDispositionSetId !== undefined
    || input.producedHeadSha !== undefined) {
    throw new Error("lane settlement requires complete response-performance evidence");
  }
  const authorization = currentConditionalPassAuthorization(attempt);
  if (authorization === undefined) return settled;
  if (input.dispositionSetId === undefined || input.producedHeadSha === undefined) {
    throw new Error("conditional pass authorization requires exact response-performance evidence");
  }
  return bindCompletedConditionalPassAuthorization(settled, {
    dispositionSetId: input.dispositionSetId,
    producedHeadSha: input.producedHeadSha,
    now: input.now,
  });
}

export async function settleLaneAttempt(
  store: ReviewOperationStateStore,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    lineage?: LaneSubjectLineage;
    attemptId: string;
    dispositionSetId?: CanonicalDigest;
    predecessorDispositionSetId?: CanonicalDigest;
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
  const settledAttempt = settledLaneAttempt(attempt, input);
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

/** Record the durable head produced by a fully performed approved response and retain direct predecessors. */
type LaneResponsePerformanceInput = Parameters<typeof recordLaneResponsePerformance>[1];

function responsePerformanceOwnerMatches(
  state: LaneProgressState | null,
  input: LaneResponsePerformanceInput,
): state is LaneProgressState {
  return state !== null
    && state.lane === input.lane
    && state.repositoryId === input.repositoryId
    && laneSubjectOwnerMatches(state.lineage, input.lineage);
}

function responsePerformanceAttemptMatches(
  attempt: LaneAttempt | undefined,
  input: LaneResponsePerformanceInput,
): attempt is LaneAttempt {
  return attempt !== undefined
    && attempt.headSha === input.headSha
    && (attempt.outcome === "findings" || attempt.outcome === "settled-findings");
}

function validateCandidateResponseBinding(input: {
  candidateResponseId?: CanonicalDigest; lineage: LaneSubjectLineage;
}): void {
  if (input.candidateResponseId !== undefined && input.lineage.kind !== "candidate") {
    throw new Error("Candidate response digest requires its Candidate lineage");
  }
}

export async function recordLaneResponsePerformance(
  store: ReviewOperationStateStore,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    lineage: LaneSubjectLineage;
    attemptId: string;
    dispositionSetId: CanonicalDigest;
    predecessorDispositionSetId?: CanonicalDigest;
    producedHeadSha: string;
    candidateResponseId?: CanonicalDigest;
    confirmResponseHeadContinuation?: ConfirmResponseHeadContinuation;
    now: string;
  },
): Promise<LaneProgressState> {
  validateCandidateResponseBinding(input);
  const operationId = laneProgressOperationId(input);
  for (let writeAttempt = 0; writeAttempt < REVIEW_VERSION_RETRY_ATTEMPTS; writeAttempt += 1) {
    const { version, state } = await store.readOperation(operationId);
    if (state !== null && state.kind !== "lane-progress") {
      throw new Error("lane response performance owner is unavailable");
    }
    if (!responsePerformanceOwnerMatches(state, input)) {
      throw new Error("lane response performance owner is unavailable");
    }
    const index = state.attempts.findIndex(({ attemptId }) => attemptId === input.attemptId);
    const attempt = state.attempts[index];
    if (!responsePerformanceAttemptMatches(attempt, input)) {
      throw new Error("lane response performance does not match its findings producer");
    }
    const authorization = currentConditionalPassAuthorization(attempt);
    if (authorization !== undefined
      && authorization.dispositionSetId === input.dispositionSetId
      && authorization.status === "invalidated"
      && authorization.reason !== "withdrawn") {
      throw new Error("invalidated conditional pass authorization cannot record response performance");
    }
    let performedAttempt = recordResponsePerformanceOnAttempt(attempt, input);
    if (attempt.hosted === undefined) {
      performedAttempt = bindCompletedConditionalPassAuthorization({
        ...performedAttempt,
        outcome: "settled-findings",
      }, input);
    } else {
      performedAttempt = await completeHostedAttemptIfReady(performedAttempt, input.now, {
        repositoryId: state.repositoryId, lineage: state.lineage,
        confirmResponseHeadContinuation: input.confirmResponseHeadContinuation,
      });
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
  responsePerformance?: LaneAttempt["responsePerformance"];
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
    historicalAttempt?: LanePolicyAttempt & { headSha: string };
  };

function selectHistoricalOwnerAttempt(attempts: readonly LaneAttempt[], lane: LaneProgressState["lane"],
  headSha: string, currentAttemptCount: number): LaneAttempt | undefined {
  if (lane !== "standard" || currentAttemptCount > 0) return undefined;
  return [...attempts]
    .filter((attempt) => attempt.headSha !== headSha && attempt.terminalProducer
      && (attempt.outcome === "clean" || attempt.outcome === "findings"
        || attempt.outcome === "settled-findings"))
    .sort((left, right) => right.logicalPass - left.logicalPass)[0];
}

/** Read one complete lineage owner without applying an exact-head projection. */
export async function readLaneProgressOwnerVersioned(
  store: Pick<ReviewOperationStateStore, "readOperation">,
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
    || !laneSubjectOwnerMatches(state.lineage, input.lineage)) return { version, state: null };
  return { version, state };
}

/** Read one complete lineage owner without applying an exact-head projection. */
export async function readLaneProgressOwner(
  store: Pick<ReviewOperationStateStore, "readOperation">,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    lineage: LaneSubjectLineage;
  },
): Promise<LaneProgressState | null> {
  return (await readLaneProgressOwnerVersioned(store, input)).state;
}

export { readCandidateInheritedLaneProgress } from "./lane-progress-supersession.js";

/** Read exact performed-response evidence from its existing lane-owner attempt. */
export async function readLaneResponsePerformance(
  store: ReviewOperationStateStore,
  predecessor: ReviewResult,
): Promise<LaneResponsePerformance | null> {
  const owner = await readLaneProgressOwner(store, {
    lane: predecessor.kind === "frontline" ? "frontline" : "standard",
    repositoryId: predecessor.repositoryId,
    headSha: predecessor.target.headSha,
    lineage: predecessor.admission.lineage,
  });
  const matches = owner?.attempts.filter(({ attemptId }) => attemptId === predecessor.producerId) ?? [];
  if (matches.length !== 1) return null;
  const performance = matches[0]?.responsePerformance;
  if (performance === undefined
    || performance.producerId !== predecessor.producerId
    || performance.originatingHeadSha !== predecessor.target.headSha) return null;
  return performance;
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
    attempts: state.lane === "frontline"
      ? projectFrontlineAttempts(state.attempts.filter((attempt) => attempt.headSha === input.headSha))
      : state.attempts.filter((attempt) => attempt.headSha === input.headSha),
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
    const currentAttempts = owner.attempts.filter((attempt) => attempt.headSha === input.headSha);
    const historicalAttempt = selectHistoricalOwnerAttempt(
      owner.attempts, input.lane, input.headSha, currentAttempts.length,
    );
    return {
      status: "recorded",
      completedPasses: owner.completedPasses,
      completePasses: countCompleteLogicalPasses(owner.attempts),
      ...(historicalAttempt === undefined ? {} : { historicalAttempt }),
      attempts: owner.lane === "frontline"
        ? projectFrontlineAttempts(currentAttempts)
        : currentAttempts,
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
    ...(input.lane !== "standard" || (current?.status === "recorded" && current.attempts.length > 0)
      ? {}
      : {
          historicalAttempt: records.flatMap(({ headSha, progress }) => progress.status === "recorded"
            && headSha !== input.headSha
            ? progress.attempts.filter((attempt) => attempt.outcome === "clean"
              || attempt.outcome === "findings" || attempt.outcome === "settled-findings")
              .map((attempt) => ({ ...attempt, headSha }))
            : []).sort((left, right) => right.logicalPass - left.logicalPass)[0],
        }),
  };
}
