/** Carry raced source prose without overwriting the destination's managed routing context. */
import { ENTRY_FIELDS, drawEntryId, writeEntryFields, writeRoutedFrom } from "../store/kinds/entry-fields.js";
import { ENTRY_CONFIGS } from "../store/kinds/entry-configs.js";
import { rejoinEntryList, splitEntryList } from "../store/concurrency/entries.js";
import { appendEntry, entryForDestination, entryHeadingForDestination } from "./entry-text.js";
import { mayReplaceEntry } from "./admission.js";
import { prepareEntryMove, type EntryMoveInput, type PreparedEntryMove } from "./mover.js";
import { listCoordinate } from "./receipts.js";
import type { InboxContext, InboxOutcome, InboxRow } from "./types.js";
import { entryConflictRefusal } from "./conflicts.js";

/** Preserve the observed source removal and receipts while replacing or citing its held home.
 * @param input - Source entry and its proven existing destination.
 * @param held - Existing entry sharing the source's identity.
 * @param context - Router identity, clock and randomness.
 * @returns One atomic survivor carry.
 */
export async function prepareSurvivorCarry(input: EntryMoveInput, held: InboxRow, context: InboxContext): Promise<InboxOutcome<PreparedEntryMove>> {
  const now = context.now();
  const prepared = await prepareEntryMove(input, { ...context, now: () => now });
  if (prepared.status === "refused") return prepared;
  const plan = prepared.result;
  const destination = input.destination;
  const replaces = mayReplaceEntry(destination, context.identity);
  const carried = replaces ? "replaced" : "cited";
  const id = replaces ? held.id : drawEntryId(new Set(splitEntryList(destination.saved?.content ?? "", ENTRY_CONFIGS[destination.kind]).parts.flatMap((part) => part.kind === "entry" && part.id !== undefined ? [part.id] : [])), context.random ?? Math.random);
  const conflict = await entryConflictRefusal(destination, id, context);
  if (conflict !== null) return conflict;
  const raw = replaces ? replacementProse(entryHeadingForDestination(input.entry.raw, destination.kind), held)
    : writeEntryFields(entryForDestination(input.entry.raw, destination.kind, now.toISOString().slice(0, 10), input.source === null ? null : listCoordinate(input.source, input.entry.section)), { Id: id, Cites: held.id });
  const content = replaces ? replaceEntry(destination.saved?.content ?? "", destination.kind, held.id, raw)
    : appendEntry(destination.saved?.content ?? "", input.section, raw);
  return { status: "ok", result: { ...plan, entryId: id, carried, writes: plan.writes.map((write, index) => index === 0 && write.action === "put" ? { ...write, content } : write) } };
}

function replacementProse(raw: string, held: InboxRow): string {
  const changes = Object.fromEntries(ENTRY_FIELDS.map((field) => [field, undefined]));
  const prose = writeRoutedFrom(writeEntryFields(raw, changes));
  const replacement = writeEntryFields(prose, held.fields);
  const origin = held.raw.split("\n").find((line) => line.startsWith("- _Routed from:_"));
  return origin === undefined ? replacement : replacement.replace(/^(- _Id:_.*)$/mu, `$1\n${origin}`);
}

function replaceEntry(content: string, kind: EntryMoveInput["destination"]["kind"], id: string, raw: string): string {
  const split = splitEntryList(content, ENTRY_CONFIGS[kind]);
  return rejoinEntryList({ parts: split.parts.map((part) => part.kind === "entry" && part.id === id ? { ...part, bytes: raw } : part) });
}
