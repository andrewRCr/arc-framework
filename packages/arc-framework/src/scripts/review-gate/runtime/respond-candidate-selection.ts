/** The work units whose Candidate a response may read for its producer's lineage. */
import { readCandidateRecord } from "../../../lib/store/kinds/review/candidate/access.js";
import type { Store } from "../../../lib/store/contract.js";
import { sameOwner, type OwnerIdentity } from "../../../lib/store/identity.js";
import type { CandidateMutationOwner } from "../../../lib/work-unit/candidate-mutation-owner.js";
import type { CandidateManagedRecordV1 } from "../../../lib/work-unit/candidate-attestation.js";
import { resolveCandidateMutationOwner, resolveCompletedCandidateOwners } from "../../../handlers/candidate-mutation-owner.js";
import type { ReviewResult } from "../core/review-result.js";
import type { ReviewInvocationInput } from "./invocation.js";

/**
 * Select the checkout's work unit, or from a free primary each completed one. Natively a response reads only its bound
 * work item, and only where the checkout may continue it: from a free primary, only a completed generation itself, never
 * a live namesake reusing its slug.
 */
export async function selectRespondCandidateWorkUnits(input: { store?: Store; workItem?: OwnerIdentity },
  owner: CandidateMutationOwner, completedOwners: () => Promise<readonly OwnerIdentity[]>): Promise<readonly string[]> {
  const bound = input.store?.capabilities.stateOffBranch === true ? input.workItem : undefined;
  if (owner.status === "owned") return bound === undefined || bound.name === owner.workUnit ? [owner.workUnit] : [];
  if (owner.status !== "unowned") return [];
  const completed = await completedOwners();
  if (bound === undefined) return completed.map(({ name }) => name);
  return completed.some(completedOwner => sameOwner(completedOwner, bound)) ? [bound.name] : [];
}

/** Select only the unique managed Candidate that owns the immutable producer lineage. */
export async function readRespondCandidate(input: ReviewInvocationInput, lineage: ReviewResult["admission"]["lineage"]):
  Promise<{ workUnit: string; record: CandidateManagedRecordV1 } | null> {
  if (lineage.kind !== "candidate") return null;
  const workUnits = await selectRespondCandidateWorkUnits(input, await resolveCandidateMutationOwner(input),
    () => resolveCompletedCandidateOwners(input.cwd, input.store));
  const candidates = await Promise.all(workUnits.map(async (workUnit) => ({
    workUnit,
    record: await readCandidateRecord(input.cwd, workUnit, { store: input.store, exec: input.exec, owner: input.workItem }),
  })));
  const matching = candidates.filter(({ record }) =>
    record?.attestation.candidateId === lineage.candidateId);
  const selected = matching.length === 1 ? matching[0] : undefined;
  return selected?.record == null ? null : { workUnit: selected.workUnit, record: selected.record };
}
