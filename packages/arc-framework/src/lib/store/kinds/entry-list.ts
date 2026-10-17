/** Production entry-list parsing, preserving unknown descriptors and surrounding bytes. */
import { maskComments, rejoinEntryList, splitEntryList, type ListEntry, type SplitEntryList } from "../concurrency/entries.js";
import { ENTRY_CONFIGS, type EntryKind } from "./entry-configs.js";
import { entryVersion, matchInboxEntryTitle, readEntryField, readRemovalTrigger, validEntryFieldValue } from "./entry-fields.js";

/** A split entry with only its kind's admitted fields decoded. */
export interface ParsedListEntry extends ListEntry {
  title: string;
  fields: Readonly<Record<string, string>>;
  version: string;
}
/** Full lossless document plus its interpreted entry rows. */
export interface ParsedEntryList extends SplitEntryList { entries: readonly ParsedListEntry[] }
type ParseResult = { success: true; data: ParsedEntryList } | { success: false; error: string };

/** Parse a kind's document; malformed memory headers are rejected before splitting.
 * @param content - Entire document.
 * @param kind - Owning kind.
 * @returns Lossless parts and decoded rows, or a diagnostic.
 */
export function parseEntryList(content: string, kind: EntryKind): ParseResult {
  const config = ENTRY_CONFIGS[kind];
  const headerError = config.shape === "field-header" ? memoryHeaderError(content) : undefined;
  if (headerError !== undefined) return { success: false, error: headerError };
  const split = splitEntryList(content, config);
  const entries: ParsedListEntry[] = [];
  for (const part of split.parts) {
    if (part.kind !== "entry") continue;
    const parsed = parseEntry(part, kind);
    if (typeof parsed === "string") return { success: false, error: parsed };
    entries.push(parsed);
  }
  return { success: true, data: { ...split, entries } };
}
/** Round-trip a parsed document without dropping unrecognized descriptors or outside bytes.
 * @param document - Lossless production parser result.
 * @returns Original document text.
 */
export function writeEntryList(document: ParsedEntryList): string { return rejoinEntryList(document); }

function parseEntry(part: ListEntry, kind: EntryKind): ParsedListEntry | string {
  const config = ENTRY_CONFIGS[kind];
  const visible = maskComments(part.bytes);
  const heading = visible.split("\n")[0] ?? "";
  const title = config.shape === "heading" ? matchInboxEntryTitle(heading) : heading.trim();
  // Project captures historically admit any H3 heading; personal captures retain their bold-title contract.
  if (title === null && kind === "personal/inbox") return `${part.section} entry missing bold title: ${heading}`;
  const fields: Record<string, string> = {};
  for (const field of ["Id", ...config.managedFields]) {
    const value = field === "Remove when" ? readRemovalTrigger(visible) : readEntryField(visible, field);
    if (value !== undefined) {
      if (!validEntryFieldValue(field, value)) return `Invalid ${field} entry value: ${value}`;
      fields[field] = value;
    }
  }
  if (config.shape === "field-header" && fields["Remove when"] === undefined) return `Entry missing '_Remove when:_' trigger: ${title}`;
  return { ...part, title: title ?? heading.replace(/^###\s*/u, ""), fields, version: entryVersion(part) };
}

function memoryHeaderError(content: string): string | undefined {
  const lines = maskComments(content).split(/\r?\n/u);
  let inMemories = false;
  for (const [index, line] of lines.entries()) {
    const boundary = line.trimEnd();
    if (boundary.startsWith("## ") || boundary === "---") inMemories = boundary === "## Memories";
    if (!inMemories || !/^\s*[_*]Remove when:/u.test(line)) continue;
    const previous = previousNonBlank(lines, index);
    if (!/^\*\*.+:\*\*\s*$/u.test(lines[previous] ?? "")) {
      return `Line ${previous + 1}: ${lines[previous] ?? ""}; removal triggers require a one-line **Title:** header.`;
    }
  }
  return undefined;
}

function previousNonBlank(lines: readonly string[], index: number): number {
  let previous = index - 1;
  while (previous >= 0 && lines[previous]?.trim() === "") previous--;
  return previous;
}
