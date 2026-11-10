/** Slug-keyed lifecycle view and completeness evidence over identity-keyed store records. */
import type { Store } from "./contract.js";
import { listLifecycleIndex, type LifecycleIndexOutcome, type LifecycleEntry } from "./lifecycle-index.js";
import { lifecycleArtifactPath } from "./lifecycle-storage.js";
import { buildLifecycleIndexFromRecords, type LifecycleIndex } from "../work-unit/lifecycle-index.js";
import type { StoreResult } from "./refusal.js";
import { selectStandingLifecycleEntries, type StandingLifecycleSelection } from "./lifecycle-standing.js";

/** Read one view without discarding the inventory's completeness evidence.
 * @param store - Operational store.
 * @returns The original listing, identity entries, and derived transition view.
 */
export async function readLifecycleView(checkoutRoot: string, store: Pick<Store, "list">): Promise<StoreResult<{
  listing: LifecycleIndexOutcome; entries: readonly LifecycleEntry[]; index: LifecycleIndex; standing: StandingLifecycleSelection;
}>> {
  const inventory = await readLifecycleEntries(store);
  if (inventory.status === "refused") return inventory;
  const { listing, entries } = inventory.result;
  const standing = selectStandingLifecycleEntries(entries, listing.status === "complete" ? listing.diagnostics : []);
  const index = await buildLifecycleViewIndex(checkoutRoot, standing.entries);
  return { status: "ok", result: { listing, entries, index, standing } };
}

/** Read the identity inventory and its completeness evidence without resolving any checkout's artifact paths.
 * @param store - Operational store or one side of a proposed batch.
 * @returns The original listing and its identity entries, empty unless the listing is complete.
 */
export async function readLifecycleEntries(store: Pick<Store, "list">): Promise<StoreResult<{
  listing: LifecycleIndexOutcome; entries: readonly LifecycleEntry[];
}>> {
  const outcome = await listLifecycleIndex(store);
  if (outcome.status === "refused") return outcome;
  const listing = outcome.result;
  return { status: "ok", result: { listing, entries: listing.status === "complete" ? listing.index.entries() : [] } };
}

/** Build the slug-keyed transition view from an already selected set of lifecycle entries. */
export async function buildLifecycleViewIndex(checkoutRoot: string, entries: readonly LifecycleEntry[]): Promise<LifecycleIndex> {
  return buildLifecycleIndexFromRecords(await Promise.all(entries.map(async (entry) => ({ slug: entry.reference.owner.name,
    state: entry.phase, location: entry.location, cohort: entry.fields.cohort, dependsOn: entry.fields.dependsOn,
    path: await lifecycleArtifactPath(checkoutRoot, entry, "meta") }))));
}
