/** Conditional next-pass authorization transitions for durable lane owners. */

import { canonicalize, type CanonicalDigest } from "../../lib/kernel/index.js";
import { computeConditionalPassAuthorizationId, LaneProgressStateSchema, type LaneProgressState,
  type LocalReviewState, type ReviewOperationState } from "./core/operation-state-schema.js";
import { laneSubjectOwnerMatches, type LaneSubjectLineage } from "./core/lane-admission.js";
import type { ReviewOperationStateSnapshotIndex, ReviewOperationStateStore } from "./core/ports.js";
import { isReviewVersionConflict, REVIEW_VERSION_RETRY_ATTEMPTS } from "./core/version-conflict.js";
import { laneProgressOperationId } from "./lane-progress.js";

import type { ConfirmResponseHeadContinuation } from "./core/response-head-continuation.js";

type LaneAttempt = LaneProgressState["attempts"][number];
type ConditionalPassAuthorization = NonNullable<LaneAttempt["conditionalPassAuthorizations"]>["authorizations"][number];

export interface ConditionalPendingAdmission {
  authorizationId: CanonicalDigest;
  repositoryId: string;
  lane: LaneProgressState["lane"];
  lineage: LaneSubjectLineage;
  producedHeadSha: string;
  nextPass: number;
  admissionId: string;
  now: string;
  confirmResponseHeadContinuation?: ConfirmResponseHeadContinuation;
  confirmDispositionSetCurrent(producerId: string, dispositionSetId: CanonicalDigest): Promise<boolean>;
}

function requireConditionalLaneOwner(
  state: ReviewOperationState | null,
  input: { lane: LaneProgressState["lane"]; repositoryId: string; lineage: LaneSubjectLineage },
): LaneProgressState {
  if (state?.kind !== "lane-progress"
    || state.lane !== input.lane
    || state.repositoryId !== input.repositoryId
    || !laneSubjectOwnerMatches(state.lineage, input.lineage)) {
    throw new Error("conditional pass authorization lane owner is unavailable");
  }
  return state;
}

function conditionalOwnerMatches(
  state: ReviewOperationState | null,
  input: { lane: LaneProgressState["lane"]; repositoryId: string; lineage: LaneSubjectLineage },
): state is LaneProgressState {
  return state?.kind === "lane-progress"
    && state.lane === input.lane
    && state.repositoryId === input.repositoryId
    && laneSubjectOwnerMatches(state.lineage, input.lineage);
}

function requireCaptureProducer(
  state: LaneProgressState,
  input: { producerId: string; headSha: string; exhaustedPassCount: number; nextPass: number },
): { attempt: LaneAttempt; index: number } {
  const index = state.attempts.findIndex(({ attemptId }) => attemptId === input.producerId);
  const attempt = state.attempts[index];
  if (attempt === undefined
    || !attempt.terminalProducer
    || attempt.headSha !== input.headSha
    || attempt.logicalPass !== input.exhaustedPassCount
    || input.nextPass !== input.exhaustedPassCount + 1) {
    throw new Error("conditional pass authorization does not match its terminal producer");
  }
  return { attempt, index };
}

