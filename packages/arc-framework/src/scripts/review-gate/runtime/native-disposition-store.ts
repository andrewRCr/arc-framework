/** Command-compatible approved response access over native evidence publishers. */
import type { ApprovedDispositionRecordStore, ApprovedDispositionRecordIndex } from "../core/ports.js";
import { publishNativeReviewPerformance } from "./native-review-performance.js";
import type { ConfirmResponseHeadContinuation } from "../core/response-head-continuation.js";
import { publishNativeReviewApproval } from "./native-review-approval.js";
import { currentApprovedDispositionNode } from "../core/advisory-records.js";
import type { ApprovedDispositionRecord } from "../core/advisory-records.js";
import { publishNativeReviewSuccessor, type NativeReviewSuccessorInput } from "./native-review-successor.js";

/** One invocation's checked store, producer facts, and execution reader. */
type NativeDispositionStoreInput = Omit<NativeReviewSuccessorInput, "record"> & { confirmResponseHeadContinuation?: ConfirmResponseHeadContinuation };

/** Persist complete response facts while composing existing command reads from portable evidence. */
export class NativeApprovedDispositionRecordStore implements ApprovedDispositionRecordStore, ApprovedDispositionRecordIndex {
  constructor(private readonly input: NativeDispositionStoreInput) {}
  readDispositionRecord(operationId: string): Promise<ApprovedDispositionRecord | null> {
    return this.input.evidence.readDispositionRecord(operationId);
  }
  listDispositionRecords(): Promise<readonly ApprovedDispositionRecord[]> {
    return this.input.evidence.listDispositionRecords();
  }
  async appendDispositionRecord(record: ApprovedDispositionRecord): Promise<{ dispositionRecordRef: string }> {
    const node = currentApprovedDispositionNode(record);
    const fixResponse = node.errandFixResponse ?? node.deliveryMemberFixResponse;
    const written = fixResponse !== null
      ? await publishNativeReviewPerformance({ ...this.input, record, performance: { schemaVersion: 1,
        producerId: record.operationId, dispositionSetId: node.approvedDisposition.dispositionSet.dispositionSetId,
        originatingHeadSha: fixResponse.oldTarget.headSha, producedHeadSha: fixResponse.newTarget.headSha,
        performedAt: this.input.now() } })
      : node.predecessorDispositionSetId === null
      ? await publishNativeReviewApproval({ ...this.input, record })
      : await publishNativeReviewSuccessor({ ...this.input, record });
    return { dispositionRecordRef: JSON.stringify(written.reference) };
  }
}
