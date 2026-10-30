/** Lineage observations for retired provider names, including authenticated former names. */
import type { Store } from "./contract.js";
import type { StoreRecord } from "./read.js";
import type { WorkItemRef } from "./kinds/lineage/index.js";
import type { StoreResult } from "./refusal.js";

/** Find one terminal generation without treating unreadable or ambiguous history as absence. */
export async function readRetiredLineage(store: Store, target: WorkItemRef): Promise<StoreResult<StoreRecord | null>> {
  const found = await store.lookup({ kind: "lineage", origin: target.uid ?? target.name });
  if (found.status === "ok") {
    const read = await store.read({ reference: found.result.reference });
    return read;
  }
  return found.refusal.code === "not-found" || found.refusal.code === "ambiguous-match"
    ? { status: "ok", result: null } : { status: "refused", refusal: found.refusal };
}