function assertCaptureReplay(
  current: ConditionalPassAuthorization,
  replay: ConditionalPassAuthorization,
): void {
  if (current.authorizedBy !== replay.authorizedBy
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
}

export function currentConditionalPassAuthorization(
  attempt: LaneAttempt,
): ConditionalPassAuthorization | undefined {
  const lineage = attempt.conditionalPassAuthorizations;
  if (lineage === undefined) return undefined;
  return lineage.authorizations.find(({ authorizationId }) =>
    authorizationId === lineage.currentAuthorizationId);
}

function findConditionalPassAuthorization(
  attempt: LaneAttempt,
  authorizationId: CanonicalDigest,
): ConditionalPassAuthorization | undefined {
  return attempt.conditionalPassAuthorizations?.authorizations.find((authorization) =>
    authorization.authorizationId === authorizationId);
}

function replaceConditionalPassAuthorization(
  attempt: LaneAttempt,
  authorization: ConditionalPassAuthorization,
): LaneAttempt {
  const lineage = attempt.conditionalPassAuthorizations;
  if (lineage === undefined) {
    throw new Error("conditional pass authorization lineage is unavailable");
  }
  return {
    ...attempt,
    conditionalPassAuthorizations: {
      ...lineage,
      authorizations: lineage.authorizations.map((current) =>
        current.authorizationId === authorization.authorizationId ? authorization : current),
    },
  };
}

function conditionalContinuationLineageMatches(
  left: LaneSubjectLineage,
  right: LaneSubjectLineage,
): boolean {
  return laneSubjectOwnerMatches(left, right);
}

export function bindCompletedConditionalPassAuthorization(
  attempt: LaneAttempt,
  input: { dispositionSetId: CanonicalDigest; producedHeadSha: string; now: string },
): LaneAttempt {
  const authorization = currentConditionalPassAuthorization(attempt);
  if (authorization === undefined) return attempt;
  if (authorization.dispositionSetId !== input.dispositionSetId) {
    if (authorization.status === "invalidated") return attempt;
    throw new Error("conditional pass authorization does not match the performed response");
  }
  if (authorization.status === "invalidated") {
    if (authorization.reason === "withdrawn") return attempt;
    throw new Error("invalidated conditional pass authorization cannot be bound");
  }
  if (authorization.status === "bound" || authorization.status === "consumed") {
    if (authorization.producedHeadSha !== input.producedHeadSha) {
      throw new Error("conditional pass authorization response-head replay conflicts");
    }
    return attempt;
  }
  return replaceConditionalPassAuthorization(attempt, {
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
  });
}

export async function captureConditionalNextPassAuthorization(
  store: ReviewOperationStateStore,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    lineage: LaneSubjectLineage;
    producerId: string;
    dispositionSetId: CanonicalDigest;
    authorizedBy: string;
    exhaustedPassCount: number;
    nextPass: number;
    now: string;
  },
): Promise<{ progress: LaneProgressState; authorizationId: CanonicalDigest }> {
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
    const owner = requireConditionalLaneOwner(state, input);
    const { attempt, index } = requireCaptureProducer(owner, input);
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
    const current = currentConditionalPassAuthorization(attempt);
    if (current !== undefined && current.authorizationId === authorizationId) {
      const replay = { ...authorization, capturedAt: current.capturedAt };
      assertCaptureReplay(current, replay);
      return { progress: owner, authorizationId };
    }
    if (current !== undefined) {
      if (current.status !== "invalidated"
        || (current.reason === "superseded"
          && current.successorDispositionSetId !== input.dispositionSetId)) {
        throw new Error("conditional pass authorization replay conflicts with recorded authority");
      }
    }
    const attempts = [...owner.attempts];
    attempts[index] = {
      ...attempt,
      conditionalPassAuthorizations: {
        currentAuthorizationId: authorizationId,
        authorizations: [
          ...(attempt.conditionalPassAuthorizations?.authorizations ?? []),
          authorization,
        ],
      },
    };
    const progress = LaneProgressStateSchema.parse({ ...owner, updatedAt: input.now, attempts });
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
      authorizationId: CanonicalDigest;
      dispositionSetId: CanonicalDigest;
    }
  | {
      state: "refused";
      reason: "consumed" | "superseded" | "stale-current-set" | "foreign-authority";
      detail: string;
    };

type WithdrawalInput = Parameters<typeof withdrawConditionalNextPassAuthorization>[1];

function withdrawalMatches(
  attempt: LaneAttempt | undefined,
  authorization: ConditionalPassAuthorization | undefined,
  input: WithdrawalInput,
): attempt is LaneAttempt {
  return attempt !== undefined
    && authorization !== undefined
    && attempt.terminalProducer
    && attempt.headSha === input.headSha
    && authorization.authorizationId === input.authorizationId
    && authorization.authorizedBy === input.withdrawnBy
    && authorization.repositoryId === input.repositoryId
    && authorization.lane === input.lane
    && canonicalize(authorization.lineage) === canonicalize(input.lineage)
    && authorization.producerId === input.producerId
    && authorization.dispositionSetId === input.dispositionSetId
    && authorization.originatingHeadSha === input.headSha;
}

