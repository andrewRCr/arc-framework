/** Complete store-backed context and version bases for current-work-unit reconciliation. */
import { SlugSchema } from "../kernel/index.js";
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { StoreResult } from "../store/refusal.js";
import { readLifecycleView } from "../store/lifecycle-view.js";
import { requireCompleteInventory } from "../store/lifecycle-storage.js";
import { lifecycleRecordPath } from "../store/lifecycle-record-path.js";
import { acquireLifecycleRecords } from "./prepared-lifecycle-write.js";
import type { CurrentWuReconcilePrepareContext } from "./side-effects/discharge-dep-edges.js";
import { validateTransitionRecordEnumeration, type TransitionRecordEnumerationResult } from "./transition-record-enumeration.js";
import { queryTransitionDisposition } from "./transition-disposition-query.js";
/** Every reported artifact path resolves only through its already-acquired record. */
export interface StoreReconcilePreparation { context: CurrentWuReconcilePrepareContext; records: readonly StoreRecord[]; byPath: ReadonlyMap<string, StoreRecord> }
/** Acquire complete lifecycle, lineage, and artifact evidence before planning edits. */
export async function createStoreReconcilePrepareContext(store: Store, slug: string): Promise<StoreResult<StoreReconcilePreparation>> {
  const view = await readLifecycleView(store);
  if (view.status === "refused") return view;
  requireCompleteInventory(store, view.result.listing);
  const acquired = await acquireLifecycleRecords(store, slug);
  if (acquired.status === "refused") return acquired;
  const primary = acquired.result.find((record) => record.reference.kind === "work-item/meta");
  if (primary === undefined) throw new Error("The acquired work-unit group lacks its primary");
  const byPath = new Map<string, StoreRecord>();
  for (const record of acquired.result) {
    const path = lifecycleRecordPath(primary, record);
    if (path !== null) byPath.set(path, record);
  }
  const lineage = await storeLineageEnumeration(store);
  if (lineage.status === "refused") return lineage;
  return { status: "ok", result: { records: acquired.result, byPath, context: {
    index: view.result.index,
    enumerateTransitionRecords: () => Promise.resolve(lineage.result),
    queryDisposition: async (input) => {
      const lookup = await store.lookup({ kind: "slug", slug: SlugSchema.parse(input.origin) });
      if (lookup.status === "ok" && lookup.result.reference.owner.name !== input.origin) {
        return { status: "unique", disposition: { kind: "retarget", targetSlug: lookup.result.reference.owner.name } };
      }
      if (lookup.status === "refused" && lookup.refusal.code !== "not-found") return { status: "namespace-corrupt" };
      return queryTransitionDisposition(lineage.result, input);
    },
    listArtifactPaths: () => Promise.resolve([...byPath.keys()]),
    readFile: (path) => {
      const record = byPath.get(path);
      if (record === undefined) throw new Error(`Artifact ${path} was not acquired`);
      return Promise.resolve(record.content);
    },
  } } };
}
async function storeLineageEnumeration(store: Store): Promise<StoreResult<TransitionRecordEnumerationResult>> {
  const listing = await store.list({ family: "lineage", kind: "lineage/transition" });
  if (listing.status === "refused") return listing;
  if (listing.result.status === "absent") return { status: "ok", result: { status: "valid", groups: [] } };
  if (listing.result.status !== "complete" || listing.result.missed || listing.result.diagnostics.length > 0) {
    return { status: "ok", result: { status: "namespace-corrupt" } };
  }
  return { status: "ok", result: validateTransitionRecordEnumeration(listing.result.records.map((record) => ({
    filename: `${record.reference.owner.name}.json`, mode: "100644", type: "blob", content: Buffer.from(record.content),
  }))) };
}
