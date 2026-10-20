/** Response transitions publish native evidence and return derived lane progress. */
import { canonicalize } from "../../../lib/kernel/index.js";
import type { NativeReviewFactPorts, ReviewOperationStateStore } from "../core/ports.js";
import { laneSubjectOwnerMatches } from "../core/lane-admission.js";
import { laneProgressOperationId, readLaneProgressOwner, type recordLaneResponsePerformance, type settleLaneAttempt } from "../lane-progress.js";
import type { bindHostedAttemptDisposition } from "../lane-progress-hosted-settlement.js";
import { LaneProgressStateSchema } from "../core/operation-state-schema.js";
import { StoredReviewResultReader } from "../hosts/local/stored-result-reader.js";
import { publishNativeReviewPerformance } from "./native-review-performance.js";

/** Persist the complete performed response rather than a terminal execution snapshot. */
export async function recordNativeResponsePerformance(facts: NativeReviewFactPorts, store: ReviewOperationStateStore,
  input: Parameters<typeof recordLaneResponsePerformance>[1]): ReturnType<typeof recordLaneResponsePerformance> {
  const result = await new StoredReviewResultReader(facts).readResult(input.attemptId);
  if (result.repositoryId !== input.repositoryId || result.target.headSha !== input.headSha
    || (result.kind === "frontline" ? "frontline" : "standard") !== input.lane
    || !laneSubjectOwnerMatches(result.admission.lineage, input.lineage)) {
    throw new Error("Restore the performed response's exact producer and lane subject before retrying.");
  }
  const record = await facts.evidence.readDispositionRecord(input.attemptId);
  if (record === null) throw new Error("Approve this response before recording its performance, then retry.");
  await publishNativeReviewPerformance({ ...facts, record,
    confirmResponseHeadContinuation: input.confirmResponseHeadContinuation,
    performance: { schemaVersion: 1, producerId: input.attemptId, dispositionSetId: input.dispositionSetId,
      originatingHeadSha: input.headSha, producedHeadSha: input.producedHeadSha, performedAt: input.now,
      ...(input.candidateResponseId === undefined ? {} : { candidateResponseId: input.candidateResponseId }) } });
  const progress = await readLaneProgressOwner(store, input);
  if (progress === null) throw new Error("Restore the performed response's producer outcome before retrying.");
  return progress;
}

/** Settle from approval and complete performance while preserving the existing transition contract. */
export async function settleNativeLaneFindings(facts: NativeReviewFactPorts, store: ReviewOperationStateStore,
  input: Parameters<typeof settleLaneAttempt>[1]): ReturnType<typeof settleLaneAttempt> {
  const progress = await nativeSettlementProgress(store, input);
  if (input.dispositionSetId === undefined || input.producedHeadSha === undefined) {
    if (input.dispositionSetId !== undefined || input.producedHeadSha !== undefined || input.predecessorDispositionSetId !== undefined) {
      throw new Error("lane settlement requires complete response-performance evidence");
    }
    if (progress.attempts.some(attempt => attempt.attemptId === input.attemptId && attempt.outcome === "settled-findings")) return progress;
    throw new Error("Record the complete approved response before settling native findings.");
  }
  return recordNativeResponsePerformance(facts, store, { ...input, lineage: input.lineage ?? progress.lineage,
    dispositionSetId: input.dispositionSetId, producedHeadSha: input.producedHeadSha });
}

async function nativeSettlementProgress(store: ReviewOperationStateStore, input: Parameters<typeof settleLaneAttempt>[1]) {
  const { state } = await store.readOperation(laneProgressOperationId(input));
  if (state?.kind !== "lane-progress" || state.lane !== input.lane || state.repositoryId !== input.repositoryId
    || !state.attempts.some(attempt => attempt.attemptId === input.attemptId && attempt.headSha === input.headSha)) {
    throw new Error("Restore the findings producer before settling its response.");
  }
  return state;
}

/** Confirm the approval's captured host actions without writing terminal lane state. */
export async function bindNativeHostedDisposition(facts: NativeReviewFactPorts, store: ReviewOperationStateStore,
  input: Parameters<typeof bindHostedAttemptDisposition>[1]): ReturnType<typeof bindHostedAttemptDisposition> {
  const record = await facts.evidence.read(input.dispositionSetId);
  const sort = (entries: readonly { findingId: string }[]) => [...entries].sort((a, b) => a.findingId.localeCompare(b.findingId));
  if (record?.value.dispositionSet.producerId !== input.attemptId || record.value.successorDispositionSetId !== null
    || canonicalize(sort(record.value.settlement?.findingActions ?? [])) !== canonicalize(sort(input.findingDispositions))) {
    throw new Error("Approve the exact hosted finding actions before binding their settlement, then retry.");
  }
  return LaneProgressStateSchema.parse((await store.readOperation(input.operationId)).state);
}
