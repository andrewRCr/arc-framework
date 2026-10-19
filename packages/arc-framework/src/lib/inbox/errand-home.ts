/** Shared receipt-based open-Errand holding check for start and abandon. */
import { resolveEntryList } from "./lists.js";
import { latestRoutingReceipt, type RoutingCoordinate } from "./receipts.js";
import type { InboxContext, InboxOutcome } from "./types.js";

/** A still-open Errand holds the source inbox's identity; ended homes are only reported. */
export interface EntryErrandHome { held: { slug: string; owner: string | null } | null; closed?: string }
/** Resolve an inbox entry's latest description home without treating an unrelated same-ID receipt as authority.
 * @param entryId - Identity in the named inbox.
 * @param inbox - Qualified source inbox coordinate.
 * @param context - Complete receipt and lifecycle reader.
 * @returns Open holder, previously ended home, no Errand home, or observation refusal.
 */
export async function openErrandHolding(entryId: string, inbox: RoutingCoordinate, context: InboxContext): Promise<InboxOutcome<EntryErrandHome>> {
  const latest = await latestRoutingReceipt(entryId, inbox, context);
  if (latest.status === "refused") return latest;
  const destination = latest.result?.destination;
  if (destination === undefined || ["personal", "project"].includes(destination.list)) return { status: "ok", result: { held: null } };
  const home = await resolveEntryList(destination.list, context);
  if (home.status === "refused") return home.refusal.code === "destination-refused" ? { status: "ok", result: { held: null } } : home;
  if (home.result.kind !== "work-item/description") return { status: "ok", result: { held: null } };
  return { status: "ok", result: home.result.primary?.placement?.kind === "completed" ? { held: null, closed: home.result.primary.reference.owner.name }
    : { held: { slug: home.result.primary?.reference.owner.name ?? destination.list, owner: home.result.owner } } };
}
