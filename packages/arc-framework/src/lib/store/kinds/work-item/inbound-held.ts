/** Grammar-driven observation of a work item's held inbound concerns. */
import { splitEntryList, type EntryListConfig } from "../../concurrency/entries.js";
import { recordReferences, type OwnerIdentity } from "../../identity.js";
import type { StoreView } from "../../write-check.js";
import { observeRecord, type RuleObservation } from "../rule-support.js";

/** Observe whether the proposed state holds an inbound entry.
 * @param view - Store state after the whole write or batch.
 * @param owner - Work-item generation owning the inbound list.
 * @param grammar - Declared grammar; no grammar means no held-entry obligation.
 * @returns A proved held/empty result, or unavailable observation evidence.
 */
export async function observeInboundHeld(view: StoreView, owner: OwnerIdentity, grammar?: EntryListConfig): Promise<RuleObservation<boolean>> {
  if (grammar === undefined) return { status: "known", value: false };
  const inbound = await observeRecord(view, recordReferences["work-item/inbound"](owner));
  if (inbound.status === "unavailable") return inbound;
  return { status: "known", value: inbound.status === "known"
    && splitEntryList(inbound.value.content, grammar).parts.some((part) => part.kind === "entry") };
}
