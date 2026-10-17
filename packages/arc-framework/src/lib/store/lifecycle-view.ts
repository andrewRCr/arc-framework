/** Slug-keyed lifecycle view and completeness evidence over identity-keyed store records. */
import type { Store } from "./contract.js";
import { listLifecycleIndex, type LifecycleIndexOutcome, type LifecycleEntry } from "./lifecycle-index.js";
import { lifecycleArtifactPath } from "./lifecycle-storage.js";
import { buildLifecycleIndexFromRecords, type LifecycleIndex } from "../work-unit/lifecycle-index.js";
import type { StoreResult } from "./refusal.js";

/** Read one view without discarding the inventory's completeness evidence.
 * @param store - Operational store.
 * @returns The original listing, identity entries, and derived transition view.
 */
export async function readLifecycleView(store: Store): Promise<StoreResult<{
  listing: LifecycleIndexOutcome; entries: readonly LifecycleEntry[]; index: LifecycleIndex;
}>> {
  const outcome = await listLifecycleIndex(store);
  if (outcome.status === "refused") return outcome;
  const listing = outcome.result;
  const entries = listing.status === "complete" ? listing.index.entries() : [];
  const index = buildLifecycleIndexFromRecords(entries.map((entry) => ({ slug: entry.reference.owner.name,
    state: entry.phase, location: entry.location, cohort: entry.fields.cohort, dependsOn: entry.fields.dependsOn,
    path: lifecycleArtifactPath(entry, "meta") })));
  return { status: "ok", result: { listing, entries, index } };
}
