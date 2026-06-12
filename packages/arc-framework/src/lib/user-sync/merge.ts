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

/** Section-scoped identity key shared by entries and tombstones. */
function idOf(section: string, key: string): string {
  return JSON.stringify([section, key]);
}

/** Identity of an entry for union/dedupe — section-scoped key. */
function identityOf(entry: CrossWuEntry): string {
  return idOf(entry.section, entry.key);
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

/** Per-note parse products feeding `resolveCrossWuState`. */
interface ParsedNotesForResolution {
  /** Per-note entry lists, recency-ordered (most-recent first). */
  perNoteEntries: CrossWuEntry[][];
  /** Per-note well-formed tombstones, aligned with `perNoteEntries`; TTL is applied at resolution. */
  perNoteTombstones: Tombstone[][];
  /** Reasons for entries and tombstones that failed to parse — surfaced, never silently dropped. */
  malformed: string[];
}

/**
 * Parse a recency-ordered window of notes into per-note entries and tombstones
 * for {@link resolveCrossWuState}.
 *
 * Entries and `## Removed:` markers are parsed per note; a malformed block of
 * either kind surfaces as a reason rather than being dropped. Tombstone TTL is
 * not applied here — `resolveCrossWuState` owns liveness — so every well-formed
 * tombstone is returned.
 *
 * @param notes - Per-note copies of the file, recency-ordered (most-recent first).
 * @param shape - Parser shape resolved from the filename.
 */
function parseNotesForResolution(notes: readonly MergeNote[], shape: CrossWuShape): ParsedNotesForResolution {
  const malformed: string[] = [];
  const perNoteEntries: CrossWuEntry[][] = [];
  const perNoteTombstones: Tombstone[][] = [];
  for (const note of notes) {
    const entries: CrossWuEntry[] = [];
    for (const parse of parseCrossWuEntries(note.content, shape)) {
      if (parse.ok) entries.push(parse.entry);
      else malformed.push(parse.reason);
    }
    perNoteEntries.push(entries);

    const tombstones: Tombstone[] = [];
    for (const parse of parseTombstones(note.content)) {
      if (!parse.ok) malformed.push(parse.reason);
      else tombstones.push(parse.tombstone);
    }
    perNoteTombstones.push(tombstones);
  }
  return { perNoteEntries, perNoteTombstones, malformed };
}

/** Resolved cross-WU state after the recency × live-tombstone walk. */
interface ResolvedCrossWuState {
  /** Union of entries surviving suppression, in merge order. */
  liveEntries: CrossWuEntry[];
  /** `(section, key)` identities removed by a winning live tombstone. */
  suppressed: Set<string>;
  /** Tombstones that won their identity — carried forward into the merged file. */
  winningTombstones: Tombstone[];
}

/**
 * Resolve each `(section, key)` identity across a recency-ordered window of
 * per-note entries and tombstones.
 *
 * The most-recent note that mentions an identity decides its fate: an entry
 * keeps it live; a live tombstone suppresses it and carries forward. Within one
 * note an entry takes precedence over a tombstone. Tombstones past their TTL
 * relative to `now` are skipped, so an aged removal stops suppressing and the
 * entry propagates again.
 *
 * @param perNoteEntries - Per-note entry lists, recency-ordered (most-recent first).
 * @param perNoteTombstones - Per-note tombstones, aligned with `perNoteEntries`.
 * @param now - ISO-8601 reference time for tombstone TTL evaluation.
 */
function resolveCrossWuState(
  perNoteEntries: readonly CrossWuEntry[][],
  perNoteTombstones: readonly Tombstone[][],
  now: string,
): ResolvedCrossWuState {
  const decided = new Map<string, "entry" | Tombstone>();
  for (let i = 0; i < perNoteEntries.length; i++) {
    for (const entry of perNoteEntries[i] ?? []) {
      const id = identityOf(entry);
      if (!decided.has(id)) decided.set(id, "entry");
    }
    for (const tombstone of perNoteTombstones[i] ?? []) {
      if (!isLiveTombstone(tombstone, now)) continue;
      const id = idOf(tombstone.section, tombstone.key);
      if (!decided.has(id)) decided.set(id, tombstone);
    }
  }

  const suppressed = new Set<string>();
  const winningTombstones: Tombstone[] = [];
  for (const [id, decision] of decided) {
    if (decision !== "entry") {
      suppressed.add(id);
      winningTombstones.push(decision);
    }
  }

  const liveEntries = mergeEntries(perNoteEntries).filter((entry) => !suppressed.has(identityOf(entry)));
  return { liveEntries, suppressed, winningTombstones };
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
 * Deletion tombstones (`## Removed:` markers) are honored: for each identity,
 * the most-recent note that mentions it as an entry or a live tombstone decides
 * its fate — a winning tombstone suppresses the entry and is carried forward;
 * a more-recent re-add wins over an earlier tombstone. Tombstones past their TTL
 * are dropped (filter-at-merge GC) and stop suppressing.
 *
 * @param filename - Manifest-relative or bare filename; the basename selects the parser.
 * @param notes - Per-note copies of the file, recency-ordered (most-recent first).
 * @param now - ISO-8601 reference time for tombstone TTL evaluation.
 * @returns Merged content plus any malformed-entry / malformed-tombstone reasons.
 */
export function mergeCrossWuFile(
  filename: string,
  notes: readonly MergeNote[],
  now: string = new Date().toISOString(),
): MergeResult {
  const base = notes[0]?.content ?? "";
  const shape = shapeForFile(filename);
  if (shape === null) return { content: base, malformed: [] };

  const { perNoteEntries, perNoteTombstones, malformed } = parseNotesForResolution(notes, shape);
  const { liveEntries, winningTombstones } = resolveCrossWuState(perNoteEntries, perNoteTombstones, now);

  const baseKeys = new Set((perNoteEntries[0] ?? []).map(identityOf));
  const olderOnly = liveEntries.filter((entry) => !baseKeys.has(identityOf(entry)));

  let content = appendEntriesToSections(stripTombstoneSections(base), olderOnly);
  if (winningTombstones.length > 0) {
    const block = winningTombstones.map(renderTombstone).join("\n\n");
    content = `${content.replace(/\n+$/u, "")}\n\n${block}\n`;
  }

  return { content, malformed: dedupe(malformed) };
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
  /** The removed entry's merge key (WORKING-MEMORY bold-field header or H3 bold title). */
  key: string;
  /** ISO-8601 timestamp when the removal was recorded. */
  removedAt: string;
}

/**
 * Entries live in the prior state but neither live nor already-tombstoned in the
 * current state — the genuine new removals. `accountedFor` carries the current
 * state's present-or-recorded identities (live entries ∪ suppressed), so an entry
 * the saved file already tombstones is recognized rather than re-marked.
 */
function synthesizeTombstones(
  prior: readonly CrossWuEntry[],
  accountedFor: ReadonlySet<string>,
  now: string,
): Tombstone[] {
  return prior
    .filter((entry) => !accountedFor.has(identityOf(entry)))
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
 * Prior and current state are both reconstructed through the shared tombstone-aware
 * resolution: an identity live in the prior window but neither live nor already
 * tombstoned in `currentContent` is a removal and earns a timestamped
 * `## Removed: {key}` marker. Because prior is resolved tombstone-aware, an identity
 * the window already records as removed is not a live prior entry, so re-running
 * the synthesis over a window that already records the removal is a no-op — no
 * duplicate marker. Unknown-shape files, an empty prior window, and the no-removal
 * case return the content unchanged. The marker is recorded here; honoring it
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

  const priorParsed = parseNotesForResolution(priorNotes, shape);
  const prior = resolveCrossWuState(priorParsed.perNoteEntries, priorParsed.perNoteTombstones, now);

  const currentParsed = parseNotesForResolution([{ content: currentContent }], shape);
  const current = resolveCrossWuState(currentParsed.perNoteEntries, currentParsed.perNoteTombstones, now);
  const accountedFor = new Set([...current.liveEntries.map(identityOf), ...current.suppressed]);

  const tombstones = synthesizeTombstones(prior.liveEntries, accountedFor, now);
  if (tombstones.length === 0) return currentContent;

  const block = tombstones.map(renderTombstone).join("\n\n");
  return `${currentContent.replace(/\n+$/u, "")}\n\n${block}\n`;
}

/**
 * Fixed TTL after which a tombstone stops propagating and drops at merge time.
 * Sized to outlive the staleness of any copy that could realistically re-enter
 * the merge window, no more — past the window the failure mode is re-deleting a
 * note, not data loss, so a short value is safe. Kept short while tombstones
 * render in-band (they crowd the human-facing file until GC), pending a
 * configurable per-user value and the projected-record model that takes them
 * out of the rendered document entirely. The contract is the mechanism
 * (time-based, filter-at-merge), not the constant.
 */
const TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Heading of a deletion tombstone — `## Removed: {key}`. */
const TOMBSTONE_HEADING = /^## Removed:\s*(.+?)\s*$/;
/** Body line carrying the removed entry's section. */
const TOMBSTONE_SECTION = /^-\s*_Section:_\s*(.+?)\s*$/;
/** Body line carrying the removal timestamp (the TTL anchor). */
const TOMBSTONE_REMOVED = /^-\s*_Removed:_\s*(.+?)\s*$/;

/** Discriminated parse outcome for a tombstone marker — mirrors entry parsing. */
type TombstoneParse =
  | { ok: true; tombstone: Tombstone }
  | { ok: false; reason: string };

/** Whether a tombstone is still within its TTL relative to `now`. */
function isLiveTombstone(tombstone: Tombstone, now: string): boolean {
  return Date.parse(now) - Date.parse(tombstone.removedAt) < TOMBSTONE_TTL_MS;
}

/** First capture group of the first line matching `re`, or `null`. */
function matchFirst(lines: readonly string[], re: RegExp): string | null {
  for (const line of lines) {
    const match = line.match(re);
    if (match) return (match[1] ?? "").trim();
  }
  return null;
}

/**
 * Parse `## Removed:` markers from a file's content into discriminated outcomes.
 *
 * A marker is a `## Removed: {key}` heading followed by `- _Section:_` and
 * `- _Removed:_` body lines, ending at the next top-level boundary (`## ` or
 * `---`). A heading missing either field, or carrying an unparseable timestamp,
 * surfaces as `{ ok: false, reason }` rather than being dropped.
 */
function parseTombstones(content: string): TombstoneParse[] {
  const out: TombstoneParse[] = [];
  let key: string | null = null;
  let body: string[] = [];

  const flush = (): void => {
    if (key === null) return;
    const section = matchFirst(body, TOMBSTONE_SECTION);
    const removedAt = matchFirst(body, TOMBSTONE_REMOVED);
    if (section !== null && removedAt !== null && !Number.isNaN(Date.parse(removedAt))) {
      out.push({ ok: true, tombstone: { section, key, removedAt } });
    } else {
      out.push({ ok: false, reason: `\`## Removed:\` marker missing section or timestamp: ${key}` });
    }
    key = null;
    body = [];
  };

  for (const line of content.split("\n")) {
    const heading = line.match(TOMBSTONE_HEADING);
    if (heading) {
      flush();
      key = (heading[1] ?? "").trim();
    } else if (key !== null) {
      const trimmed = line.trimEnd();
      if (trimmed.startsWith("## ") || trimmed === "---") flush();
      else body.push(line);
    }
  }
  flush();
  return out;
}

/**
 * Strip every `## Removed:` section from `content` (heading through the line
 * before the next top-level boundary). A no-op when no marker is present, so
 * tombstone-free content round-trips byte-for-byte.
 */
function stripTombstoneSections(content: string): string {
  if (!/^## Removed:/mu.test(content)) return content;

  const out: string[] = [];
  let skipping = false;
  for (const line of content.split("\n")) {
    if (TOMBSTONE_HEADING.test(line)) {
      skipping = true;
      continue;
    }
    const trimmed = line.trimEnd();
    if (skipping && (trimmed.startsWith("## ") || trimmed === "---")) skipping = false;
    if (!skipping) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/gu, "\n\n").replace(/\n+$/u, "\n");
}
