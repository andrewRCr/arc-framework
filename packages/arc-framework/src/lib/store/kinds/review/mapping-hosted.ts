/** Hosted import retains sealed producer facts while removing mutable response aggregates. */
import type { LaneProgressState } from "../../../../scripts/review-gate/core/operation-state-schema.js";
import { projectHostedFinding } from "../../../../scripts/review-gate/hosted/await.js";
import type { ReviewOutcome } from "./outcome/schema.js";

/** Project the explicit portable fields of one ended hosted admission. */
export function mapHostedAttempt(attempt: LaneProgressState["attempts"][number], lane: LaneProgressState,
  endedAt: string): ReviewOutcome {
  const hosted = attempt.hosted;
  if (hosted === undefined || attempt.outcome === "pending") throw new Error("Expected ended hosted admission.");
  return {
    schemaVersion: 1, attemptId: attempt.attemptId, lane: lane.lane, lineage: hosted.admission.lineage,
    logicalPass: attempt.logicalPass, retryGeneration: attempt.retryGeneration,
    source: { sourceId: attempt.sourceId, kind: "hosted" }, target: hosted.reviewTarget,
    requestedCoverage: hosted.requestedCoverage, effectiveCoverage: hosted.effectiveCoverage,
    ...(hosted.admission.correctionScope === undefined ? {} : { correctionScope: hosted.admission.correctionScope }),
    ...(attempt.chunkSeriesComplete === undefined ? {} : { chunkSeriesComplete: attempt.chunkSeriesComplete }),
    outcome: attempt.outcome === "settled-findings" ? "findings" : attempt.outcome,
    findings: (hosted.sealedResult?.findings ?? []).map(projectHostedFinding), requirement: hosted.requirement, endedAt,
    hosted: { admission: hosted.admission, target: hosted.target, requestedCoverage: hosted.requestedCoverage,
      effectiveCoverage: hosted.effectiveCoverage, reviewTarget: hosted.reviewTarget, requirement: hosted.requirement,
      actorIdentity: hosted.actorIdentity, requestFailureReason: hosted.requestFailureReason,
      ...(hosted.handle === undefined ? {} : { handle: hosted.handle }),
      ...(hosted.vehicle === undefined ? {} : { vehicle: hosted.vehicle }),
      ...(hosted.sealedResult === undefined ? {} : { sealedResult: hosted.sealedResult }) },
  };
}
