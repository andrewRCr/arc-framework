/** Restore malformed entries from the selected base while retaining independent raw edits. */
import { splitEntryList, type EntryListConfig, type ListEntry } from "../concurrency/entries.js";
import { entrySection, retainEntrySections } from "../concurrency/entry-sections.js";
import { entryFrame } from "../concurrency/entry-frame.js";
import { orderEntries } from "../concurrency/entry-order.js";
import { scanMarkers, type MalformedMarkerSpan } from "./marker-scan.js";

interface EntrySpan { start: number; end: number; entry: ListEntry }
/** A malformed raw range and the stable entry identity whose edit it withholds. */
export interface RefusedEntrySpan { start: number; end: number; id: string | undefined }

/** Locate an enclosing or immediately following entry using an offset-preserving recognition view. */
export function malformedEntries(content: string, grammar: EntryListConfig, malformed: readonly MalformedMarkerSpan[],
  controls: readonly { start: number; end: number }[], identities: ReadonlyMap<number, string>): RefusedEntrySpan[] | null {
  let view = content;
  for (const control of [...controls].sort((a, b) => b.start - a.start)) {
    view = view.slice(0, control.start) + view.slice(control.start, control.end).replace(/[^\n]/gu, " ") + view.slice(control.end);
  }
  const entries = entrySpans(view, grammar);
  const ranges: RefusedEntrySpan[] = [];
  for (const span of malformed) {
    const id = identities.get(span.start);
    const after = entries.find(entry => entry.start >= span.start);
    const enclosing = entries.find(entry => entry.start <= span.start && entry.start + entry.entry.bytes.length > span.start);
    const target = id === undefined ? enclosing ?? after : entries.find(entry => entry.entry.id === id);
    if (target === undefined) return null;
    const identity = id ?? target.entry.id;
    const first = identity === undefined ? target : entries.find(entry => entry.entry.id === identity) ?? target;
    const next = entries.find(entry => entry.start > first.start && (span.complete ? entry.start >= span.end
      : identity === undefined || entry.entry.id !== identity));
    const section = entrySection(view, first.entry.section);
    const boundary = next === undefined ? undefined : controls.find(control => control.start >= span.end
      && control.end <= next.start && content[control.start] === "<");
    const end = Math.min(boundary?.start ?? next?.start ?? content.length, section?.end ?? content.length);
    const start = Math.min(span.start, first.start);
    ranges.push({ start, end, id: identity });
  }
  return ranges.sort((a, b) => a.start - b.start).filter((range, index, all) => index === 0 || range.start >= (all[index - 1]?.end ?? 0));
}

/** Remove only refused raw ranges, then restore their base entries by section and surviving identity anchors. */
export function restoreMalformedEntries(content: string, base: string, grammar: EntryListConfig, ranges: readonly RefusedEntrySpan[], markerLength: number): string {
  let result = content;
  for (const range of [...ranges].reverse()) result = result.slice(0, range.start) + result.slice(range.end);
  const original = entrySpans(base, grammar).map(span => span.entry);
  const restore = original.filter(entry => entry.id !== undefined && ranges.some(range => range.id === entry.id));
  if (restore.length === 0) return result;
  const frame = entryFrame(base, grammar);
  result = retainEntrySections(result, new Map(restore.map(entry => [entry.id ?? "", entry])), [frame]);
  for (const entry of restore) result = insertBaseEntry(result, original, entry, grammar, markerLength);
  return result;
}

function insertBaseEntry(content: string, base: readonly ListEntry[], entry: ListEntry, grammar: EntryListConfig, markerLength: number): string {
  const incoming = insertionAnchors(content, grammar, markerLength);
  const selected = new Map([...incoming.map(span => span.entry), entry].flatMap(value => value.id === undefined ? [] : [[value.id, value] as const]));
  const order = orderEntries(base, base, incoming.map(span => span.entry), selected, entry.section);
  const position = order.indexOf(entry.id ?? "");
  const next = order.slice(position + 1).map(id => incoming.find(span => span.entry.id === id)).find(span => span !== undefined);
  const previous = order.slice(0, position).reverse().map(id => incoming.find(span => span.entry.id === id)).find(span => span !== undefined);
  const offset = next?.start ?? previous?.end ?? entrySection(content, entry.section)?.body ?? content.length;
  const prefix = content.slice(0, offset);
  const boundary = prefix.endsWith("\n\n") ? "" : prefix.endsWith("\n") ? "\n" : "\n\n";
  return prefix + boundary + entry.bytes + (entry.separator || "\n\n") + content.slice(offset);
}

function insertionAnchors(content: string, grammar: EntryListConfig, markerLength: number): EntrySpan[] {
  const scan = scanMarkers(content, markerLength);
  const masked = [...scan.controls, ...scan.sets.map(set => ({
    start: content.indexOf("\n", set.start) + 1 + set.current.length, end: set.end,
  }))];
  let view = content;
  for (const range of masked.sort((a, b) => b.start - a.start)) {
    view = view.slice(0, range.start) + view.slice(range.start, range.end).replace(/[^\n]/gu, " ") + view.slice(range.end);
  }
  return entrySpans(view, grammar).map(entry => {
    const set = scan.sets.find(set => set.start <= entry.start && entry.start < set.end);
    return set === undefined ? entry : { ...entry, start: set.start, end: Math.max(entry.end, set.end) };
  });
}

function entrySpans(content: string, grammar: EntryListConfig): EntrySpan[] {
  let offset = 0;
  return splitEntryList(content, grammar).parts.flatMap(part => {
    const start = offset;
    offset += part.bytes.length + (part.kind === "entry" ? part.separator.length : 0);
    return part.kind === "entry" ? [{ start, end: offset, entry: part }] : [];
  });
}
