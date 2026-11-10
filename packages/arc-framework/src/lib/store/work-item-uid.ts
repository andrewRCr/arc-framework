/** Exact owner generation selection over caller-selected primary listings. */
import { z } from "zod";
import { familyOf } from "./catalog.js";
import type { Store } from "./contract.js";
import type { ListingOutcome, StoreRecord } from "./read.js";
import type { Remedy, StoreResult } from "./refusal.js";

/** Selection retains failed completeness evidence for each caller's refusal policy. */
export type WorkItemUidSelection = StoreResult<StoreRecord | null> | {
  status: "incomplete"; condition: string; remedy: Remedy; observation: ListingOutcome;
};

/** Primary records that may carry an independently selected owner generation. */
export type UidPrimaryKind = "work-item/meta" | "work-item/record" | "cohort/document";

/** Read one exact primary generation, preserving its kind and refusing multiple matches. */
export async function readWorkItemByUid(store: Store, operand: string,
  kinds: readonly UidPrimaryKind[] = ["work-item/meta", "work-item/record"]): Promise<WorkItemUidSelection> {
  const uid = z.uuid().parse(operand).toLowerCase(), records: StoreRecord[] = [];
  for (const kind of kinds) {
    const listed = await store.list({ family: familyOf(kind), kind });
    if (listed.status === "refused") return listed;
    const value = listed.result;
    if (value.status === "unreadable") return { status: "incomplete", condition: value.condition, remedy: value.remedy, observation: value };
    if (value.status === "complete") {
      if (value.missed || value.diagnostics.length > 0) return { status: "incomplete", observation: value,
        condition: "UID lookup has incomplete evidence.", remedy: listingRepair(value) };
      records.push(...value.records.filter(record => record.reference.owner.type !== "person" && record.reference.owner.uid === uid));
    }
  }
  if (records.length > 1) return { status: "refused", refusal: { code: "ambiguous-match", class: "recoverable",
    candidates: records.map(record => record.reference),
    condition: `UID ${uid} selects several owners: ${records.map(record => `${record.reference.kind} ${record.reference.owner.name}`).join(", ")}.`,
    remedy: { text: "List the owner generations and use the intended UID." } } };
  return { status: "ok", result: records[0] ?? null };
}

function listingRepair(listing: Extract<ListingOutcome, { status: "complete" }>): Remedy {
  const repairs = listing.diagnostics.map(diagnostic => diagnostic.remedy);
  const single = repairs[0];
  if (repairs.length === 1 && single !== undefined) return single;
  return { text: repairs.length > 0 ? repairs.map(repair => repair.text).join(" ") : "Repair the listed diagnostics, then retry." };
}
