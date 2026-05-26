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
import type { CrossWuEntry, CrossWuShape } from "./types.js";

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

/**
 * A deletion tombstone — records that a cross-WU entry was removed, so the merge
 * can suppress its reappearance from an older note within the window. `removedAt`
 * is the TTL anchor.
 */
interface Tombstone {
  /** Containing H2 section of the removed entry — preserves `(section, key)` identity. */
  section: string;
  /** The removed entry's merge key (WORKING-MEMORY header or USER-INBOX lead-in). */
  key: string;
  /** ISO-8601 timestamp when the removal was recorded. */
  removedAt: string;
}

/** Well-formed entries from a file's content, dropping (here, ignoring) malformed blocks. */
function okEntries(content: string, shape: CrossWuShape): CrossWuEntry[] {
  return parseCrossWuEntries(content, shape).flatMap((parse) => (parse.ok ? [parse.entry] : []));
}

/** Entries present in the prior merged state but absent from the current file. */
function synthesizeTombstones(
  prior: readonly CrossWuEntry[],
  current: readonly CrossWuEntry[],
  now: string,
): Tombstone[] {
  const present = new Set(current.map(identityOf));
  return prior
    .filter((entry) => !present.has(identityOf(entry)))
    .map((entry) => ({ section: entry.section, key: entry.key, removedAt: now }));
}

/** Render one tombstone as an `## Removed:` H2 marker block. */
function renderTombstone(tombstone: Tombstone): string {
  return `## Removed: ${tombstone.key}\n\n- _Section:_ ${tombstone.section}\n- _Removed:_ ${tombstone.removedAt}`;
}

/**
 * Append deletion tombstones to a cross-WU file for entries removed since the
 * prior merged state.
 *
 * The prior state is reconstructed by list-unioning entries across `priorNotes`
 * (the same merge as the load path) — an entry present there but absent from
 * `currentContent` is a removal and earns a timestamped `## Removed: {key}`
 * marker. Unknown-shape files, an empty prior window, and the no-removal case
 * return the content unchanged. The marker is recorded here; honoring it
 * (suppression, TTL) happens at the next merge.
 *
 * @param filename - Manifest-relative or bare filename; the basename selects the parser.
 * @param currentContent - The file content being saved.
 * @param priorNotes - Prior copies of the file, recency-ordered (most-recent first).
 * @param now - ISO-8601 timestamp stamped on each new tombstone.
 * @returns The content with any removal tombstones appended at EOF.
 */
export function appendRemovalTombstones(
  filename: string,
  currentContent: string,
  priorNotes: readonly MergeNote[],
  now: string,
): string {
  const shape = shapeForFile(filename);
  if (shape === null) return currentContent;

  const prior = mergeEntries(priorNotes.map((note) => okEntries(note.content, shape)));
  const tombstones = synthesizeTombstones(prior, okEntries(currentContent, shape), now);
  if (tombstones.length === 0) return currentContent;

  const block = tombstones.map(renderTombstone).join("\n\n");
  return `${currentContent.replace(/\n+$/u, "")}\n\n${block}\n`;
}
