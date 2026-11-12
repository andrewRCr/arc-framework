/** Lossless existing-entry edits and canonical newly inserted list fragments. */
import { maskComments, rejoinEntryList, splitEntryList } from "../store/concurrency/entries.js";
import { ENTRY_CONFIGS, type EntryKind } from "../store/kinds/entry-configs.js";
import { ENTRY_FIELDS, matchInboxEntryTitle, writeEntryFields, writeRoutedFrom } from "../store/kinds/entry-fields.js";
import type { RoutingCoordinate } from "./receipts.js";

/** Apply the destination's field rules while retaining every unowned prose descriptor.
 * @param raw - Existing entry bytes.
 * @param kind - Destination grammar.
 * @param date - Date entering the destination.
 * @param source - List and section left, null on insertion.
 * @param preserveCreated - A return to its original inbox keeps the entry's date.
 * @returns Entry bytes ready for insertion.
 */
export function entryForDestination(raw: string, kind: EntryKind, date: string, source: RoutingCoordinate | null, preserveCreated = false): string {
  const admitted: readonly string[] = ["Id", ...ENTRY_CONFIGS[kind].managedFields];
  const changes = Object.fromEntries(ENTRY_FIELDS.filter((field) => !admitted.includes(field) || field === "Cites").map((field) => [field, undefined])) as Record<string, string | undefined>;
  if (kind !== "work-item/description" && !preserveCreated) changes.Created = date;
  const rewritten = writeEntryFields(writeRoutedFrom(entryHeadingForDestination(raw, kind)), changes);
  const origin = kind === "work-item/inbound" && source !== null ? describeOrigin(source) : undefined;
  return writeRoutedFrom(rewritten, origin);
}

/** Adapt a moved heading to the destination grammar, retaining any checkbox and remaining bytes.
 * @param raw - Admitted source entry.
 * @param kind - Destination grammar.
 * @returns Personal captures use bold titles; other destinations retain their heading.
 */
export function entryHeadingForDestination(raw: string, kind: EntryKind): string {
  const visible = maskComments(raw).split("\n")[0] ?? "";
  if (kind !== "personal/inbox" || matchInboxEntryTitle(visible) !== null) return raw;
  const prefix = /^###[ \t]+(?:`?\[[ xX]\]`?[ \t]+)?/u.exec(visible)?.[0];
  if (prefix === undefined) return raw;
  const end = visible.trimEnd().length;
  return `${raw.slice(0, prefix.length)}**${raw.slice(prefix.length, end)}**${raw.slice(end)}`;
}

function describeOrigin(source: RoutingCoordinate): string {
  return `${source.list}${source.list === "personal" ? ` (${source.identity ?? "unknown"})` : ""}${source.section === undefined ? "" : ` \u00a7 ${source.section}`}`;
}

/** Remove exactly one identity-bearing entry from the caller's observed document.
 * @param content - Observed complete list.
 * @param kind - Its declared grammar.
 * @param id - Entry identity.
 * @returns Remaining original bytes.
 */
export function withoutEntry(content: string, kind: EntryKind, id: string): string {
  const split = splitEntryList(content, ENTRY_CONFIGS[kind]);
  return rejoinEntryList({ parts: split.parts.filter((part) => part.kind !== "entry" || part.id !== id) });
}
/** Insert an entry in the explicitly selected section, preserving every existing byte.
 * @param content - Destination list, empty for a newly created list.
 * @param section - Declared section name.
 * @param raw - Entry bytes without surrounding separators.
 * @returns List with the new entry at its section's end.
 */
export function appendEntry(content: string, section: string, raw: string): string {
  const visible = [...maskComments(content).matchAll(/[^\n]*(?:\n|$)/gu)].filter((line) => line[0].length > 0);
  const header = visible.findIndex((line) => line[0].trimEnd() === `## ${section}`);
  if (header < 0) return `${separate(content)}## ${section}\n\n${raw}\n`;
  const boundary = visible.slice(header + 1).find((line) => /^## |^---\s*$/u.test(line[0].trimEnd()));
  const position = boundary?.index ?? content.length;
  return `${separate(content.slice(0, position))}${raw}\n\n${content.slice(position)}`;
}

function separate(content: string): string { return content.length === 0 || content.endsWith("\n\n") ? content : `${content}${content.endsWith("\n") ? "\n" : "\n\n"}`; }
