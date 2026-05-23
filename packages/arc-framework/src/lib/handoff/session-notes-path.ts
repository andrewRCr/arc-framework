/**
 * SESSION-NOTES path resolver.
 *
 * Personal SESSION-NOTES lives at `.arc/user/{identity}/<wu-name>/SESSION-NOTES.md` —
 * one WU subdir per `user/{identity}/` by the exactly-one-subdir invariant of the
 * per-WU personal-workspace layout (R65a).
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
 * Looks for exactly one `<wu-name>/SESSION-NOTES.md` entry under
 * `user/{identity}/`. R65a guarantees this when the WU's content has been
 * provisioned. Returns the absolute path on a single match; returns `null`
 * on zero matches, multiple matches (can't pick safely), or `readDir` failure.
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

  return null;
}
