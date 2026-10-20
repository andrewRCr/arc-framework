/** Native response performance publishes complete fix facts in one evidence advance. */
import { canonicalize } from "../../../lib/kernel/index.js";
import { StoredReviewResultReader } from "../hosts/local/stored-result-reader.js";
import { validateApprovedDispositionRecordForResult } from "../core/review-result-disposition.js";
import { currentApprovedDispositionNode } from "../core/advisory-records.js";
import type { LaneResponsePerformance } from "../core/operation-state-schema.js";
import type { NativeReviewApprovalInput } from "./native-review-approval.js";
import { ReviewEvidencePerformanceSchema, type ReviewEvidence } from "../../../lib/store/kinds/review/evidence/schema.js";
import type { StoredReviewFact } from "../core/ports.js";

/** Producer-bound approval and complete performance supplied by the verified response. */
export interface NativeReviewPerformanceInput extends Omit<NativeReviewApprovalInput, "now"> {
  performance: LaneResponsePerformance;
}

/** Publish a response's performance and fix transition together, retaining exact replay and Candidate binding. */
export async function publishNativeReviewPerformance(input: NativeReviewPerformanceInput): Promise<StoredReviewFact<ReviewEvidence>> {
  const result = await new StoredReviewResultReader(input).readResult(input.record.operationId);
  const record = validateApprovedDispositionRecordForResult(input.record, result);
  const node = currentApprovedDispositionNode(record);
  const prior = await input.evidence.read(input.performance.dispositionSetId);
  if (prior === null) throw new Error("Approve this response before recording its performance, then retry.");
  if (input.performance.producerId !== record.operationId
    || input.performance.dispositionSetId !== node.approvedDisposition.dispositionSet.dispositionSetId
    || canonicalize(prior.value.approval) !== canonicalize(node.approvedDisposition.approval)) {
    throw new Error("Response performance does not match its recorded approval; restore the approved response and retry.");
  }
  if (prior.value.policyProjectionPending === true) {
    throw new Error("Complete the approved response policy projection before recording performance, then retry.");
  }
  const fixResponse = node.errandFixResponse ?? node.deliveryMemberFixResponse;
  const performance = ReviewEvidencePerformanceSchema.parse({ ...input.performance,
    ...(fixResponse === null ? {} : { fixResponse }) });
  const current = prior.value.performance;
  if (current !== undefined) {
    performance.performedAt = current.performedAt;
    if (performance.candidateResponseId === undefined && current.candidateResponseId !== undefined) {
      performance.candidateResponseId = current.candidateResponseId;
    }
    if (canonicalize(performance) === canonicalize(current)) return prior;
  }
  return input.evidence.advance({ ...prior.value, performance }, prior.version);
}
