/** Find checked spans for stored conflicts in the content a projection will lay. */
import type { TextConflictRecord } from "../conflict.js";
import { splitEntryList, type EntryListConfig } from "../concurrency/entries.js";
import { relocateTextOffsets } from "../concurrency/line-merge.js";
import type { HistoryMemo } from "./base-recovery.js";

/** Character span and exact line sides of one safely placed stored conflict. */
export interface ConflictPlacement {
  readonly start: number;
  readonly end: number;
  readonly current: readonly string[];
  readonly incoming: readonly string[];
}

/** Return a placement only when the captured side and its identity or historical context still agree. */
export async function placeStoredConflict(input: {
  content: string; conflict: TextConflictRecord; memo: HistoryMemo; grammar?: EntryListConfig;
}): Promise<ConflictPlacement | null> {
  const { conflict, content } = input;
  if (!("currentLines" in conflict)) return placeEntry(content, conflict, input.grammar);
  let base = "";
  if (conflict.baseVersion !== null) {
    const history = await input.memo.read(conflict.record);
    if (history.status === "refused") return null;
    const version = history.result.find(entry => entry.version === conflict.baseVersion);
    if (version?.content === null || version?.content === undefined) return null;
    base = version.content;
  }
  const before = textLines(base), after = textLines(content);
  const moved = relocateTextOffsets(base, content, [lineOffset(base, conflict.location.start)])[0] ?? 0;
  const row = content.slice(0, moved).split("\n").length - 1;
  const end = row + conflict.currentLines;
  const current = conflict.currentLines === 0 ? [] : conflict.current.content.split("\n");
  const incoming = conflict.incomingLines === 0 ? [] : conflict.incoming.content.split("\n");
  if (after.slice(row, end).join("\n") !== current.join("\n") || end > after.length) return null;
  if (conflict.location.start === 0 ? row !== 0 : after[row - 1] !== before[conflict.location.start - 1]) return null;
  if (conflict.location.end === before.length ? end !== after.length : after[end] !== before[conflict.location.end]) return null;
  return { start: lineOffset(content, row), end: lineOffset(content, end), current, incoming };
}

function textLines(content: string): string[] {
  return content === "" ? [] : (content.endsWith("\n") ? content.slice(0, -1) : content).split("\n");
}

function lineOffset(content: string, row: number): number {
  return Math.min(content.length, content.split("\n").slice(0, row).reduce((size, line) => size + line.length + 1, 0));
}

function placeEntry(content: string, conflict: TextConflictRecord, grammar: EntryListConfig | undefined): ConflictPlacement | null {
  if (grammar === undefined || conflict.location.kind !== "entry") return null;
  let offset = 0;
  for (const part of splitEntryList(content, grammar).parts) {
    if (part.kind === "entry" && part.id === conflict.location.id) {
      if (part.bytes !== conflict.current.content) return null;
      return { start: offset, end: offset + part.bytes.length,
        current: textLines(conflict.current.content), incoming: textLines(conflict.incoming.content) };
    }
    offset += part.bytes.length + (part.kind === "entry" ? part.separator.length : 0);
  }
  return null;
}
