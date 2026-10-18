/** Abandon and failed-open rollback share the same observed-version return plan. */
import type { Mutation } from "../store/write.js";
import { RecordVersionSchema, sameReference } from "../store/identity.js";
import { resolveEntryList, resolveWorkItemList, failure, type ResolvedEntryList } from "./lists.js";
import { rowsInList } from "./listing.js";
import { latestRoutingReceipt, listCoordinate, sameRoutingList } from "./receipts.js";
import { openErrandHolding } from "./errand-home.js";
import { prepareEntryMove } from "./mover.js";
import type { InboxContext, InboxOutcome, InboxRow } from "./types.js";
import { entryConflictRefusal } from "./conflicts.js";
/** Returned descriptions retain entries held by another open Errand. */
export interface ErrandReturn { writes: Mutation[]; disposition: "retained" | "absent"; returned: string[]; held: { id: string; errand: string }[] }
/** Compose every description return at observed record versions without writing.
 * @param slug - Errand whose entries return.
 * @param context - Abandoner's identity and clock.
 * @returns One companion batch, including receipts and remaining description.
 */
export async function prepareErrandReturn(slug: string, context: InboxContext): Promise<InboxOutcome<ErrandReturn>> {
  const found = await resolveWorkItemList(slug, context);
  if (found.status === "refused") return found;
  if (found.result.kind !== "work-item/description") return failure("invalid-input", `${slug} is not an Errand.`, "Name the Errand to abandon.");
  const conflict = await entryConflictRefusal(found.result, undefined, context);
  if (conflict !== null) return conflict;
  if (found.result.primary?.placement?.kind === "completed") return { status: "ok", result: { writes: [], disposition: "absent", returned: [], held: [] } };
  let source = found.result;
  const entries = rowsInList(source);
  if (entries.status === "refused") return entries;
  const result: ErrandReturn = { writes: [], disposition: "absent", returned: [], held: [] };
  const destinations = new Map<string, ResolvedEntryList>();
  for (const entry of entries.result) {
    const prepared = await prepareReturnEntry(entry, source, destinations, context);
    if (prepared.status === "refused") return prepared;
    if (prepared.result.kind === "held") { result.held.push({ id: entry.id, errand: prepared.result.errand }); continue; }
    const { destination, writes } = prepared.result;
    for (const write of writes) mergeWrite(result.writes, write);
    destinations.set(destination.selector, overlay(destination, writes));
    source = overlay(source, writes);
    result.returned.push(entry.id);
  }
  result.disposition = result.returned.length ? "retained" : "absent";
  return { status: "ok", result };
}

type ReturnEntry = { kind: "held"; errand: string } | { kind: "move"; destination: ResolvedEntryList; writes: Mutation[] };
async function prepareReturnEntry(entry: InboxRow, source: ResolvedEntryList, destinations: ReadonlyMap<string, ResolvedEntryList>, context: InboxContext): Promise<InboxOutcome<ReturnEntry>> {
  const latest = await latestRoutingReceipt(entry.id, listCoordinate(source), context);
  if (latest.status === "refused") return latest;
  const origin = latest.result?.source;
  const holdingScope = origin !== null && origin !== undefined && ["personal", "project"].includes(origin.list) ? origin : listCoordinate(source);
  const holder = await openErrandHolding(entry.id, holdingScope, context);
  if (holder.status === "refused") return holder;
  if (holder.result.held !== null && holder.result.held.slug !== source.primary?.reference.owner.name) return { status: "ok", result: { kind: "held", errand: holder.result.held.slug } };
  const previous = latest.result?.source;
  const original = previous?.list === "project" || (previous?.list === "personal" && previous.identity === context.identity);
  const selector = original ? previous.list : "personal";
  const resolved = await resolveEntryList(selector, context);
  if (resolved.status === "refused") return resolved;
  const conflict = await entryConflictRefusal(resolved.result, entry.id, context);
  if (conflict !== null) return conflict;
  const destination = destinations.get(selector) ?? resolved.result;
  return returnToDestination(entry, source, destination, original ? previous.section : undefined, original, context);
}

async function returnToDestination(entry: InboxRow, source: ResolvedEntryList, destination: ResolvedEntryList, previousSection: string | undefined, original: boolean, context: InboxContext): Promise<InboxOutcome<ReturnEntry>> {
  const held = rowsInList(destination);
  if (held.status === "refused") return held;
  const duplicate = held.result.find(row => row.id === entry.id);
  if (duplicate !== undefined) {
    const receipt = await latestRoutingReceipt(entry.id, listCoordinate(destination), context);
    if (receipt.status === "refused") return receipt;
    const survivor = sameRoutingList(receipt.result?.source ?? null, listCoordinate(destination))
      && sameRoutingList(receipt.result?.destination ?? null, listCoordinate(source));
    const remedy = survivor
      ? `Carry the survivor with arc route ${entry.id} --from ${destination.selector} --expected-version ${duplicate.version} --to ${listCoordinate(source).list}, then retry the abandon.`
      : `Insert a copy of the inbox entry without _Id:_ to stamp a fresh identity, then remove its original ID ${duplicate.id} at listed version ${duplicate.version} from ${destination.selector}; retry the abandon.`;
    return failure("id-clash", `Return entry ${entry.title} (${entry.id}) clashes with ${duplicate.title} in ${destination.selector}.`, remedy);
  }
  const section = previousSection ?? (destination.inbox === "project" ? "Inbox" : "Errand");
  const prepared = await prepareEntryMove({ source, destination, entry, section, preserveCreated: original }, context);
  return prepared.status === "refused" ? prepared : { status: "ok", result: { kind: "move", destination, writes: prepared.result.writes } };
}

function mergeWrite(writes: Mutation[], write: Mutation): void {
  const index = writes.findIndex(prior => sameReference(prior.reference, write.reference));
  if (index < 0) writes.push(write);
  else if (write.action === "put") writes[index] = { ...write, expected: writes[index]?.expected ?? null };
}
function overlay(list: ResolvedEntryList, writes: readonly Mutation[]): ResolvedEntryList {
  const write = writes.find(value => value.action === "put" && sameReference(value.reference, list.reference));
  return write?.action !== "put" ? list : { ...list, saved: { ...list.saved, reference: list.reference, content: write.content,
    version: list.saved?.version ?? RecordVersionSchema.parse("new"), formatVersion: 1, conflicts: list.saved?.conflicts ?? [], fields: list.saved?.fields } };
}
