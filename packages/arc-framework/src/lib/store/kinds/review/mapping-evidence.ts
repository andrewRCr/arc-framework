/** Translate legacy approved disposition lineages without changing their approved identities. */
import { reviewEvidenceBindingForRecord } from "./evidence/binding.js";
import { mapReviewEvidencePerformance } from "./mapping-evidence-performance.js";
import type { ReviewMappingSources } from "./mapping-sources.js";
import { recordReferences } from "../../identity.js";
import { parseApprovedDispositionRecord } from "../../../../scripts/review-gate/core/approved-disposition-codec.js";
import type { ApprovedDispositionRecord, ApprovedDispositionLineageNode } from "../../../../scripts/review-gate/core/advisory-records.js";
import { reviewMappingListingEntry, type ReviewMappingSource } from "./mapping-listing.js";
import { createReviewMappingResultResolver, type MappedDispositionResult } from "./mapping-result.js";
import type { MappedReviewOutcome } from "./mapping-source-listing.js";
import type { ReviewMappingResult } from "./mapping-types.js";
import type { ReviewEvidence } from "./evidence/schema.js";


function enumeratedRecord(source: Extract<ReviewMappingSource, { kind: "gate" }>): ApprovedDispositionRecord | null {
  try { return parseApprovedDispositionRecord(new TextDecoder().decode(source.bytes)); }
  catch { return null; }
}

function dispositionSettlement(node: ApprovedDispositionLineageNode, sources: ReviewMappingSources): ReviewEvidence["settlement"] {
  const set = node.approvedDisposition.dispositionSet;
  for (const state of sources.operations.values()) {
    if (state.kind !== "lane-progress") continue;
    const hosted = state.attempts.find(({ attemptId }) => attemptId === set.producerId)?.hosted;
    const lineage = hosted?.dispositionSetLineage.find(({ dispositionSetId }) => dispositionSetId === set.dispositionSetId);
    if (hosted === undefined || lineage === undefined) continue;
    return { findingActions: lineage.findingActions,
      evidence: hosted.settlementEvidence.filter(({ dispositionSetId }) => dispositionSetId === set.dispositionSetId) };
  }
  return undefined;
}

function dispositionEvidence(record: ApprovedDispositionRecord, node: ApprovedDispositionLineageNode,
  mapped: MappedDispositionResult, sources: ReviewMappingSources): ReviewEvidence {
  const performance = mapReviewEvidencePerformance(node, sources);
  const settlement = dispositionSettlement(node, sources);
  return { schemaVersion: 1, ...mapped, binding: reviewEvidenceBindingForRecord(record), approval: node.approvedDisposition.approval,
    predecessorDispositionSetId: node.predecessorDispositionSetId, successorDispositionSetId: node.successorDispositionSetId,
    responsePolicyRequest: node.responsePolicyRequest,
    ...(performance === undefined ? {} : { performance }),
    ...(settlement === undefined ? {} : { settlement }),
    ...(node.advisoryFixTags === undefined ? {} : { advisoryFixTags: node.advisoryFixTags }),
    ...(node.policyProjectionPending === undefined ? {} : { policyProjectionPending: node.policyProjectionPending }) };
}

/** Map one recognized disposition file, retaining a listing even when enumeration skips its content. */
export function mapReviewEvidenceSource(source: ReviewMappingSource, projectId: string,
  outcomes: readonly MappedReviewOutcome[], sources: ReviewMappingSources): {
    records: ReviewMappingResult["records"]; listing: ReviewMappingResult["listing"][number];
  } | null {
  if (source.kind !== "gate" || !/^arc\/review-gate\/evidence\/disposition-[^/]+\.json$/u.test(source.source)) return null;
  const record = enumeratedRecord(source);
  const records: ReviewMappingResult["records"] = [];
  const leftBehind: string[] = [];
  if (record === null) leftBehind.push("Today's disposition enumeration skips this older or malformed record.");
  else if (record.repositoryId !== projectId) leftBehind.push("Record names another repository ID.");
  else {
    const resolve = createReviewMappingResultResolver(outcomes.map(({ outcome }) => outcome));
    for (const node of record.approvedDispositionLineage) {
      const { dispositionSet } = node.approvedDisposition;
      const mapped = resolve(dispositionSet);
      const producer = outcomes.find(({ outcome }) => outcome.attemptId === dispositionSet.producerId);
      if (mapped === null || producer === undefined) {
        leftBehind.push(`Disposition ${dispositionSet.dispositionSetId} has no mapped live result.`);
        continue;
      }
      const value = dispositionEvidence(record, node, mapped, sources);
      records.push({ reference: recordReferences["review/evidence"](producer.reference.owner, dispositionSet.dispositionSetId),
        contents: [JSON.stringify(value)] });
    }
  }
  return { records, listing: reviewMappingListingEntry({ source: source.source,
    records: records.map(({ reference }) => reference), leftBehind }) };
}
