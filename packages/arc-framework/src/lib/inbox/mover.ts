/** One shared write-set composer for routing, Errand adoption, return, and survivor carry. */
import { sameReference } from "../store/identity.js";
import { appendEntry, withoutEntry, entryForDestination } from "./entry-text.js";
import { listCoordinate, readRoutingReceipts, routingReceiptMutations, sameRoutingList } from "./receipts.js";
import type { Mutation } from "../store/write.js";
import type { ResolvedEntryList } from "./lists.js";
import type { InboxContext, InboxOutcome, InboxRow } from "./types.js";
import type { RoutingCoordinate } from "./receipts.js";

/** A move's exact source basis and selected destination section. */
export interface EntryMoveInput {
  source: ResolvedEntryList | null;
  destination: ResolvedEntryList;
  entry: Pick<InboxRow, "id" | "raw" | "section">;
  section: string;
  preserveCreated?: boolean;
}
/** Companion writes join the caller's primary operation in one atomic batch. */
export interface PreparedEntryMove { writes: Mutation[]; entryId: string; destination: RoutingCoordinate; carried?: "replaced" | "cited" }
/** Compose a move without performing any write.
 * @param input - Resolved records at their observed versions.
 * @param context - Complete receipt reader, clock and fresh receipt keys.
 * @returns Atomic write plan or a receipt-authority refusal.
 */
export async function prepareEntryMove(input: EntryMoveInput, context: InboxContext): Promise<InboxOutcome<PreparedEntryMove>> {
  const { source, destination, entry } = input;
  const receipts = await readRoutingReceipts(context);
  if (receipts.status === "refused") return receipts;
  const now = context.now(), date = now.toISOString();
  const origin = source === null ? null : listCoordinate(source, entry.section);
  const home = listCoordinate(destination, input.section);
  const time = receipts.result.filter(receipt => receipt.entryId === entry.id && [receipt.source, receipt.destination].some(coordinate =>
    sameRoutingList(coordinate, home) || (origin !== null && sameRoutingList(coordinate, origin))))
    .reduce((latest, receipt) => Math.max(latest, Date.parse(receipt.time) + 1), now.getTime());
  const raw = entryForDestination(entry.raw, destination.kind, date.slice(0, 10), origin, input.preserveCreated);
  const sourceContent = source === null ? null : withoutEntry(source.saved?.content ?? "", source.kind, entry.id);
  const same = source !== null && sameReference(source.reference, destination.reference);
  const destinationContent = appendEntry(same ? sourceContent ?? "" : destination.saved?.content ?? "", input.section, raw);
  const writes: Mutation[] = [{ action: "put", reference: destination.reference, content: destinationContent, expected: destination.saved?.version ?? null }];
  if (source !== null && !same && source.saved !== null) writes.push({ action: "put", reference: source.reference, content: sourceContent ?? "", expected: source.saved.version });
  writes.push(...routingReceiptMutations(source, destination, { entryId: entry.id, source: origin, destination: home, time: new Date(time).toISOString() }, context));
  return { status: "ok", result: { writes, entryId: entry.id, destination: home } };
}
