/** Version-bound acquisition of an origin and its decomposition inputs through the store. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeResult, DecomposeRefusal } from "./refusal.js";
import type { StoreRecord } from "../store/read.js";
import type { LifecycleEntry } from "../store/lifecycle-index.js";
import { posix } from "node:path";
import { readWorkUnit } from "../store/lifecycle-write.js";
import { acquireLifecycleRecords } from "../work-unit/prepared-lifecycle-write.js";
import { readLifecycleView } from "../store/lifecycle-view.js";
import { recordReferences, sameReference } from "../store/identity.js";
import { lifecycleRecordPath } from "../store/lifecycle-record-path.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { requireCompleteInventory } from "../store/lifecycle-storage.js";
import { ArcError } from "../kernel/errors.js";
import type { Store } from "../store/contract.js";
import type { LifecycleIndexOutcome } from "../store/lifecycle-index.js";

/** Inputs retained for pure derivation and later prepared-write revalidation. */
export interface DecomposeOriginRecords {
  primary: StoreRecord;
  records: readonly StoreRecord[];
  artifacts: readonly { basename: string; record: StoreRecord }[];
  lifecycleEntries: readonly LifecycleEntry[];
  incomingCandidates: readonly LifecycleEntry[];
  storedMap?: StoreRecord;
}

/** Acquire the complete origin without using Git or applying start-only guards. */
export async function acquireDecomposeOrigin(ctx: DecomposeContext, slug: string,
  excludedOwnerUids: ReadonlySet<string> = new Set()): Promise<DecomposeResult<DecomposeOriginRecords>> {
  const store = ctx.executor.store;
  const selected = await readWorkUnit(store, slug);
  if (selected.status === "refused") return decomposeStoreRefusal(selected.refusal);
  const group = await acquireLifecycleRecords(store, selected.result.reference.owner.name);
  if (group.status === "refused") return decomposeStoreRefusal(group.refusal);
  const primary = group.result.find(record => sameReference(record.reference, selected.result.reference));
  if (primary === undefined) return { status: "refused", reason: "source-artifact", class: "recoverable",
    locus: slug, remedy: { text: "Restore the origin's primary record, then retry." } };
  const view = await readLifecycleView(store);
  if (view.status === "refused") return decomposeStoreRefusal(view.refusal);
  const incomplete = inventoryRefusal(store, view.result.listing);
  if (incomplete !== undefined) return incomplete;
  const map = await store.read({ reference: recordReferences["work-item/cut-map"](primary.reference.owner) });
  if (map.status === "refused" && map.refusal.code !== "not-found") return decomposeStoreRefusal(map.refusal);
  const artifacts = group.result.flatMap(record => {
    if (record.reference.kind === "work-item/meta") return [];
    const path = lifecycleRecordPath(primary, record);
    return path === null ? [] : [{ basename: posix.basename(path), record }];
  });
  return { status: "ok", result: { primary, records: group.result, artifacts, lifecycleEntries: view.result.entries,
    incomingCandidates: view.result.entries.filter(entry => entry.reference.owner.type === "person"
      || entry.reference.owner.uid === undefined || !excludedOwnerUids.has(entry.reference.owner.uid)),
    ...(map.status === "ok" ? { storedMap: map.result } : {}) } };
}

function inventoryRefusal(store: Store, listing: LifecycleIndexOutcome): DecomposeRefusal | undefined {
  try { requireCompleteInventory(store, listing); }
  catch (error) {
    if (!(error instanceof ArcError)
      || (error.code !== "store.lifecycle-incomplete" && error.code !== "store.lifecycle-unreadable")) throw error;
    const remedies = listing.status === "unreadable" ? [listing.remedy]
      : listing.status === "complete" ? listing.diagnostics.map(item => item.remedy) : [];
    return { status: "refused", reason: "inventory-incomplete", class: "recoverable", locus: "lifecycle-inventory",
      message: error.message, remedy: remedies.length === 1 && remedies[0] !== undefined ? remedies[0]
        : { text: remedies.length === 0 ? error.message : remedies.map(remedy => remedy.text).join("\n") } };
  }
  return undefined;
}
