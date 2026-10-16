/** One shared write-set composer for routing, Errand adoption, return, and survivor carry. */
import { sameReference } from "../store/identity.js";
import { appendEntry, withoutEntry, entryForDestination } from "./entry-text.js";
import { listCoordinate, routingReceiptMutations } from "./receipts.js";
import type { Mutation } from "../store/write.js";
import type { ResolvedEntryList } from "./lists.js";
import type { InboxContext, InboxRow } from "./types.js";
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
 * @param _context - Clock and fresh receipt keys.
 * @returns Destination insert, observed source removal, and receipt creates.
 */
export function prepareEntryMove(input: EntryMoveInput, context: InboxContext): PreparedEntryMove {
  const { source, destination, entry } = input;
  const date = context.now().toISOString();
  const origin = source === null ? null : listCoordinate(source, entry.section);
  const home = listCoordinate(destination, input.section);
  const raw = entryForDestination(entry.raw, destination.kind, date.slice(0, 10), origin, input.preserveCreated);
  const sourceContent = source === null ? null : withoutEntry(source.saved?.content ?? "", source.kind, entry.id);
  const same = source !== null && sameReference(source.reference, destination.reference);
  const destinationContent = appendEntry(same ? sourceContent ?? "" : destination.saved?.content ?? "", input.section, raw);
  const writes: Mutation[] = [{ action: "put", reference: destination.reference, content: destinationContent, expected: destination.saved?.version ?? null }];
  if (source !== null && !same && source.saved !== null) writes.push({ action: "put", reference: source.reference, content: sourceContent ?? "", expected: source.saved.version });
  writes.push(...routingReceiptMutations(source, destination, { entryId: entry.id, source: origin, destination: home, time: date }, context));
  return { writes, entryId: entry.id, destination: home };
}
