/**
 * Registered harness-directory parsing for ARC-created linked worktrees.
 *
 * The config value is a comma-separated list of top-level gitignored harness
 * directories to copy from the primary checkout into a fresh linked worktree.
 *
 * @module
 */

import { isAbsolute } from "node:path";

/** Default registered gitignored harness directories copied from the primary checkout. */
export const DEFAULT_WORKTREE_HARNESS_DIRS = ".claude,.codex,.gemini,.opencode";

/**
 * Repo-critical top-level names that must never be registered — copying `.git`
 * or `.arc` into a linked worktree would corrupt its git linkage or ARC state.
 */
const RESERVED_HARNESS_DIRS = new Set([".git", ".arc"]);

/**
 * Parse `worktree.harness_dirs`, preserving order while deduplicating entries.
 *
 * @param value - Raw comma-separated config value.
 * @returns Valid top-level directory names.
 * @throws When an entry is absolute, nested, a traversal token, or a reserved directory (`.git`/`.arc`).
 */
export function parseRegisteredHarnessDirs(value: string | undefined): string[] {
  const dirs: string[] = [];
  const seen = new Set<string>();
  for (const rawEntry of value?.split(",") ?? []) {
    const entry = rawEntry.trim().replace(/[\\/]+$/u, "");
    if (entry === "") continue;
    if (entry === "." || entry === ".." || isAbsolute(entry) || entry.includes("/") || entry.includes("\\")) {
      throw new Error(`worktree.harness_dirs contains an invalid top-level directory: ${rawEntry.trim()}`);
    }
    if (RESERVED_HARNESS_DIRS.has(entry)) {
      throw new Error(`worktree.harness_dirs contains a reserved directory: ${rawEntry.trim()}`);
    }
    if (seen.has(entry)) continue;
    seen.add(entry);
    dirs.push(entry);
  }
  return dirs;
}
