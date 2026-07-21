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

export type { CrossWuEntry, EntryParse } from "./schema.js";

/** Cross-WU file shapes with a registered entry parser. */
export type CrossWuShape = "working-memory" | "user-inbox";
