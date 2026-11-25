/** Join the two legacy writes that recorded a performed review response. */
import type { ApprovedDispositionLineageNode } from "../../../../scripts/review-gate/core/advisory-records.js";
import type { LaneResponsePerformance } from "../../../../scripts/review-gate/core/operation-state-schema.js";
import type { ReviewMappingSources } from "./mapping-sources.js";
import type { ReviewEvidence } from "./evidence/schema.js";

function recordedPerformance(node: ApprovedDispositionLineageNode, sources: ReviewMappingSources): LaneResponsePerformance | undefined {
  const set = node.approvedDisposition.dispositionSet;
  for (const state of sources.operations.values()) {
    if (state.kind !== "lane-progress") continue;
    const attempt = state.attempts.find(({ attemptId }) => attemptId === set.producerId);
    if (attempt === undefined) continue;
    return [...(attempt.responsePerformanceHistory ?? []),
      ...(attempt.responsePerformance === undefined ? [] : [attempt.responsePerformance])]
      .find((performance) => performance.dispositionSetId === set.dispositionSetId && performance.producerId === set.producerId);
  }
  return undefined;
}

/** Preserve a set's recorded lane header and attach its complete Errand or member fix transition. */
export function mapReviewEvidencePerformance(node: ApprovedDispositionLineageNode,
  sources: ReviewMappingSources): ReviewEvidence["performance"] {
  const recorded = recordedPerformance(node, sources);
  const fixResponse = node.errandFixResponse ?? node.deliveryMemberFixResponse;
  if (recorded !== undefined) return { ...recorded, ...(fixResponse === null ? {} : { fixResponse }) };
  if (fixResponse === null) return undefined;
  return { schemaVersion: 1, producerId: node.approvedDisposition.dispositionSet.producerId,
    dispositionSetId: node.approvedDisposition.dispositionSet.dispositionSetId,
    originatingHeadSha: fixResponse.oldTarget.headSha, producedHeadSha: fixResponse.newTarget.headSha,
    performedAt: fixResponse.fixConsumption.consumedAt, fixResponse };
}
