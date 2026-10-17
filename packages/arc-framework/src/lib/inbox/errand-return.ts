/** Abandon and failed-open rollback share the same observed-version return plan. */
import type { Mutation } from "../store/write.js";
import { RecordVersionSchema, sameReference } from "../store/identity.js";
import { resolveEntryList, resolveWorkItemList, failure, type ResolvedEntryList } from "./lists.js";
import { rowsInList } from "./listing.js";
import { latestRoutingReceipt, listCoordinate } from "./receipts.js";
import { openErrandHolding } from "./errand-home.js";
import { prepareEntryMove } from "./mover.js";
import type { InboxContext, InboxOutcome, InboxRow } from "./types.js";
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
  const cached = destinations.get(selector);
  const resolved = cached === undefined ? await resolveEntryList(selector, context) : { status: "ok" as const, result: cached };
  if (resolved.status === "refused") return resolved;
  return returnToDestination(entry, source, resolved.result, original ? previous.section : undefined, original, context);
}

async function returnToDestination(entry: InboxRow, source: ResolvedEntryList, destination: ResolvedEntryList, previousSection: string | undefined, original: boolean, context: InboxContext): Promise<InboxOutcome<ReturnEntry>> {
  const held = rowsInList(destination);
  if (held.status === "refused") return held;
  const duplicate = held.result.find(row => row.id === entry.id);
  if (duplicate !== undefined) return failure("id-clash", `Return entry ${entry.title} (${entry.id}) clashes with ${duplicate.title} in ${destination.selector}.`, `Carry the survivor with arc route ${entry.id} --from ${destination.selector} --expected-version ${duplicate.version} --to ${source.selector}, then retry the abandon.`);
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
    version: list.saved?.version ?? RecordVersionSchema.parse("new"), formatVersion: 1, conflicts: [], fields: list.saved?.fields } };
}
