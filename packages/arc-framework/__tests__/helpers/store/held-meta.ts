/** A work unit's meta held in a checked store, with a checkout's marker bound to it. */
import { renderMetaFile, type MetaRenderOverrides } from "../../../src/lib/active/meta-reader.js";
import { writeWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import type { Store } from "../../../src/lib/store/contract.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { boundWorkUnitSubject } from "./bound-checkout.js";
import { createLifecycleHarness } from "./lifecycle-harness.js";

/** Hold one active work unit's meta in a checked store and bind the checkout's marker to it, as a checkout on the store
 * holds its work unit. Unset fields render as the store renders them, State defaulting to Active.
 * @param checkout - The checkout whose marker binds the work unit.
 * @param slug - The work unit's slug.
 * @param fields - The meta's fields.
 * @returns The store holding the meta.
 */
export async function holdMeta(checkout: string, slug: string, fields: MetaRenderOverrides = {}): Promise<Store> {
  const harness = createLifecycleHarness();
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: slug });
  const record = await harness.seed(recordReferences["work-item/meta"](owner),
    renderMetaFile(slug, { state: "Active", owner: "test-user", ...fields }), { kind: "active" });
  await writeWorktreeMarker(checkout, { spawnedByArc: false, createdFor: boundWorkUnitSubject(record),
    spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" });
  return harness.store;
}
