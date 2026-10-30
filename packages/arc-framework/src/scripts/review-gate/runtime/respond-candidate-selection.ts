/** The work units whose Candidate a response may read for its producer's lineage. */
import type { Store } from "../../../lib/store/contract.js";
import type { OwnerIdentity } from "../../../lib/store/identity.js";
import type { CandidateMutationOwner } from "../../../lib/work-unit/candidate-mutation-owner.js";

/**
 * Select the checkout's work unit, or from a free primary each completed one. Natively a response reads only its bound
 * work item, and only where the checkout may continue it, since every other slug names a different owner's record.
 */
export async function selectRespondCandidateWorkUnits(input: { store?: Store; workItem?: OwnerIdentity },
  owner: CandidateMutationOwner, completedWorkUnits: () => Promise<readonly string[]>): Promise<readonly string[]> {
  const bound = input.store?.capabilities.stateOffBranch === true ? input.workItem : undefined;
  if (owner.status === "owned") return bound === undefined || bound.name === owner.workUnit ? [owner.workUnit] : [];
  if (owner.status !== "unowned") return [];
  const completed = await completedWorkUnits();
  if (bound === undefined) return completed;
  return completed.includes(bound.name) ? [bound.name] : [];
}
