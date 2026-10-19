/** Translate ended legacy attempts using their own immutable admission facts. */
import type { LaneProgressState } from "../../../../scripts/review-gate/core/operation-state-schema.js";
import { mapHostedAttempt } from "./mapping-hosted.js";
import { mapFrontlineAttempt } from "./mapping-frontline.js";
import type { ReviewOutcome } from "./outcome/schema.js";
import { mappingLocalOperation, type ReviewMappingSources } from "./mapping-sources.js";

type LaneAttempt = LaneProgressState["attempts"][number];

/** Project one ended local attempt with its recorded request and optional receipt. */
export function mapReviewAttempt(attempt: LaneAttempt, lane: LaneProgressState, endedAt: string,
  sources: ReviewMappingSources): ReviewOutcome {
  if (attempt.outcome === "pending") throw new Error("Pending attempts have no portable outcome.");
  if (attempt.hosted !== undefined) return mapHostedAttempt(attempt, lane, endedAt);
  if (attempt.frontline !== undefined) return mapFrontlineAttempt(attempt, lane, endedAt, sources);
  if (attempt.local === undefined) throw new Error(`No local admission for ${attempt.attemptId}.`);
  const state = mappingLocalOperation(sources, attempt.local.operationId);
  const receipts = sources.receipts.flatMap((ledger) => ledger.receipts).filter((receipt) => receipt.requestId === state.requestId);
  if (receipts.length > 1) throw new Error(`Ambiguous receipts for ${state.requestId}.`);
  const receipt = receipts[0];
  return {
    schemaVersion: 1, attemptId: attempt.attemptId, lane: lane.lane, lineage: state.lineage,
    logicalPass: attempt.logicalPass, retryGeneration: attempt.retryGeneration,
    source: { sourceId: attempt.sourceId, kind: "local" }, target: state.target,
    requestedCoverage: attempt.local.requestedCoverage, effectiveCoverage: attempt.local.effectiveCoverage,
    ...(attempt.local.correctionScope === undefined ? {} : { correctionScope: attempt.local.correctionScope }),
    ...(attempt.chunkSeriesComplete === undefined ? {} : { chunkSeriesComplete: attempt.chunkSeriesComplete }),
    outcome: attempt.outcome === "settled-findings" ? "findings" : attempt.outcome,
    findings: receipt?.findings ?? [], requirement: state.requirement, endedAt,
    local: { ...attempt.local, request: state.request, attestation: state.attestation,
      policyVersion: state.policyVersion, policyBindingDigest: state.policyBindingDigest,
      attestationRuntimeKind: state.attestationRuntimeKind, sourceDigest: state.sourceDigest,
      guidanceDigest: state.guidanceDigest, ...(receipt === undefined ? {} : { receipt }) },
  };
}
