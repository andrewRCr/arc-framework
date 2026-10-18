/** Exact terminal lineage for a marker whose work-unit primary no longer exists. */
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import { parseLineageRecord } from "../store/kinds/lineage/parser.js";
import { SlugSchema } from "../kernel/index.js";

/** Read unique, unconflicted terminal authority; authoritative absence returns null. */
export async function readTerminalWorkUnitLineage(store: Store, name: string): Promise<StoreRecord | null> {
  const lookup = await store.lookup({ kind: "lineage", origin: SlugSchema.parse(name) });
  if (lookup.status === "refused") {
    if (lookup.refusal.code === "not-found") return null;
    throw new Error(`${lookup.refusal.condition} ${lookup.refusal.remedy.text} Repair the terminal subject and retry.`);
  }
  const read = await store.read({ reference: lookup.result.reference });
  if (read.status === "refused") throw new Error(`${read.refusal.condition} ${read.refusal.remedy.text}`);
  const record = read.result;
  if (record.conflicts.length > 0) throw new Error(
    `Terminal lineage for '${name}' has unresolved conflicts: ${record.conflicts.map(reference => JSON.stringify(reference)).join(", ")}. Resolve the named conflict records, then retry.`);
  const lineage = parseLineageRecord(record.content), owner = record.reference.owner;
  if (record.reference.kind !== "lineage/transition" || owner.type !== "work-item" || owner.name !== name
    || lineage === null || lineage.origin.name !== owner.name
    || (lineage.origin.uid !== undefined && lineage.origin.uid !== owner.uid)) {
    throw new Error(`Terminal lineage for '${name}' does not corroborate its work-unit identity. Repair the named lineage record, then retry.`);
  }
  return lineage.kind === "abandon" || lineage.kind === "decompose" ? record : null;
}
