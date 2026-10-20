/** Initial native approvals and their policy projection are persisted as producer-bound evidence. */
import { canonicalize } from "../../../lib/kernel/index.js";
import { StoredReviewResultReader } from "../hosts/local/stored-result-reader.js";
import { validateApprovedDispositionRecordForResult } from "../core/review-result-disposition.js";
import { currentApprovedDispositionNode, type ApprovedDispositionLineageNode, type ApprovedDispositionRecord } from "../core/advisory-records.js";
import type { ReviewOutcomePort, ReviewEvidencePort, StoredReviewFact } from "../core/ports.js";
import { reviewEvidenceBindingForRecord } from "../../../lib/store/kinds/review/evidence/binding.js";
import { reviewOutcomeKey } from "../../../lib/store/kinds/review/outcome/key.js";
import type { ReviewOutcome } from "../../../lib/store/kinds/review/outcome/schema.js";
import { ReviewEvidenceSchema, type ReviewEvidence } from "../../../lib/store/kinds/review/evidence/schema.js";

/** Existing native ports selected together by the invocation's composition root. */
export interface NativeReviewApprovalInput {
  record: ApprovedDispositionRecord;
  outcomes: ReviewOutcomePort;
  evidence: ReviewEvidencePort;
  readProjectId(): Promise<string>;
  now(): string;
}

/** Publish one initial approval, replay its captured binding, or finish its pending policy projection. */
export async function publishNativeReviewApproval(input: NativeReviewApprovalInput): Promise<StoredReviewFact<ReviewEvidence>> {
  const result = await new StoredReviewResultReader(input).readResult(input.record.operationId);
  const record = validateApprovedDispositionRecordForResult(input.record, result);
  const node = currentApprovedDispositionNode(record);
  if (record.approvedDispositionLineage.length !== 1 || node.predecessorDispositionSetId !== null
    || node.successorDispositionSetId !== null) throw new Error("Initial approval requires one unsuperseded response.");
  const id = node.approvedDisposition.dispositionSet.dispositionSetId;
  const prior = await input.evidence.read(id);
  if (prior !== null) return replayApproval(prior, node, input.evidence);
  if (node.errandFixResponse !== null || node.deliveryMemberFixResponse !== null) {
    throw new Error("Record approval before publishing a performed response.");
  }
  const listing = await input.outcomes.list();
  if (listing.status !== "complete") throw new Error(listing.reason);
  const stored = listing.records.find(({ value }) => value.attemptId === record.operationId);
  if (stored === undefined) throw new Error("Restore the exact producer outcome before approving its response.");
  return input.evidence.create(initialApproval(record, node, stored.value, input.now()));
}

function initialApproval(record: ApprovedDispositionRecord, node: ApprovedDispositionLineageNode,
  outcome: ReviewOutcome, now: string): ReviewEvidence {
  const set = node.approvedDisposition.dispositionSet;
  const settlement = initialHostedSettlement(node, outcome, now);
  return ReviewEvidenceSchema.parse({ schemaVersion: 1, binding: reviewEvidenceBindingForRecord(record),
    result: { outcomeKey: reviewOutcomeKey(outcome), resultDigest: set.resultDigest }, dispositionSet: set,
    approval: node.approvedDisposition.approval, predecessorDispositionSetId: null, successorDispositionSetId: null,
    responsePolicyRequest: node.responsePolicyRequest,
    ...(node.advisoryFixTags === undefined ? {} : { advisoryFixTags: node.advisoryFixTags }),
    ...(node.policyProjectionPending === undefined ? {} : { policyProjectionPending: node.policyProjectionPending }),
    ...(settlement === undefined ? {} : { settlement }) });
}

function initialHostedSettlement(node: ApprovedDispositionLineageNode, outcome: ReviewOutcome,
  now: string): ReviewEvidence["settlement"] {
  const findings = outcome.hosted?.sealedResult?.findings;
  if (findings === undefined) return undefined;
  const findingActions = node.approvedDisposition.dispositionSet.findings.map(({ findingId, disposition }) => ({
    findingId, disposition, channelAction: findings.find(finding => finding.findingId === findingId)?.settlement === "reply-and-resolve"
      ? "reply-and-resolve" as const : "record-only" as const }));
  return { findingActions, evidence: findingActions.filter(action => action.channelAction === "record-only").map(action => ({
    ...action, channelAction: "record-only" as const, dispositionSetId: node.approvedDisposition.dispositionSet.dispositionSetId,
    performedAt: now, carriedFromDispositionSetId: null })) };
}

async function replayApproval(prior: StoredReviewFact<ReviewEvidence>, node: ApprovedDispositionLineageNode,
  evidence: ReviewEvidencePort): Promise<StoredReviewFact<ReviewEvidence>> {
  if (canonicalize({ dispositionSet: prior.value.dispositionSet, approval: prior.value.approval })
    !== canonicalize({ dispositionSet: node.approvedDisposition.dispositionSet, approval: node.approvedDisposition.approval })) {
    throw new Error("Approval conflicts with its recorded response; replay the original approval.");
  }
  if (prior.value.policyProjectionPending === true && node.policyProjectionPending === undefined) {
    const next = { ...prior.value, responsePolicyRequest: node.responsePolicyRequest };
    delete next.policyProjectionPending;
    return evidence.advance(next, prior.version);
  }
  return prior;
}
