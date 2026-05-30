/**
 * Shared types for cross-WU user-notes entry parsing and merge.
 *
 * Cross-WU flat files (`WORKING-MEMORY.md`, `USER-INBOX.md`) hold entries that
 * may be created independently in parallel worktrees; the merge converges them
 * by entry identity instead of letting the most-recent note clobber the rest.
 * These types are the seam between the per-shape parser and the shape-agnostic
 * merge. Parse outcomes are discriminated so an expected failure surfaces as
 * data rather than an exception.
 *
 * @module
 */

/**
 * A parsed cross-WU entry, the unit of list-union merge.
 *
 * Identity is `(section, key)`: `WORKING-MEMORY` keys on the bold-field header
 * within its single `## Memories` section; `USER-INBOX` keys on the H3 bold
 * title scoped to its `## Atomic` / `## Backlog` section, so the same title
 * under different sections stays distinct; `ERRANDS` keys on the H3 bold title
 * within its single `## Queue` section. `raw` is the verbatim entry block —
 * preserved for divergent-body resolution (most-recent note wins) and for
 * lossless reconstruction into the merged file.
 */
export interface CrossWuEntry {
  /** Containing H2 heading text — `Memories`, `Atomic`, `Backlog`, or `Queue`. */
  section: string;
  /** Merge identity within the section — bold-field header (WM) or H3 bold title (UI / errands). */
  key: string;
  /** Verbatim entry block text (header / H3 heading through body), trailing blanks trimmed. */
  raw: string;
}

/**
 * Discriminated parse outcome for a single entry block. Expected failures
 * (a block that doesn't match its shape) return `{ ok: false, reason }` rather
 * than throwing, so a malformed entry surfaces to the caller instead of being
 * silently dropped.
 */
export type EntryParse =
  | { ok: true; entry: CrossWuEntry }
  | { ok: false; reason: string };

/** Cross-WU file shapes with a registered entry parser. */
export type CrossWuShape = "working-memory" | "user-inbox" | "errands";
