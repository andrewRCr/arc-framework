/** Resolve legacy review lineages to the imported identities of live work. */
import type { LaneSubjectLineage } from "../../../../scripts/review-gate/core/lane-admission.js";
import { parseCandidateManagedRecord, resolveCandidateSupersessionAncestors } from "../../../work-unit/candidate-attestation.js";
import type { CandidateManagedRecordV1 } from "./candidate/schema.js";
import { candidateRevisionContents } from "./mapping-candidates.js";
import type { ReviewMappingInput, ReviewMappingWorkItem } from "./mapping-types.js";

/** Liveness is resolved before a fact's attempt or continuation state matters. */
export type ReviewMappingOwner =
  | { outcome: "live"; workItem: ReviewMappingWorkItem }
  | { outcome: "left-behind"; reason: string };

function resolvedCandidateIds(record: CandidateManagedRecordV1, history: readonly CandidateManagedRecordV1[]): string[] {
  try {
    return [record.attestation.candidateId,
      ...resolveCandidateSupersessionAncestors(record, history).map((ancestor) => ancestor.candidateId)];
  } catch {
    return [];
  }
}

function candidateOwners(input: Pick<ReviewMappingInput, "workItems" | "candidates">): Map<string, ReviewMappingWorkItem> {
  const owners = new Map<string, ReviewMappingWorkItem>();
  for (const candidate of input.candidates) {
    const workItem = input.workItems.find((row) => row.uid === candidate.workItem && row.kind === "work-unit" && row.live);
    if (workItem === undefined) continue;
    const history: CandidateManagedRecordV1[] = [];
    for (const content of candidateRevisionContents(candidate)) {
      const record = parseCandidateManagedRecord(content);
      if (record === null || record.attestation.workUnit !== workItem.slug) continue;
      for (const id of resolvedCandidateIds(record, history)) owners.set(id, workItem);
      history.unshift(record);
    }
  }
  return owners;
}

/** Bind imported work-item identities for subsequent legacy lineage joins. */
export function createReviewMappingWorkItemResolver(
  input: Pick<ReviewMappingInput, "workItems" | "candidates">,
): (lineage: LaneSubjectLineage) => ReviewMappingOwner {
  const candidates = candidateOwners(input);
  const workUnits = new Map(input.workItems.filter((row) => row.kind === "work-unit" && row.live).map((row) => [row.slug, row]));
  const errands = new Map(input.workItems.flatMap((row) => row.kind === "errand" && row.live ? [[row.claimId, row] as const] : []));
  return (lineage) => {
    const workItem = lineage.kind === "candidate" ? candidates.get(lineage.candidateId)
      : lineage.kind === "delivery-member" ? workUnits.get(lineage.workUnitId)
      : lineage.vehicleKind === "errand" ? errands.get(lineage.vehicleIdentity) : undefined;
    return workItem === undefined
      ? { outcome: "left-behind", reason: "No live work item owns this review fact." }
      : { outcome: "live", workItem };
  };
}
