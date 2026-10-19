/** Exact delivery-member response evidence for correction-chain legs. */
import { canonicalize } from "../../../lib/kernel/index.js";
import { currentApprovedDispositionNode } from "../core/advisory-records.js";
import { laneSubjectOwnerMatches } from "../core/lane-admission.js";
import { validateApprovedDispositionRecordForResult } from "../core/review-result-disposition.js";
import type { IncrementalPredecessorApplicability } from "./incremental-coverage-basis.js";
import type { PerformedResponseProofInput } from "./performed-response-proof.js";
import { readIncrementalPredecessorResponseEvidence } from "./review-policy-evidence.js";

/** Keep ordinary contribution grounds, but prove an approved member fix from its performed exact response. */
export async function confirmDeliveryCorrectionLeg(
  input: PerformedResponseProofInput,
  grounds: IncrementalPredecessorApplicability,
): Promise<IncrementalPredecessorApplicability> {
  const { predecessor, currentTarget, currentLineage } = input;
  if (predecessor.target.kind !== "delivery-member" || predecessor.originalOutcome !== "findings") return grounds;
  if (currentTarget.kind !== "delivery-member" || currentLineage.kind !== "delivery-member"
    || predecessor.repositoryId !== currentTarget.repositoryId
    || !laneSubjectOwnerMatches(predecessor.admission.lineage, currentLineage)) return "unavailable";
  try {
    const stored = await input.dispositionStore.readDispositionRecord(predecessor.producerId);
    if (stored === null) return grounds;
    const record = validateApprovedDispositionRecordForResult(stored, predecessor);
    const node = currentApprovedDispositionNode(record);
    if (!node.approvedDisposition.dispositionSet.findings.some(finding => finding.disposition === "fix")) return grounds;
    const response = node.deliveryMemberFixResponse;
    const member = record.deliveryMember;
    if (response === null || member === null
      || member.planId !== currentLineage.planId || member.deliverableId !== currentLineage.deliverableId
      || member.workUnitId !== currentLineage.workUnitId || member.head !== predecessor.target.headSha
      || predecessor.target.baseRef !== currentTarget.baseRef
      || predecessor.target.diffBaseSha !== currentTarget.diffBaseSha
      || predecessor.target.diffBaseTree !== currentTarget.diffBaseTree
      || canonicalize(response.oldTarget) !== canonicalize(predecessor.target)
      || canonicalize(response.newTarget) !== canonicalize(currentTarget)
      || response.fixConsumption.dispositionSetId !== record.currentDispositionSetId
      || response.fixConsumption.oldTargetId !== predecessor.target.targetId
      || response.fixConsumption.newTargetId !== currentTarget.targetId) return "unavailable";
    const performance = await input.readResponsePerformance(predecessor);
    const evidence = await readIncrementalPredecessorResponseEvidence(predecessor, input.dispositionStore,
      () => Promise.resolve(performance));
    return evidence.status === "performed" && performance?.producedHeadSha === currentTarget.headSha
      ? "applicable" : "unavailable";
  } catch {
    return "unavailable";
  }
}
