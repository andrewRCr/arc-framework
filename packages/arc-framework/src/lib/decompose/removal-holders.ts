/** Complete surviving lifecycle observations for removal admission. */
import type { Store } from "../store/contract.js";
import type { Mutation } from "../store/write.js";
import type { LifecycleEntry } from "../store/lifecycle-index.js";
import type { StoreRecord } from "../store/read.js";
import type { DecomposeResult } from "./refusal.js";
import { sameReference } from "../store/identity.js";
import { parseLifecycleMetaContent } from "../store/lifecycle-meta-content.js";
import { readLifecycleView } from "../store/lifecycle-view.js";
import { decomposeInventoryRefusal } from "./acquire-origin.js";
import { decomposeStoreRefusal } from "./refusal.js";

/** Project existing listed records through exact writes, excluding removed groups before lifecycle parsing. */
export function decomposeSurvivingStore(store: Store, writes: readonly Mutation[]): Store {
  const list: Store["list"] = async input => {
    const result = await store.list(input);
    if (result.status === "refused" || result.result.status !== "complete") return result;
    return { ...result, result: { ...result.result, records: result.result.records.flatMap(record => projectedRecord(record, writes)) } };
  };
  return new Proxy(store, { get(target, property): unknown {
    if (property === "list") return list;
    const value: unknown = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

function projectedRecord(record: StoreRecord, writes: readonly Mutation[]): StoreRecord[] {
  const write = writes.find(write => sameReference(write.reference, record.reference));
  if (write === undefined) return [record];
  if (write.action === "remove") return [];
  const parsed = record.reference.kind === "work-item/meta" ? parseLifecycleMetaContent(write.content) : undefined;
  return [{ ...record, content: write.content, fields: parsed?.success === true ? parsed.data : undefined,
    ...(write.placement === undefined ? {} : { placement: write.placement }) }];
}

/** Preserve unreadable and incomplete inventory evidence while selecting surviving open work. */
export async function acquireDecomposeSurvivingMembers(store: Store, writes: readonly Mutation[]): Promise<DecomposeResult<readonly LifecycleEntry[]>> {
  const view = await readLifecycleView(decomposeSurvivingStore(store, writes));
  if (view.status === "refused") return decomposeStoreRefusal(view.refusal);
  const incomplete = decomposeInventoryRefusal(store, view.result.listing);
  return incomplete ?? { status: "ok", result: view.result.entries.filter(entry => entry.placement.kind !== "completed") };
}
