/** Durable hosted request admission and await transitions. */

import type { ConfirmResponseHeadContinuation } from "./core/response-head-continuation.js";
import { canonicalize } from "../../lib/kernel/index.js";
import { createHostedSealedResult, LaneProgressStateSchema, type LaneProgressState } from "./core/operation-state-schema.js";
import { isReviewVersionConflict, REVIEW_VERSION_RETRY_ATTEMPTS } from "./core/version-conflict.js";
import { laneSubjectOwnerMatches, type LaneSubjectLineage } from "./core/lane-admission.js";
import type { ReviewOperationStateStore } from "./core/ports.js";
import { HostedAwaitResultSchema, type HostedAwaitResult } from "./hosted/await.js";
import { createHostedAdmission, hostedAdmissionMatchesRequest, hostedAwaitAction, hostedLaneAttemptId, HostedRequestEnvelopeSchema, type HostedAdmission, type HostedProgressVehicle, type HostedRequestEnvelope, type HostedRequestHandle, type HostedRequestAdmissionResolution } from "./hosted/request.js";
import { hostedAwaitLaneOutcome, laneProgressOperationId, recordLaneAttempt } from "./lane-progress.js";
import { bindConditionalPendingAdmission } from "./lane-progress-conditional.js";
import {
  localAttemptCoverageAdmission,
  sharedLogicalPassCoverageMatches,
} from "./policy/local-review-coverage-selection.js";
import type { CandidateSupersessionAncestor } from
  "../../lib/work-unit/candidate-attestation.js";
import { readCandidateInheritedLaneProgress } from "./lane-progress.js";

type LaneAttempt = LaneProgressState["attempts"][number];

