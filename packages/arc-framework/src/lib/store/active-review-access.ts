/** Deferred active-status access to one invocation's native review records and work-branch links. */
import type { MetaFileCandidate } from "../../commands/active/types.js";
import { resolveReviewInvocation, type ReviewInvocationInput, type ReviewInvocationContext } from "../../scripts/review-gate/runtime/invocation.js";
import { readCandidateRecord } from "./kinds/review/candidate/access.js";
import type { CandidateManagedRecordV1 } from "./kinds/review/candidate/schema.js";
import { unwrapReviewRecordResult } from "./kinds/review/access-shared.js";
import { readWorkUnit } from "./lifecycle-write.js";
import { recordReferences, type OwnerIdentity } from "./identity.js";
import { selectWorkBranchLink, workBranchName } from "./lifecycle-branch.js";
import { identifyWorkUnitArtifactPath } from "../layout/index.js";

/** Native content and exact generation retained beside the public candidate fields. */
export interface ActiveReviewSubject {
  candidate: MetaFileCandidate;
  record?: CandidateManagedRecordV1 | null;
  owner?: OwnerIdentity;
}
/** Shared invocation and its capability-selected Candidate reader. */
export interface ActiveReviewAccess extends ReviewInvocationContext {
  readSubject(candidate: MetaFileCandidate, owner?: OwnerIdentity): Promise<ActiveReviewSubject>;
}
/** Open or retain one Store for the active reader and all of its review projections. */
export function createActiveReviewAccess(input: ReviewInvocationInput): ActiveReviewAccess {
  const invocation = resolveReviewInvocation(input);
  return { ...invocation, readSubject: async (candidate: MetaFileCandidate, owner?: OwnerIdentity): Promise<ActiveReviewSubject> => {
    if (!invocation.store.capabilities.stateOffBranch) return { candidate };
    const slug = identifyWorkUnitArtifactPath(candidate.path)?.slug;
    if (slug === undefined) throw new Error(`Cannot identify ${candidate.filename}`);
    const primary = unwrapReviewRecordResult(invocation.store, owner === undefined ? await readWorkUnit(invocation.store, slug)
      : await invocation.store.read({ reference: recordReferences["work-item/meta"](owner) }));
    const selected = primary.reference.owner;
    const record = await readCandidateRecord(input.cwd, selected.name, { store: invocation.store, owner: selected });
    let branch = candidate.branch;
    if (candidate.state === "Integrating") {
      const linked = selectWorkBranchLink(primary, { repository: await invocation.projectId() });
      if (linked.kind !== "linked") throw new Error(linked.kind === "ambiguous" ? linked.reason : "The work unit has no work-branch link.");
      branch = workBranchName(linked.link.ref);
    }
    return { candidate: { ...candidate, branch, candidateId: record?.attestation.candidateId ?? null }, record, owner: selected };
  } };
}
