/** Exact durable hosted seal matching after a terminal publication loses its acknowledgment. */

import { canonicalize } from "../../lib/kernel/index.js";
import { LaneProgressStateSchema, type LaneProgressState } from "./core/operation-state-schema.js";
import { laneSubjectOwnerMatches } from "./core/lane-admission.js";
import type { ReviewOperationStateStore } from "./core/ports.js";
import { isReviewVersionConflict } from "./core/version-conflict.js";

type LaneAttempt = LaneProgressState["attempts"][number];

function sealedHostedReplayIdentity(attempt: LaneAttempt): string | null {
  const hosted = attempt.hosted;
  if (hosted?.sealedResult === undefined) return null;
  return canonicalize({
    attemptId: attempt.attemptId,
    logicalPass: attempt.logicalPass,
    retryGeneration: attempt.retryGeneration,
    changeRequestId: attempt.changeRequestId,
    headSha: attempt.headSha,
    sourceId: attempt.sourceId,
    chunkSeriesComplete: attempt.chunkSeriesComplete ?? null,
    admission: hosted.admission,
    handle: hosted.handle ?? null,
    target: hosted.target,
    requestedCoverage: hosted.requestedCoverage,
    effectiveCoverage: hosted.effectiveCoverage,
    vehicle: hosted.vehicle ?? null,
    reviewTarget: hosted.reviewTarget,
    requirement: hosted.requirement,
    actorIdentity: hosted.actorIdentity,
  });
}

export function sealedHostedReplayMatches(current: LaneAttempt, proposed: LaneAttempt): boolean {
  const currentId = current.hosted?.sealedResult?.hostedResultId;
  return currentId !== undefined
    && currentId === proposed.hosted?.sealedResult?.hostedResultId
    && sealedHostedReplayIdentity(current) === sealedHostedReplayIdentity(proposed);
}

function recoveredOwnerMatches(current: LaneProgressState, proposed: LaneProgressState): boolean {
  return current.operationId === proposed.operationId
    && current.lane === proposed.lane
    && current.repositoryId === proposed.repositoryId
    && laneSubjectOwnerMatches(current.lineage, proposed.lineage)
    && current.completedPasses >= proposed.completedPasses;
}

function recoveredAttemptMatches(current: LaneAttempt | undefined, proposed: LaneAttempt): boolean {
  return current !== undefined
    && (current.outcome === proposed.outcome
      || (proposed.outcome === "findings" && current.outcome === "settled-findings"))
    && current.terminalProducer
    && canonicalize(current.hosted?.sealedResult ?? null)
      === canonicalize(proposed.hosted?.sealedResult ?? null)
    && sealedHostedReplayMatches(current, proposed);
}

export async function recoverUnacknowledgedHostedSeal(
  store: ReviewOperationStateStore,
  proposed: LaneProgressState,
  attempt: LaneAttempt,
): Promise<LaneProgressState | null> {
  if (!attempt.terminalProducer || attempt.hosted?.sealedResult === undefined) return null;
  try {
    const { state } = await store.readOperation(proposed.operationId);
    if (state?.kind !== "lane-progress") return null;
    const current = LaneProgressStateSchema.parse(state);
    const durableAttempt = current.attempts.find(({ attemptId }) => attemptId === attempt.attemptId);
    return recoveredOwnerMatches(current, proposed) && recoveredAttemptMatches(durableAttempt, attempt)
      ? current : null;
  } catch {
    return null;
  }
}

export async function resolveHostedSealPublishError(
  store: ReviewOperationStateStore,
  proposed: LaneProgressState,
  attempt: LaneAttempt,
  error: unknown,
  expectedOwnerVersion?: number,
): Promise<LaneProgressState | null> {
  if (isReviewVersionConflict(error)) {
    if (expectedOwnerVersion !== undefined) throw error;
    return null;
  }
  const recovered = await recoverUnacknowledgedHostedSeal(store, proposed, attempt);
  if (recovered === null) throw error;
  return recovered;
}