async function inheritedHostedCompletedPasses(
  store: Pick<ReviewOperationStateStore, "readOperation">,
  input: {
    repositoryId: string;
    headSha: string;
    supersessionAncestors?: readonly CandidateSupersessionAncestor[];
  },
): Promise<number> {
  const inherited = await readCandidateInheritedLaneProgress(store, {
    lane: "standard",
    repositoryId: input.repositoryId,
    headSha: input.headSha,
    ancestors: input.supersessionAncestors ?? [],
  });
  return inherited.inheritedCompletedPasses;
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
 * Resolve an admitted hosted request for the current authoritative owner and target.
 *
 * @param store - Keyed operation reader for the current repository.
 * @param input - Current repository, lineage, exact target, and caller-visible request.
 * @returns The replayable admission decision, `null` when none exists, or a conservative ambiguous stop.
 */
export async function readHostedRequestAdmissionReplay(
  store: Pick<ReviewOperationStateStore, "readOperation">,
  input: {
    repositoryId: string;
    lineage: LaneSubjectLineage;
    reviewTarget: NonNullable<LaneAttempt["hosted"]>["reviewTarget"];
    request: HostedRequestEnvelope;
    supersessionAncestors?: readonly CandidateSupersessionAncestor[];
  },
): Promise<HostedRequestAdmissionDecision | null> {
  const request = HostedRequestEnvelopeSchema.parse(input.request);
  const operationId = laneProgressOperationId({
    lane: "standard",
    repositoryId: input.repositoryId,
    headSha: request.target.headSha,
    lineage: input.lineage,
  });
  const { state } = await store.readOperation(operationId);
  if (state === null) return null;
  if (state.kind !== "lane-progress") return { state: "ambiguous-delivery" };
  const progress = LaneProgressStateSchema.parse(state);
  if (progress.operationId !== operationId
    || progress.lane !== "standard"
    || progress.repositoryId !== input.repositoryId
    || !laneSubjectOwnerMatches(progress.lineage, input.lineage)) {
    return { state: "ambiguous-delivery" };
  }
  const inheritedCompletedPasses = await inheritedHostedCompletedPasses(store, {
    repositoryId: input.repositoryId,
    headSha: request.target.headSha,
    supersessionAncestors: input.supersessionAncestors,
  });
  const activeLogicalPass = inheritedCompletedPasses + progress.completedPasses + 1;
  const matchingAttempts = progress.attempts.filter((attempt) => (
    attempt.logicalPass === activeLogicalPass
    && attempt.hosted !== undefined
    && canonicalize(attempt.hosted.admission.reviewTarget) === canonicalize(input.reviewTarget)
    && hostedAdmissionMatchesRequest(attempt.hosted.admission, request)
  ));
  if (matchingAttempts.length === 0) return null;
  if (matchingAttempts.length !== 1) return { state: "ambiguous-delivery" };
  const matchingAttempt = matchingAttempts[0];
  if (matchingAttempt === undefined) return { state: "ambiguous-delivery" };
  return replayHostedRequestResult(request, matchingAttempt)
    ?? { state: "ambiguous-delivery" };
}

/** Admit one hosted source attempt before its external request effect. */
type HostedRequestAdmissionInput = Parameters<typeof recordHostedRequestAdmission>[1];

function admittedHostedReplay(
  existing: LaneProgressState | null,
  input: HostedRequestAdmissionInput,
  logicalPass: number,
): LaneAttempt | undefined {
  return existing?.attempts.find((attempt) => (
    attempt.logicalPass === logicalPass
    && attempt.hosted !== undefined
    && attempt.hosted.admission.sourceId === input.request.provider
    && attempt.hosted.admission.requestedCoverage === input.request.coverage
    && canonicalize(attempt.hosted.admission.correctionScope ?? null)
      === canonicalize(input.request.correctionScope ?? null)
    && canonicalize(attempt.hosted.admission.target) === canonicalize(input.request.target)
    && canonicalize(attempt.hosted.admission.reviewTarget) === canonicalize(input.reviewTarget)
    && canonicalize(attempt.hosted.admission.vehicle ?? null)
      === canonicalize(input.progressVehicle ?? null)
  ));
}

/** A terminal failure at another head produced nothing a request at this head could carry. */
function failedAtAnotherHead(attempt: LaneAttempt, headSha: string): boolean {
  return attempt.outcome === "terminal-failure" && attempt.headSha !== headSha;
}

function assertHostedPassCoverage(
  existing: LaneProgressState | null,
  request: HostedRequestEnvelope,
  logicalPass: number,
): void {
  const coverageAdmission = localAttemptCoverageAdmission({
    requestedCoverage: request.coverage,
    correctionScope: request.correctionScope,
  });
  const passAttempts = (existing?.attempts ?? []).filter((attempt) => (
    !failedAtAnotherHead(attempt, request.target.headSha)
  ));
  if (!sharedLogicalPassCoverageMatches(passAttempts, logicalPass, coverageAdmission)) {
    throw new Error(
      "hosted admission requested coverage or correction scope does not match its logical pass; "
      + "reuse the exact coverage admission from the retained attempt",
    );
  }
}

/**
 * Find the attempt that still holds this pass against a new request.
 *
 * A pending or ambiguous attempt may yet produce a result, so it holds the pass at any head. A
 * terminal failure holds it only at its own head, where it is reported as that failure.
 */
function hostedPassHold(
  existing: LaneProgressState | null,
  request: HostedRequestEnvelope,
  logicalPass: number,
): HostedRequestAdmissionDecision | null {
  const passAttempts = existing?.attempts.filter((attempt) => (
    attempt.logicalPass === logicalPass && attempt.hosted !== undefined
  )) ?? [];
  if (passAttempts.some(({ outcome }) => outcome === "pending" || outcome === "ambiguous-delivery")) {
    return { state: "ambiguous-delivery" };
  }
  const failed = passAttempts.find((attempt) => (
    attempt.outcome === "terminal-failure" && attempt.headSha === request.target.headSha
  ));
  if (failed === undefined) return null;
  const failureReason = failed.hosted?.requestFailureReason;
  if (failureReason === undefined || failureReason === null) return { state: "ambiguous-delivery" };
  return {
    state: "concluded",
    result: {
      schemaVersion: 1,
      mode: "review-hosted-request",
      provider: request.provider,
      requestedCoverage: request.coverage,
      attemptedProviders: [request.provider],
      state: "terminal-failure",
      nextAction: "stop",
      reason: `hosted pass ${logicalPass} already ended in terminal failure at this head from ${failed.sourceId} `
        + `(attempt ${failed.attemptId}): ${failureReason}; a request at a later head starts the pass again`,
    },
  };
}

function createAdmittedHostedRequest(
  input: HostedRequestAdmissionInput,
  logicalPass: number,
): HostedAdmission {
  return createHostedAdmission({
    schemaVersion: 1,
    repositoryId: input.repositoryId,
    lineage: input.lineage,
    logicalPass,
    sourceId: input.request.provider,
    target: input.request.target,
    requestedCoverage: input.request.coverage,
    ...(input.request.correctionScope === undefined
      ? {} : { correctionScope: input.request.correctionScope }),
    ...(input.progressVehicle === undefined ? {} : { vehicle: input.progressVehicle }),
    reviewTarget: input.reviewTarget,
    requirement: input.requirement,
    actorIdentity: input.actorIdentity,
  });
}

function pendingHostedProgress(
  existing: LaneProgressState | null,
  operationId: string,
  input: HostedRequestAdmissionInput,
  admission: HostedAdmission,
): LaneProgressState {
  const attempt: LaneAttempt = {
    attemptId: admission.admissionId,
    logicalPass: admission.logicalPass,
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
  return LaneProgressStateSchema.parse(existing === null
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
}

async function publishHostedPendingAdmission(
  store: ReviewOperationStateStore,
  input: HostedRequestAdmissionInput,
  operationId: string,
  existing: LaneProgressState | null,
  admission: HostedAdmission,
  version: number,
): Promise<boolean> {
  try {
    const pending = pendingHostedProgress(existing, operationId, input, admission);
    const authorizationId = input.request.ceilingOverride?.conditionalPassAuthorizationId;
    const next = authorizationId === undefined ? pending : await bindConditionalPendingAdmission(
      store,
      {
        authorizationId,
        repositoryId: input.repositoryId,
        lane: "standard",
        lineage: input.lineage,
        producedHeadSha: input.request.target.headSha,
        nextPass: admission.logicalPass,
        admissionId: admission.admissionId,
        now: input.now,
        confirmResponseHeadContinuation: input.confirmResponseHeadContinuation,
        confirmDispositionSetCurrent: input.confirmDispositionSetCurrent ?? (() => {
          throw new Error("conditional pass authorization disposition reader is unavailable");
        }),
      },
      version,
      pending,
    );
    await store.publishOperation(next, version);
    return true;
  } catch (error) {
    if (!isReviewVersionConflict(error)) throw error;
    return false;
  }
}

export async function recordHostedRequestAdmission(
  store: ReviewOperationStateStore,
  input: {
    repositoryId: string;
    lineage: LaneSubjectLineage;
    supersessionAncestors?: readonly CandidateSupersessionAncestor[];
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
    confirmResponseHeadContinuation?: ConfirmResponseHeadContinuation;
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
    const inheritedCompletedPasses = await inheritedHostedCompletedPasses(store, {
      repositoryId: input.repositoryId,
      headSha: input.request.target.headSha,
      supersessionAncestors: input.supersessionAncestors,
    });
    const logicalPass = inheritedCompletedPasses + (existing?.completedPasses ?? 0) + 1;
    const admittedReplay = admittedHostedReplay(existing, input, logicalPass);
    if (admittedReplay !== undefined) {
      const result = replayHostedRequestResult(input.request, admittedReplay);
      if (result !== null) return result;
      throw new Error("hosted admission already concluded with an incompatible result");
    }
    assertHostedPassCoverage(existing, input.request, logicalPass);
    const admission = createAdmittedHostedRequest(input, logicalPass);
    const replay = existing?.attempts.find((attempt) => (
      attempt.hosted?.admission.admissionId === admission.admissionId
    ));
    if (replay !== undefined) {
      const result = replayHostedRequestResult(input.request, replay);
      if (result !== null) return result;
      throw new Error("hosted admission already concluded with an incompatible result");
    }
    const hold = hostedPassHold(existing, input.request, logicalPass);
    if (hold !== null) return hold;
    await input.authorizeCapacity({
      ownerVersion: version,
      progress: existing,
      logicalPass,
    });
    if (await publishHostedPendingAdmission(store, input, operationId, existing, admission, version)) {
      return { state: "admitted", admission };
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
        effectiveCoverage: null,
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
        ...(sealedResult.coverageEvidence === undefined
          ? {}
          : { coverageEvidence: sealedResult.coverageEvidence }),
      }
    : {
        schemaVersion: 1 as const,
        mode: "review-hosted-await" as const,
        handle,
        state: "findings" as const,
        nextAction: "triage" as const,
        reviewUrl: sealedResult.reviewUrl,
        findings: sealedResult.findings,
        ...(sealedResult.coverageEvidence === undefined
          ? {}
          : { coverageEvidence: sealedResult.coverageEvidence }),
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

function hostedAwaitBinding(
  result: HostedAwaitResult,
  effectiveCoverage: NonNullable<LaneAttempt["hosted"]>["effectiveCoverage"],
  outcome: LaneAttempt["outcome"],
): NonNullable<LaneAttempt["hosted"]> {
  const { handle } = result;
  return {
    admission: handle.admission,
    handle,
    target: handle.target,
    requestedCoverage: handle.requestedCoverage,
    effectiveCoverage,
    ...(handle.vehicle?.kind === "delivery-member" ? { vehicle: handle.vehicle } : {}),
    reviewTarget: handle.admission.reviewTarget,
    requirement: handle.admission.requirement,
    actorIdentity: handle.admission.actorIdentity,
    requestFailureReason: outcome === "terminal-failure" && "reason" in result ? result.reason : null,
    ...((result.state === "clean" || result.state === "findings")
      ? {
          sealedResult: createHostedSealedResult({
              attemptId: hostedLaneAttemptId(handle),
              admission: handle.admission,
              handle,
              target: handle.target,
              requestedCoverage: handle.requestedCoverage,
              effectiveCoverage,
              ...(handle.vehicle?.kind === "delivery-member" ? { vehicle: handle.vehicle } : {}),
              reviewTarget: handle.admission.reviewTarget,
              requirement: handle.admission.requirement,
              outcome: result.state,
              reviewUrl: result.reviewUrl,
              findings: result.state === "findings" ? result.findings : [],
              ...(result.coverageEvidence === undefined
                ? {}
                : { coverageEvidence: result.coverageEvidence }),
          }),
        }
      : {}),
    dispositionSetId: null,
    dispositionSetLineage: [],
    settledFindingIds: [],
    settlementEvidence: [],
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
  const result = HostedAwaitResultSchema.parse(input.result);
  const outcome = hostedAwaitLaneOutcome(result.state);
  const { handle } = result;
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
  const effectiveCoverage = result.state === "clean" || result.state === "findings"
    ? handle.provider === "coderabbit-pr" && handle.requestedCoverage === "incremental"
      ? result.coverageEvidence?.status === "established" ? "incremental" : null
      : handle.effectiveCoverage
    : null;
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
    hosted: hostedAwaitBinding(result, effectiveCoverage, outcome),
    now: input.now,
  });
}
