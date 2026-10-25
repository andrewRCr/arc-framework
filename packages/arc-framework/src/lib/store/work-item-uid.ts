/** Exact work-item generation selection over complete primary listings. */
import { z } from "zod";
import type { Store } from "./contract.js";
import type { ListingOutcome, StoreRecord } from "./read.js";
import type { Remedy, StoreResult } from "./refusal.js";

/** Selection retains failed completeness evidence for each caller's refusal policy. */
export type WorkItemUidSelection = StoreResult<StoreRecord | null> | {
  status: "incomplete"; condition: string; remedy: Remedy; observation: ListingOutcome;
};

/** Read one exact primary generation, preserving its kind and refusing multiple matches. */
export async function readWorkItemByUid(store: Store, operand: string): Promise<WorkItemUidSelection> {
  const uid = z.uuid().parse(operand).toLowerCase(), records: StoreRecord[] = [];
  for (const kind of ["work-item/meta", "work-item/record"] as const) {
    const listed = await store.list({ family: "work-item", kind });
    if (listed.status === "refused") return listed;
    const value = listed.result;
    if (value.status === "unreadable") return { status: "incomplete", condition: value.condition, remedy: value.remedy, observation: value };
    if (value.status === "complete") {
      if (value.missed || value.diagnostics.length > 0) return { status: "incomplete", observation: value,
        condition: "Work-item UID lookup has incomplete evidence.", remedy: { text: "Repair the listed work-item diagnostics, then retry." } };
      records.push(...value.records.filter(record => record.reference.owner.type === "work-item" && record.reference.owner.uid === uid));
    }
  }
  if (records.length > 1) return { status: "refused", refusal: { code: "ambiguous-match", class: "recoverable",
    candidates: records.map(record => record.reference), condition: `UID ${uid} does not select exactly one work item.`,
    remedy: { text: "List the work-item generations and use the intended UID." } } };
  return { status: "ok", result: records[0] ?? null };
}
