/** Lineage observations for retired provider names, including authenticated former names. */
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { WorkItemRef } from "../store/kinds/lineage/index.js";
import type { DecomposeResult } from "./refusal.js";
import { decomposeStoreRefusal } from "./refusal.js";

/** Find one terminal generation without treating unreadable or ambiguous history as absence. */
export async function readDecomposeRetiredLineage(store: Store, target: WorkItemRef): Promise<DecomposeResult<StoreRecord | null>> {
  const found = await store.lookup({ kind: "lineage", origin: target.uid ?? target.name });
  if (found.status === "ok") {
    const read = await store.read({ reference: found.result.reference });
    return read.status === "refused" ? decomposeStoreRefusal(read.refusal) : read;
  }
  return found.refusal.code === "not-found" || found.refusal.code === "ambiguous-match"
    ? { status: "ok", result: null } : decomposeStoreRefusal(found.refusal);
}
