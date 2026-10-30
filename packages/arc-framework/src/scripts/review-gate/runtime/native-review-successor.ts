/** Native response succession links the predecessor and its new approval atomically. */
import { canonicalize } from "../../../lib/kernel/index.js";
import { RecordVersionSchema } from "../../../lib/store/identity.js";
import { unwrapReviewRecordResult } from "../../../lib/store/kinds/review/access-shared.js";
import { StoredReviewResultReader } from "../hosts/local/stored-result-reader.js";
import { validateApprovedDispositionRecordForResult } from "../core/review-result-disposition.js";
import { currentApprovedDispositionNode } from "../core/advisory-records.js";
import { inspectHostedAttemptDispositionSupersession } from "../lane-progress-hosted-settlement.js";
import { createNativeReviewApprovalEvidence, replayNativeReviewApproval } from "./native-review-approval.js";
import type { Store } from "../../../lib/store/contract.js";
import type { StoredReviewFact, ReviewOperationStateStore } from "../core/ports.js";
import type { ReviewEvidence } from "../../../lib/store/kinds/review/evidence/schema.js";
import type { NativeReviewApprovalInput } from "./native-review-approval.js";

/** Successor approval and the selected invocation's atomic store and lane reader. */
export interface NativeReviewSuccessorInput extends NativeReviewApprovalInput {
  store: Pick<Store, "batch" | "capabilities">;
  inFlight: ReviewOperationStateStore;
}

/** Create a successor and mark its current unperformed predecessor in one batch. */
export async function publishNativeReviewSuccessor(input: NativeReviewSuccessorInput): Promise<StoredReviewFact<ReviewEvidence>> {
  const result = await new StoredReviewResultReader(input).readResult(input.record.operationId);
  const record = validateApprovedDispositionRecordForResult(input.record, result);
  const node = currentApprovedDispositionNode(record), predecessorId = node.predecessorDispositionSetId;
  if (predecessorId === null || node.successorDispositionSetId !== null) {
    throw new Error("A successor approval requires its exact predecessor; restore the approved response and retry.");
  }
  const id = node.approvedDisposition.dispositionSet.dispositionSetId;
  const existing = await input.evidence.read(id);
  if (existing !== null) return replayNativeReviewApproval(existing, node, input.evidence);
  const prior = await input.evidence.read(predecessorId);
  if (prior === null) throw new Error("Restore the approved predecessor before approving its successor, then retry.");
  assertCurrentUnperformedPredecessor(prior.value);
  const previousNode = record.approvedDispositionLineage.at(-2);
  if (canonicalize(previousNode?.approvedDisposition) !== canonicalize({ schemaVersion: 2,
    semanticsVersion: "review-gate/v2", state: "approved", dispositionSet: prior.value.dispositionSet, approval: prior.value.approval })) {
    throw new Error("The successor does not retain its recorded predecessor approval; restore the original approval and retry.");
  }
  if (node.errandFixResponse !== null || node.deliveryMemberFixResponse !== null) {
    throw new Error("Approve the successor before publishing its performed response.");
  }
  const outcome = await input.outcomes.read(prior.value.result.outcomeKey);
  if (outcome === null) throw new Error("Restore the exact producer outcome before approving its successor.");
  const next = { ...createNativeReviewApprovalEvidence(record, node, outcome.value, input.now()),
    binding: prior.value.binding, predecessorDispositionSetId: predecessorId };
  if (result.kind === "hosted" && next.settlement !== undefined) {
    const projected = await inspectHostedAttemptDispositionSupersession(input.inFlight, {
      operationId: result.laneOperationId, attemptId: result.producerId, predecessorDispositionSetId: predecessorId,
      successorDispositionSetId: id, findingDispositions: next.settlement.findingActions, now: input.now() });
    next.settlement.evidence = projected.progress.attempts.find(attempt => attempt.attemptId === result.producerId)
      ?.hosted?.settlementEvidence.filter(entry => entry.dispositionSetId === id) ?? [];
  }
  const put = input.evidence.prepareCreate(next);
  const batch = unwrapReviewRecordResult(input.store, await input.store.batch({ writes: [
    input.evidence.prepareAdvance({ ...prior.value, successorDispositionSetId: id }, prior.version), put],
    provenance: { verb: "review", lifecycleAction: "edit" } }));
  const written = batch.writes[1];
  if (written === undefined) throw new Error("Restore the missing successor batch result before continuing.");
  return { reference: written.reference, version: RecordVersionSchema.parse(written.version), value: next };
}

function assertCurrentUnperformedPredecessor(value: ReviewEvidence): void {
  if (value.performance !== undefined) {
    throw new Error("The predecessor already has a performed response; replay that response or obtain a new review result.");
  }
  if (value.successorDispositionSetId !== null) {
    throw new Error("The predecessor already has a successor; replay the current approval or approve a successor to that current set.");
  }
  if (value.policyProjectionPending === true) {
    throw new Error("Complete the predecessor's policy projection before approving its successor, then retry.");
  }
}
