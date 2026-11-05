/** Native response performance publishes complete fix facts in one evidence advance. */
import { assertNativeHostedResponseHeads } from "./native-hosted-response-heads.js";
import type { ConfirmResponseHeadContinuation } from "../core/response-head-continuation.js";
import { canonicalize } from "../../../lib/kernel/index.js";
import { StoredReviewResultReader } from "../hosts/local/stored-result-reader.js";
import { validateApprovedDispositionRecordForResult } from "../core/review-result-disposition.js";
import { currentApprovedDispositionNode } from "../core/advisory-records.js";
import type { LaneResponsePerformance } from "../core/operation-state-schema.js";
import type { NativeReviewApprovalInput } from "./native-review-approval.js";
import { ReviewEvidencePerformanceSchema, type ReviewEvidence } from "../../../lib/store/kinds/review/evidence/schema.js";
import type { StoredReviewFact } from "../core/ports.js";

/** Producer-bound approval and complete performance supplied by the verified response. */
interface NativeReviewPerformanceInput extends Omit<NativeReviewApprovalInput, "now"> {
  performance: LaneResponsePerformance;
  confirmResponseHeadContinuation?: ConfirmResponseHeadContinuation;
}

/** Publish a response's performance and fix transition together, retaining exact replay and Candidate binding. */
export async function publishNativeReviewPerformance(input: NativeReviewPerformanceInput): Promise<StoredReviewFact<ReviewEvidence>> {
  const authority = await new StoredReviewResultReader(input).readAuthority(input.record.operationId);
  return publishNativeReviewPerformanceInView(input, authority);
}

/** Complete the invocation's already loaded authority read without rediscovering its producer or approval. */
export async function publishNativeReviewPerformanceInView(input: NativeReviewPerformanceInput,
  authority: Awaited<ReturnType<StoredReviewResultReader["readAuthority"]>>): Promise<StoredReviewFact<ReviewEvidence>> {
  const { result } = authority;
  const record = validateApprovedDispositionRecordForResult(input.record, result);
  const node = currentApprovedDispositionNode(record);
  const prior = authority.evidence.find(record => record.value.dispositionSet.dispositionSetId === input.performance.dispositionSetId);
  if (prior === undefined || prior.value.successorDispositionSetId !== null) {
    throw new Error("Record performance only for the current approved response in the selected branch, then retry.");
  }
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
  const next = { ...prior.value, performance };
  await assertNativeHostedResponseHeads(next, result, input.confirmResponseHeadContinuation);
  return input.evidence.advance(next, prior.version);
}
