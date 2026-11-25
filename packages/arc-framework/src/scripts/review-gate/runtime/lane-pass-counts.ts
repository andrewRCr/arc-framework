/** Read standard-pass counts across the current and superseded Candidate owners. */
import type { GitExec } from "../../../lib/git/exec.js";
import type { Store } from "../../../lib/store/contract.js";
import type { OwnerIdentity } from "../../../lib/store/identity.js";
import type { CandidateManagedRecordV1 } from "../../../lib/work-unit/candidate-attestation.js";
import type { ReviewOperationStateStore } from "../core/ports.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import { countCompleteLogicalPasses, readCandidateInheritedLaneProgress, readLaneProgressOwner } from "../lane-progress.js";
import { createLocalReviewCandidateReader } from "./local-prepare-composition.js";

/** Count the exact lane owner and its validated supersession ancestors without importing their attempts. */
export async function readStandardPassCounts(input: {
  readonly cwd: string; readonly exec: GitExec;
  readonly store: Pick<ReviewOperationStateStore, "readOperation">;
  /** The invocation's review-record store and exact work item, which every Candidate read shares with the lane. */
  readonly reviewRecordStore: Store | undefined; readonly workItem: OwnerIdentity | undefined;
  readonly repositoryId: string; readonly headSha: string; readonly lineage: LaneSubjectLineage;
  readonly candidate?: CandidateManagedRecordV1 | null;
}): Promise<{ completePasses: number; completedPasses: number }> {
  const candidate = input.candidate;
  const ancestors = input.lineage.kind === "candidate" && candidate?.attestation.supersedes !== undefined
    ? await createLocalReviewCandidateReader({ cwd: input.cwd, exec: input.exec, store: input.reviewRecordStore,
      workItem: input.workItem }).readSupersessionAncestors(
      candidate.attestation.workUnit, input.lineage.candidateId) : [];
  const [owner, inherited] = await Promise.all([
    readLaneProgressOwner(input.store, { ...input, lane: "standard" }),
    readCandidateInheritedLaneProgress(input.store, { ...input, lane: "standard", ancestors }),
  ]);
  return { completePasses: countCompleteLogicalPasses(owner?.attempts ?? []) + inherited.inheritedCompletePasses,
    completedPasses: (owner?.completedPasses ?? 0) + inherited.inheritedCompletedPasses };
}