function withdrawnAuthorization(
  authorization: ConditionalPassAuthorization,
  input: WithdrawalInput,
): ConditionalPassAuthorization {
  return {
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
  };
}

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
    authorizationId: CanonicalDigest;
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    lineage: LaneSubjectLineage;
    producerId: string;
    dispositionSetId: CanonicalDigest;
    withdrawnBy: string;
    now: string;
  },
  confirmDispositionSetCurrent: (
    producerId: string,
    dispositionSetId: CanonicalDigest,
  ) => Promise<boolean>,
): Promise<ConditionalPassWithdrawalResult> {
  const operationId = laneProgressOperationId(input);
  const refuse = (
    reason: Extract<ConditionalPassWithdrawalResult, { state: "refused" }>["reason"],
    detail: string,
  ): ConditionalPassWithdrawalResult => ({ state: "refused", reason, detail });
  for (let writeAttempt = 0; writeAttempt < REVIEW_VERSION_RETRY_ATTEMPTS; writeAttempt += 1) {
    const { version, state } = await store.readOperation(operationId);
    if (!conditionalOwnerMatches(state, input)) {
      return refuse("foreign-authority", "conditional pass authorization owner does not match the response source");
    }
    const index = state.attempts.findIndex(({ attemptId }) => attemptId === input.producerId);
    const attempt = state.attempts[index];
    const authorization = attempt === undefined
      ? undefined
      : findConditionalPassAuthorization(attempt, input.authorizationId);
    if (!withdrawalMatches(attempt, authorization, input) || authorization === undefined) {
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
    attempts[index] = replaceConditionalPassAuthorization(attempt, withdrawnAuthorization(authorization, input));
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
    dispositionSetId: CanonicalDigest;
    successorDispositionSetId: CanonicalDigest;
    now: string;
  },
): Promise<LaneProgressState | null> {
  const operationId = laneProgressOperationId(input);
  for (let writeAttempt = 0; writeAttempt < REVIEW_VERSION_RETRY_ATTEMPTS; writeAttempt += 1) {
    const { version, state } = await store.readOperation(operationId);
    if (!conditionalOwnerMatches(state, input)) return null;
    const index = state.attempts.findIndex(({ attemptId }) => attemptId === input.producerId);
    const attempt = state.attempts[index];
    const authorization = attempt?.conditionalPassAuthorizations?.authorizations.find((candidate) =>
      candidate.dispositionSetId === input.dispositionSetId);
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
    attempts[index] = replaceConditionalPassAuthorization(attempt, {
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
    });
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
    dispositionSetId: CanonicalDigest;
    successorDispositionSetId: CanonicalDigest;
  },
): Promise<
  | { state: "ready" }
  | { state: "refused"; reason: "fix-consumed"; detail: string }
> {
  const operationId = laneProgressOperationId(input);
  const { state } = await store.readOperation(operationId);
  if (!conditionalOwnerMatches(state, input)) return { state: "ready" };
  const attempt = state.attempts.find(({ attemptId }) => attemptId === input.producerId);
  const authorization = attempt?.conditionalPassAuthorizations?.authorizations.find((candidate) =>
    candidate.dispositionSetId === input.dispositionSetId);
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

type CompleteOperationSnapshot = Extract<
  Awaited<ReturnType<ReviewOperationStateSnapshotIndex["readOperationSnapshot"]>>,
  { status: "complete" }
>;

function uniqueAuthorizationSnapshotMatch(
  snapshot: CompleteOperationSnapshot,
  authorizationId: CanonicalDigest,
): { version: number; progress: LaneProgressState; attempt: LaneAttempt;
  authorization: ConditionalPassAuthorization } {
  const matches = snapshot.records.flatMap((record) => {
    if (record.state.kind !== "lane-progress") return [];
    const attempt = record.state.attempts.find((candidate) =>
      findConditionalPassAuthorization(candidate, authorizationId) !== undefined);
    return attempt === undefined ? [] : [{ version: record.version, progress: record.state, attempt }];
  });
  if (matches.length !== 1) throw new Error("conditional pass authorization is unavailable or ambiguous");
  const match = matches[0];
  if (match === undefined) throw new Error("conditional pass authorization is unavailable");
  const authorization = findConditionalPassAuthorization(match.attempt, authorizationId);
  if (authorization === undefined) throw new Error("conditional pass authorization is unavailable");
  return { ...match, authorization };
}

function namedContinuationMatches(
  authorization: ConditionalPassAuthorization,
  input: ConditionalPendingAdmission,
): boolean {
  return authorization.repositoryId === input.repositoryId
    && authorization.lane === input.lane
    && conditionalContinuationLineageMatches(authorization.lineage, input.lineage)
    && authorization.nextPass === input.nextPass;
}

function terminalContinuationAttemptIds(
  snapshot: CompleteOperationSnapshot,
  input: ConditionalPendingAdmission,
): string[] {
  return snapshot.records.flatMap(({ state }) => state.kind === "lane-progress"
    && state.repositoryId === input.repositoryId
    && state.lane === input.lane
    && conditionalContinuationLineageMatches(state.lineage, input.lineage)
    ? state.attempts.filter((attempt) => attempt.logicalPass === input.nextPass && attempt.terminalProducer)
      .map((attempt) => attempt.attemptId)
    : []);
}

function localRetryContract(attempt: LaneAttempt): unknown {
  const local = attempt.local;
  if (local === undefined) return null;
  return {
    logicalPass: attempt.logicalPass, sourceId: attempt.sourceId,
    vehicle: local.vehicle, scopeMode: local.scopeMode, requestedCoverage: local.requestedCoverage,
    correctionScope: local.correctionScope ?? null, rubricIdentity: local.rubricIdentity,
    deliveryAdmission: local.deliveryAdmission ?? null,
  };
}

function retryOperation(snapshot: CompleteOperationSnapshot, attempt: LaneAttempt): LocalReviewState | null {
  const matches = snapshot.records.map(({ state }) => state).filter((state) =>
    state.kind === "local-review" && state.operationId === attempt.attemptId);
  const state = matches[0];
  const local = attempt.local;
  return matches.length === 1 && state?.kind === "local-review" && local !== undefined
    && state.operationId === local.operationId && state.requestId === local.requestId
    && state.logicalPass === attempt.logicalPass && state.retryGeneration === attempt.retryGeneration
    && state.laneSourceId === attempt.sourceId && canonicalize(state.target) === canonicalize(local.target)
    ? state : null;
}

function retryOperationContract(state: LocalReviewState): unknown {
  return {
    authorIdentity: state.request.authorIdentity, evaluatorIdentity: state.request.evaluatorIdentity,
    policyBindingDigest: state.policyBindingDigest, requestMechanism: state.request.requestMechanism,
    attestationRuntimeKind: state.attestationRuntimeKind, attestationMechanism: state.attestation.mechanism,
  };
}

function requireConsumedRetryAttempts(
  match: ReturnType<typeof uniqueAuthorizationSnapshotMatch>,
  input: ConditionalPendingAdmission,
  next: LaneProgressState,
): { original: LaneAttempt; replacement: LaneAttempt } {
  const authorization = match.authorization;
  if (authorization.status !== "consumed") throw new Error("conditional pass authorization is not consumed");
  const original = match.progress.attempts.find((attempt) => attempt.attemptId === authorization.admissionId);
  const previous = match.progress.attempts.filter((attempt) => attempt.logicalPass === input.nextPass).at(-1);
  const replacement = next.attempts.find((attempt) => attempt.attemptId === input.admissionId);
  const retryable = (attempt: LaneAttempt | undefined) => attempt !== undefined && !attempt.terminalProducer
    && (attempt.outcome === "stale-target" || attempt.outcome === "terminal-failure");
  if (original === undefined || previous === undefined || replacement === undefined
    || !retryable(original) || !retryable(previous)
    || replacement.outcome !== "pending" || replacement.terminalProducer
    || replacement.retryGeneration !== previous.retryGeneration + 1
    || localRetryContract(original) === null
    || canonicalize(localRetryContract(original)) !== canonicalize(localRetryContract(previous))
    || canonicalize(localRetryContract(original)) !== canonicalize(localRetryContract(replacement))) {
    throw new Error("conditional pass authorization retry must retain its original admission's source, scope and coverage");
  }
  return { original, replacement };
}

function assertConsumedLocalRetry(
  snapshot: CompleteOperationSnapshot,
  match: ReturnType<typeof uniqueAuthorizationSnapshotMatch>,
  input: ConditionalPendingAdmission,
  next: LaneProgressState,
): void {
  const { original, replacement } = requireConsumedRetryAttempts(match, input, next);
  const originalOperation = retryOperation(snapshot, original);
  const replacementOperation = retryOperation(snapshot, replacement);
  if (originalOperation === null || replacementOperation === null
    || canonicalize(retryOperationContract(originalOperation)) !== canonicalize(retryOperationContract(replacementOperation))) {
    throw new Error("conditional pass authorization retry must retain its original admission's actors and policy");
  }
}

function requirePendingAuthorization(
  authorization: ConditionalPassAuthorization,
): asserts authorization is Extract<ConditionalPassAuthorization, { status: "bound" | "consumed" }> {
  if (authorization.status !== "bound" && authorization.status !== "consumed") {
    throw new Error(`conditional pass authorization is ${authorization.status}`);
  }
}

/** Fold consumption into the pending attempt's one versioned lane-owner publication. */
export async function bindConditionalPendingAdmission(
  store: ReviewOperationStateStore,
  input: ConditionalPendingAdmission,
  ownerVersion: number,
  next: LaneProgressState,
): Promise<LaneProgressState> {
  const readOperationSnapshot = (store as Partial<ReviewOperationStateSnapshotIndex>)
    .readOperationSnapshot;
  if (typeof readOperationSnapshot !== "function") {
    throw new Error("conditional pass authorization snapshot reader is unavailable");
  }
  const snapshot = await readOperationSnapshot.call(store);
  if (snapshot.status !== "complete") {
    throw new Error("conditional pass authorization snapshot is unavailable");
  }
  const match = uniqueAuthorizationSnapshotMatch(snapshot, input.authorizationId);
  if (match.progress.operationId !== next.operationId || match.version !== ownerVersion) {
    throw Object.assign(new Error("version-conflict"), { code: "version-conflict" });
  }
  const { authorization } = match;
  if (!namedContinuationMatches(authorization, input)) {
    throw new Error("conditional pass authorization does not match the named admission");
  }
  requirePendingAuthorization(authorization);
  if (authorization.producedHeadSha !== input.producedHeadSha
    && !await input.confirmResponseHeadContinuation?.({
      repositoryId: input.repositoryId, lineage: input.lineage, producerId: authorization.producerId,
      dispositionSetId: authorization.dispositionSetId, originatingHeadSha: authorization.originatingHeadSha,
      fromHeadSha: authorization.producedHeadSha, toHeadSha: input.producedHeadSha,
    })) {
    throw new Error("conditional pass authorization does not match the produced head");
  }
  if (terminalContinuationAttemptIds(snapshot, input).length > 0) {
    throw new Error("conditional pass authorization named pass is already complete");
  }
  if (!await input.confirmDispositionSetCurrent(
    authorization.producerId, authorization.dispositionSetId,
  )) {
    throw new Error("conditional pass authorization disposition set is not current");
  }
  const attemptIndex = next.attempts.findIndex((candidate) =>
    candidate.attemptId === match.attempt.attemptId);
  if (attemptIndex < 0 || !next.attempts.some((candidate) =>
    candidate.attemptId === input.admissionId && candidate.outcome === "pending"
      && candidate.logicalPass === input.nextPass && candidate.headSha === input.producedHeadSha)) {
    throw new Error("conditional pass authorization pending admission is unavailable");
  }
  if (authorization.status === "consumed") {
    assertConsumedLocalRetry(snapshot, match, input, next);
    return next;
  }
  const attempts = [...next.attempts];
  const producer = attempts[attemptIndex];
  if (producer === undefined) throw new Error("conditional pass authorization producer is unavailable");
  attempts[attemptIndex] = replaceConditionalPassAuthorization(producer, {
    ...authorization,
    status: "consumed",
    admissionId: input.admissionId,
    consumedAt: input.now,
  });
  return LaneProgressStateSchema.parse({ ...next, attempts });
}
