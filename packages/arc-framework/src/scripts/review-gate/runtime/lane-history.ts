/** Read lineage-owned lane history and dispositions without initialization or publication locks. */
import type { CandidateSupersessionAncestor } from "../../../lib/work-unit/candidate-attestation.js";
import type { LaneProgressState } from "../core/operation-state-schema.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import type { ApprovedDispositionRecord } from "../core/advisory-records.js";
import type { ReviewOperationStateStore, ApprovedDispositionRecordStore } from "../core/ports.js";
import { readLaneProgressOwner, readCandidateInheritedLaneProgress } from "../lane-progress.js";

/** Read the current and inherited owners of both lanes, joining records through their producer identities. */
export async function readReviewLaneHistory(input: {
  readonly store: Pick<ReviewOperationStateStore, "readOperation">;
  readonly dispositionStore: Pick<ApprovedDispositionRecordStore, "readDispositionRecord">;
  readonly resolveSupersessionAncestors: (workUnitId: string, candidateId: string) => Promise<readonly CandidateSupersessionAncestor[]>;
  readonly repositoryId: string; readonly headSha: string; readonly lineage: LaneSubjectLineage; readonly workUnitId?: string;
}): Promise<{ inheritedLineages: LaneSubjectLineage[]; progress: LaneProgressState[]; dispositions: ApprovedDispositionRecord[] }> {
  const ancestors = input.lineage.kind === "candidate" && input.workUnitId !== undefined
    ? await input.resolveSupersessionAncestors(input.workUnitId, input.lineage.candidateId) : [];
  const inheritedLineages = [...ancestors].reverse().map(ancestor => ({ kind: "candidate" as const, candidateId: ancestor.candidateId }));
  const lanes = await Promise.all((["frontline", "standard"] as const).map(async lane => {
    const inherited = await readCandidateInheritedLaneProgress(input.store, { ...input, lane, ancestors });
    const current = await readLaneProgressOwner(input.store, { ...input, lane });
    return [...inherited.ancestorOwners].reverse().map(({ owner }) => owner).concat(current);
  }));
  const progress = lanes.flat().filter((owner): owner is LaneProgressState => owner !== null);
  const producerIds = new Set(progress.flatMap(owner => owner.attempts.map(attempt => attempt.attemptId)));
  // Namespace snapshots acquire publication locks, even for an empty namespace.
  const records = await Promise.all([...producerIds].map(id => input.dispositionStore.readDispositionRecord(id)));
  return { inheritedLineages, progress, dispositions: records.filter(record => record !== null) };
}
