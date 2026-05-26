/**
 * Cross-WU entry merge — list-union across the N most-recent notes.
 *
 * Cross-WU flat files can be edited independently in parallel worktrees. A
 * plain most-recent-note-wins load would clobber entries authored elsewhere; the
 * merge instead unions entries by identity so parallel additions converge.
 * Divergent bodies for the same identity resolve to the most-recent note
 * (recency-ordered), and an unknown-shape file with no registered parser falls
 * back to whole-file most-recent-wins — the sync *class* is path-only, the merge
 * *strategy* is per-file.
 *
 * @module
 */

import { parseCrossWuEntries, shapeForFile } from "./parser.js";
import type { CrossWuEntry } from "./types.js";

/** Identity of an entry for union/dedupe — section-scoped key. */
function identityOf(entry: CrossWuEntry): string {
  return JSON.stringify([entry.section, entry.key]);
}

/**
 * Union entries across notes, deduped by `(section, key)` identity.
 *
 * @param notesEntries - Per-note entry lists, recency-ordered (most-recent
 *   first). The first note to carry a given identity wins, so the most-recent
 *   note's body survives a divergent-body collision.
 * @returns Merged entries: the most-recent note's entries in order, then each
 *   older-only entry in first-seen (most-recent-among-older) order.
 */
export function mergeEntries(notesEntries: readonly CrossWuEntry[][]): CrossWuEntry[] {
  const merged = new Map<string, CrossWuEntry>();
  for (const note of notesEntries) {
    for (const entry of note) {
      const id = identityOf(entry);
      if (!merged.has(id)) merged.set(id, entry);
    }
  }
  return [...merged.values()];
}

/** One note's copy of a cross-WU file, recency-ordered (most-recent first). */
export interface MergeNote {
  /** The file's content in this note. */
  content: string;
}

/** Result of merging a cross-WU file across notes. */
export interface MergeResult {
  /** Merged file content to materialize. */
  content: string;
  /** Reasons for entries that failed to parse — surfaced, never silently dropped. */
  malformed: string[];
}

/**
 * Merge one cross-WU file across the N most-recent notes.
 *
 * Known shapes (resolved from the filename) parse to entries, union by identity,
 * and reconstruct onto the most-recent note as base — preserving its preamble
 * and formatting while folding in entries that exist only in older notes. An
 * unknown-shape file (no registered parser) falls back to whole-file
 * most-recent-wins.
 *
 * @param filename - Manifest-relative or bare filename; the basename selects the parser.
 * @param notes - Per-note copies of the file, recency-ordered (most-recent first).
 * @returns Merged content plus any malformed-entry reasons encountered.
 */
export function mergeCrossWuFile(filename: string, notes: readonly MergeNote[]): MergeResult {
  const base = notes[0]?.content ?? "";
  const shape = shapeForFile(filename);
  if (shape === null) return { content: base, malformed: [] };

  const malformed: string[] = [];
  const perNoteEntries: CrossWuEntry[][] = [];
  for (const note of notes) {
    const entries: CrossWuEntry[] = [];
    for (const parse of parseCrossWuEntries(note.content, shape)) {
      if (parse.ok) entries.push(parse.entry);
      else malformed.push(parse.reason);
    }
    perNoteEntries.push(entries);
  }

  const merged = mergeEntries(perNoteEntries);
  const baseKeys = new Set((perNoteEntries[0] ?? []).map(identityOf));
  const olderOnly = merged.filter((entry) => !baseKeys.has(identityOf(entry)));

  return { content: appendEntriesToSections(base, olderOnly), malformed: dedupe(malformed) };
}

/** Append older-only entries to the end of their owning section in `base`. */
function appendEntriesToSections(base: string, entries: readonly CrossWuEntry[]): string {
  if (entries.length === 0) return base;

  let content = base;
  const bySection = new Map<string, CrossWuEntry[]>();
  for (const entry of entries) {
    const bucket = bySection.get(entry.section) ?? [];
    bucket.push(entry);
    bySection.set(entry.section, bucket);
  }

  for (const [section, sectionEntries] of bySection) {
    const block = sectionEntries.map((e) => e.raw).join("\n\n");
    content = insertIntoSection(content, section, block);
  }
  return content;
}

/**
 * Insert `block` at the end of the `## {section}` content region.
 *
 * The region ends at the next top-level boundary — a following `## ` heading or
 * a `---` rule (link-definition / EOF separator) — so the block lands after the
 * section's last entry without crossing into the next section or the trailing
 * separator. A missing section is appended as a fresh `## {section}` at EOF.
 */
function insertIntoSection(content: string, section: string, block: string): string {
  const lines = content.split("\n");
  const headingIdx = lines.findIndex((line) => line.trimEnd() === `## ${section}`);
  if (headingIdx === -1) {
    const trimmed = content.replace(/\n+$/, "");
    return `${trimmed}\n\n## ${section}\n\n${block}\n`;
  }

  let end = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = (lines[i] ?? "").trimEnd();
    if (line.startsWith("## ") || line === "---") {
      end = i;
      break;
    }
  }

  // Trim trailing blank lines within the region, then splice the block in.
  let lastContent = end - 1;
  while (lastContent > headingIdx && (lines[lastContent] ?? "").trim() === "") lastContent--;

  const head = lines.slice(0, lastContent + 1);
  const tail = lines.slice(end);
  const rebuilt = [...head, "", block, "", ...tail];
  return rebuilt.join("\n");
}

/** Stable dedupe preserving first-seen order. */
function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}
