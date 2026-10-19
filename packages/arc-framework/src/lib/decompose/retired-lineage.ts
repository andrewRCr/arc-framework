/** Lineage observations for retired provider names, including authenticated former names. */
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { WorkItemRef } from "../store/kinds/lineage/index.js";
import type { DecomposeResult } from "./refusal.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { readTerminalReferenceAliases } from "../work-unit/terminal-reference-aliases.js";

/** Find one terminal generation without treating unreadable or ambiguous history as absence. */
export async function readDecomposeRetiredLineage(store: Store, target: WorkItemRef): Promise<DecomposeResult<StoreRecord | null>> {
  const found = await store.lookup({ kind: "lineage", origin: target.uid ?? target.name });
  if (found.status === "ok") {
    const read = await store.read({ reference: found.result.reference });
    return read.status === "refused" ? decomposeStoreRefusal(read.refusal) : read;
  }
  if (found.refusal.code === "ambiguous-match") return { status: "ok", result: null };
  if (found.refusal.code !== "not-found") return decomposeStoreRefusal(found.refusal);
  const listed = await store.list({ family: "lineage", kind: "lineage/transition" });
  if (listed.status === "refused") return decomposeStoreRefusal(listed.refusal);
  const listing = listed.result;
  if (listing.status === "absent") return { status: "ok", result: null };
  if (listing.status === "unreadable") return { status: "refused", reason: "inventory-incomplete", class: "recoverable",
    locus: "lineage-inventory", message: listing.condition, remedy: listing.remedy };
  if (listing.missed || listing.diagnostics.length > 0) return { status: "refused", reason: "inventory-incomplete", class: "recoverable",
    locus: "lineage-inventory", message: "Terminal history is incomplete.", remedy: {
      text: listing.diagnostics.map(item => item.remedy.text).join("\n") || "Restore a complete lineage inventory, then retry.",
    } };
  const aliases = await readTerminalReferenceAliases(store, listing.records);
  if (aliases.status === "refused") return decomposeStoreRefusal(aliases.refusal);
  const names = aliases.result.get(target.name) ?? [];
  const matches = listing.records.filter(record => record.reference.owner.type === "work-item" && (target.uid === undefined
    ? names.includes(record.reference.owner.name) : record.reference.owner.uid === target.uid));
  return { status: "ok", result: matches.length === 1 ? matches[0] ?? null : null };
}
