/**
 * SESSION-NOTES path resolver with compat fallback for in-flight migration.
 *
 * Personal SESSION-NOTES is canonically located at
 * `.arc/user/{identity}/<wu-name>/SESSION-NOTES.md` — one WU subdir per
 * `user/{identity}/` by the exactly-one-subdir invariant of the per-WU
 * personal-workspace layout. The legacy flat path
 * `.arc/user/{identity}/SESSION-NOTES.md` remains operative as compat for
 * work units whose personal workspace pre-dates the subdir migration.
 *
 * Resolution order: prefer the per-WU subdir when present; fall back to
 * the flat path otherwise. The compat fallback retires once all
 * in-flight work units have migrated to the subdir layout.
 *
 * @module
 */

import { join } from "node:path";

import type { DirEntry } from "../git/index.js";

/** Minimal I/O seam — narrower than `UserIOContext` for testability. */
export interface SessionNotesPathIO {
  readDir: (dirPath: string) => Promise<DirEntry[]>;
}

/**
 * Resolve the SESSION-NOTES path for an identity under the given repo root.
 *
 * Returns the absolute path when found, `null` when neither convention has
 * SESSION-NOTES present.
 *
 * - Subdir-first: looks for exactly one `<wu-name>/SESSION-NOTES.md` entry
 *   under `user/{identity}/`. R65a guarantees this when the WU's content
 *   has migrated to the per-WU layout. Zero or multiple matches fall
 *   through (the multi-match case can't pick safely).
 * - Compat fallback: legacy flat path `user/{identity}/SESSION-NOTES.md`.
 */
export async function resolveSessionNotesPath(
  cwd: string,
  identity: string,
  io: SessionNotesPathIO,
): Promise<string | null> {
  const userDir = join(cwd, ".arc", "user", identity);
  let entries: DirEntry[];
  try {
    entries = await io.readDir(userDir);
  } catch {
    return null;
  }

  const subdirMatches = entries.filter((entry) => {
    const parts = entry.name.split("/");
    return parts.length === 2 && parts[1] === "SESSION-NOTES.md";
  });

  if (subdirMatches.length === 1) {
    const match = subdirMatches[0];
    if (match !== undefined) {
      return join(userDir, match.name);
    }
  }

  const flatEntry = entries.find((entry) => entry.name === "SESSION-NOTES.md");
  if (flatEntry !== undefined) {
    return join(userDir, "SESSION-NOTES.md");
  }

  return null;
}
