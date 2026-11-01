/** Reconstruct native approved-disposition reads from portable producer evidence. */
import type { OwnerIdentity } from "../../../identity.js";
import { ApprovedDispositionRecordSchema, type ApprovedDispositionRecord, type ApprovedDispositionLineageNode } from
  "../../../../../scripts/review-gate/core/advisory-records.js";
import { bindReviewSourceReference } from "../../../../../scripts/review-gate/core/review-source-reference.js";
import { createFixAuthorization } from "../../../../../scripts/review-gate/core/fix-authorization.js";
import { laneProgressOperationId } from "../../../../../scripts/review-gate/lane-progress.js";
import type { ReviewOutcome } from "../outcome/schema.js";
import { reviewOutcomeKey } from "../outcome/key.js";
import type { ReviewEvidence } from "./schema.js";
import { StoreRefusalError } from "../../../refusal-error.js";

/** Attribute a damaged approval lineage to every producer, evidence key, and outcome key it contains. */
export function reviewEvidenceLineageRefusal(evidence: readonly ReviewEvidence[], rule: string, remedy: string): StoreRefusalError {
  const records = evidence.map(value => ({ producer: value.dispositionSet.producerId,
    evidence: value.dispositionSet.dispositionSetId, outcome: value.result.outcomeKey,
    predecessor: value.predecessorDispositionSetId, successor: value.successorDispositionSetId }));
  return new StoreRefusalError({ code: "record-malformed", class: "recoverable", rule: `review.evidence.${rule}`,
    condition: `The approved-response lineage is damaged: ${JSON.stringify(records)}.`, remedy: { text: remedy } }, true);
}

/** Require and order one complete approved-response lineage. */
export function orderReviewEvidenceLineage(evidence: readonly ReviewEvidence[]): ReviewEvidence[] {
  const roots = evidence.filter((value) => value.predecessorDispositionSetId === null);
  const records = new Map(evidence.map((value) => [value.dispositionSet.dispositionSetId, value]));
  if (roots.length !== 1 || records.size !== evidence.length) throw reviewEvidenceLineageRefusal(evidence, "root",
    "A single approved-response root is required. No command currently repairs a pull-merged second root.");
  const ordered: ReviewEvidence[] = [];
  const seen = new Set<string>();
  let current = roots[0];
  while (current !== undefined) {
    const id = current.dispositionSet.dispositionSetId;
    if (seen.has(id)) throw reviewEvidenceLineageRefusal(evidence, "cycle", "Restore an acyclic approved-response lineage.");
    seen.add(id);
    ordered.push(current);
    if (current.successorDispositionSetId === null) break;
    current = records.get(current.successorDispositionSetId);
    if (current === undefined) throw reviewEvidenceLineageRefusal(evidence, "successor", "Restore the missing approved-response successor.");
  }
  if (ordered.length !== evidence.length) throw reviewEvidenceLineageRefusal(evidence, "connected",
    "Restore every connected approved response before reading the lineage.");
  return ordered;
}

function lineageNode(value: ReviewEvidence, outcome: ReviewOutcome): ApprovedDispositionLineageNode {
  const approvedDisposition = { schemaVersion: 2 as const, semanticsVersion: "review-gate/v2" as const,
    state: "approved" as const, dispositionSet: value.dispositionSet, approval: value.approval };
  return { approvedDisposition, responsePolicyRequest: value.responsePolicyRequest,
    ...(value.advisoryFixTags === undefined ? {} : { advisoryFixTags: value.advisoryFixTags }),
    ...(value.policyProjectionPending === undefined ? {} : { policyProjectionPending: value.policyProjectionPending }),
    fixAuthorization: value.dispositionSet.findings.some(({ disposition }) => disposition === "fix")
      ? createFixAuthorization({ dispositionState: approvedDisposition, oldTarget: outcome.target }) : null,
    errandFixResponse: value.binding?.kind === "errand" ? value.performance?.fixResponse ?? null : null,
    deliveryMemberFixResponse: value.binding?.kind === "delivery-member" && value.performance?.fixResponse !== undefined
      && "hostedFixTarget" in value.performance.fixResponse ? value.performance.fixResponse : null,
    predecessorDispositionSetId: value.predecessorDispositionSetId, successorDispositionSetId: value.successorDispositionSetId };
}

function producerSource(outcome: ReviewOutcome, workItem: OwnerIdentity): ApprovedDispositionRecord["source"] {
  if (outcome.local !== undefined) return { kind: "attested-local",
    receiptRef: bindReviewSourceReference({ repositoryId: outcome.target.repositoryId, workItem, kind: "attested-local", operationId: outcome.attemptId,
      durableRef: reviewOutcomeKey(outcome) }), localSourceRef: outcome.local.sourceDigest };
  if (outcome.frontline !== undefined) return { kind: "frontline",
    outcomeRef: bindReviewSourceReference({ repositoryId: outcome.target.repositoryId, workItem, kind: "frontline", operationId: outcome.attemptId,
      durableRef: reviewOutcomeKey(outcome) }) };
  const sealed = outcome.hosted?.sealedResult;
  if (sealed === undefined) throw new Error("Restore the sealed hosted result before reading its approvals.");
  return { kind: "hosted", attemptRef: bindReviewSourceReference({ repositoryId: outcome.target.repositoryId, workItem, kind: "hosted", operationId: laneProgressOperationId({
    lane: outcome.lane, repositoryId: outcome.target.repositoryId, headSha: outcome.target.headSha, lineage: outcome.lineage,
  }), durableRef: outcome.attemptId }), hostedResultId: sealed.hostedResultId };
}

/** Compose one producer's approvals with command-compatible portable source coordinates. */
export function composeReviewDispositionRecord(outcome: ReviewOutcome, evidence: readonly ReviewEvidence[], owner: OwnerIdentity): ApprovedDispositionRecord {
  const ordered = orderReviewEvidenceLineage(evidence);
  const value = ordered[0];
  const tail = ordered.at(-1);
  if (value === undefined || tail === undefined) throw new Error("Restore the approved-response lineage before reading it.");
  const binding = value.binding;
  return ApprovedDispositionRecordSchema.parse({ schemaVersion: 1, semanticsVersion: "review-advisory/v1",
    repositoryId: outcome.target.repositoryId, operationId: outcome.attemptId,
    candidate: binding !== null && "candidate" in binding ? binding.candidate : null,
    errand: binding?.kind === "errand" ? binding.errand : null,
    deliveryMember: binding !== null && "deliveryMember" in binding ? binding.deliveryMember : null,
    source: producerSource(outcome, owner),
    currentDispositionSetId: tail.dispositionSet.dispositionSetId,
    approvedDispositionLineage: ordered.map((entry) => lineageNode(entry, outcome)),
  });
}
