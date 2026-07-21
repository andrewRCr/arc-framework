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
import { SlugSchema } from "../kernel/index.js";
import { materializeArcPath, resolveArcPath } from "../layout/index.js";

/** Minimal I/O seam — narrower than `UserIOContext` for testability. */
export interface SessionNotesPathIO {
  readDir: (dirPath: string) => Promise<DirEntry[]>;
}

/** Exact-path I/O seam for one named work unit's SESSION-NOTES. */
export interface WorkUnitSessionNotesPathIO {
  access: (path: string) => Promise<void>;
}

export type SessionNotesPathResult =
  | { status: "resolved"; path: string }
  | { status: "absent" }
  | { status: "error"; message: string };

/**
 * Materialize one named work unit's canonical SESSION-NOTES path.
 *
 * @param cwd - Current ARC project root
 * @param identity - Resolved ARC identity
 * @param workUnitName - Work-unit slug
 * @returns Native absolute path beneath the selected project root
 */
export function materializeWorkUnitSessionNotesPath(
  cwd: string,
  identity: string,
  workUnitName: string,
): string {
  return materializeArcPath(cwd, resolveArcPath({
    kind: "user-document",
    identity: SlugSchema.parse(identity),
    document: { kind: "session-notes", workUnit: SlugSchema.parse(workUnitName) },
  }));
}

/**
 * Resolve one named WU's SESSION-NOTES while retaining absent-vs-error detail.
 *
 * @param cwd - Current ARC project root
 * @param identity - Resolved ARC identity
 * @param workUnitName - Active work-unit slug
 * @param io - Directory-reading boundary
 * @returns Resolved path, normal absence, or a genuine directory error
 */
export async function resolveWorkUnitSessionNotesPath(
  cwd: string,
  identity: string,
  workUnitName: string,
  io: WorkUnitSessionNotesPathIO,
): Promise<SessionNotesPathResult> {
  const path = materializeWorkUnitSessionNotesPath(cwd, identity, workUnitName);
  try {
    await io.access(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "absent" };
    const message = error instanceof Error ? error.message : String(error);
    return { status: "error", message: `Unable to access SESSION-NOTES: ${message}` };
  }
  return { status: "resolved", path };
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
