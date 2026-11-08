/** Enumerate exact archived work-item generations without preferred-name rebinding. */
import type { Store } from "../contract.js";
import type { StoreRecord } from "../read.js";
import type { RefusedMark } from "./index-schema.js";
import { markStoreRefusal } from "./refusal-mark.js";

/** A complete archive inventory, or the repair evidence that prevents an ownership decision. */
export async function readArchivedOwners(store: Pick<Store, "list">, kind: "work-item/meta" | "work-item/record"): Promise<
  { kind: "records"; records: readonly StoreRecord[] } | { kind: "refused"; mark: RefusedMark }
> {
  const listed = await store.list({ family: "work-item", kind, filter: { locations: ["completed"] } });
  if (listed.status === "refused") return { kind: "refused", mark: markStoreRefusal(listed.refusal) };
  const result = listed.result;
  if (result.status === "unreadable") return { kind: "refused", mark: { reason: result.condition, remedy: result.remedy } };
  if (result.status === "absent") return { kind: "records", records: [] };
  if (result.missed || result.diagnostics.length > 0) {
    const first = result.diagnostics[0];
    return { kind: "refused", mark: first === undefined ? {
      reason: "The archived work-item inventory is incomplete.",
      remedy: { text: "Restore the missing archive inventory, then retry adoption." },
    } : { reason: first.condition, remedy: first.remedy } };
  }
  return { kind: "records", records: result.records };
}
