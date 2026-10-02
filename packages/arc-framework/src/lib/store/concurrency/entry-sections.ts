/** Section boundaries needed to keep selected entries inside their managed grammar. */
import { maskComments, type ListEntry } from "./entries.js";
import type { EntryFrame } from "./entry-frame.js";
import { relocateTextOffsets } from "./line-merge.js";

interface Section { start: number; body: number; end: number }

/** Locate a section outside opaque comments, ending at the next section or rule.
 * @param prose - Entry-free document skeleton.
 * @param name - Exact managed section name.
 * @returns Its insertion bounds, when the heading is present.
 */
export function entrySection(prose: string, name: string): Section | undefined {
  let section: Section | undefined;
  for (const line of maskComments(prose).matchAll(/[^\n]*(?:\n|$)/gu)) {
    const text = line[0].replace(/\r?\n$/u, "").trimEnd();
    if (!text.startsWith("## ") && text !== "---") continue;
    if (section !== undefined) return { ...section, end: line.index };
    if (text === `## ${name}`) section = { start: line.index, body: line.index + line[0].length, end: prose.length };
  }
  return section;
}

/** Restore only headings required by entries surviving the observed-remove merge.
 * @param prose - Independently merged surrounding text.
 * @param selected - Entries selected by identity and section.
 * @param frames - Role-ordered sources containing original heading bytes.
 * @returns Prose whose selected entries can still be rendered in their sections.
 */
export function retainEntrySections(prose: string, selected: ReadonlyMap<string, ListEntry>, frames: readonly EntryFrame[]): string {
  let result = prose;
  for (const name of new Set([...selected.values()].map((entry) => entry.section))) {
    if (entrySection(result, name) !== undefined) continue;
    const source = frames.find((frame) => entrySection(frame.skeleton, name) !== undefined);
    const section = source === undefined ? undefined : entrySection(source.skeleton, name);
    if (source === undefined || section === undefined) throw new Error(`Selected entry lacks its section: ${name}`);
    const blank = source.skeleton.slice(section.body).match(/^(?:[ \t]*\r?\n)*/u)?.[0] ?? "";
    const heading = source.skeleton.slice(section.start, section.body) + blank;
    const position = relocateTextOffsets(source.skeleton, result, [section.start])[0] ?? result.length;
    result = result.slice(0, position) + heading + result.slice(position);
  }
  return result;
}
