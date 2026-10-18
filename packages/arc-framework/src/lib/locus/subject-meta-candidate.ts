/** Acquire the selected work-unit generation's Candidate without a checkout projection. */
import { describeRecordConflicts } from "../store/conflict-diagnostics.js";
import type { Store } from "../store/contract.js";
import { recordReferences, type OwnerIdentity } from "../store/identity.js";

/** Read Candidate bytes while preserving Store refusals and unresolved conflict authority.
 * @param store - The same operational Store that acquired the work-unit record.
 * @param owner - The work unit's already-resolved owner, including its generation UID.
 * @returns Exact Candidate content for the existing delivery parser and projectors.
 */
export async function readStoreSubjectCandidate(store: Store, owner: OwnerIdentity): Promise<string> {
  const reference = recordReferences["review/candidate"](owner);
  const read = await store.read({ reference });
  if (read.status === "refused") throw new Error(`${read.refusal.condition} ${read.refusal.remedy.text}`);
  if (read.result.conflicts.length > 0) {
    throw new Error(`Candidate record for ${owner.name} has unresolved conflicts.${describeRecordConflicts(read.result.conflicts)}`);
  }
  return read.result.content;
}
