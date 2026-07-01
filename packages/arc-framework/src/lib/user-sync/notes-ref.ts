/**
 * User-notes-ref readers and the low-level git note-read primitives.
 *
 * Two read modes share these primitives. Causal note resolution enumerates
 * annotated commits and reads note content by annotated commit. The cross-WU
 * merge instead needs the most-recent *window* of notes in recency order, so it
 * can union a file's entries across saves made independently in parallel
 * worktrees. Each git command shape (`notes list` / `notes show` / history
 * reads) lives in its own named function so there is a single call site per
 * shape.
 *
 * @module
 */

import type { GitExec } from "../git/index.js";

/** Notes-ref namespace for ARC user directories; `{identity}` is appended. */
const USER_NOTES_REF = "refs/notes/arc/user";
const GIT_OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

/**
 * How many of the most-recent notes the cross-WU merge reads. A named bound,
 * not a literal: the window is read in recency order so the merge resolves a
 * divergent entry to the most-recent note within it.
 */
export const CROSS_WU_NOTE_WINDOW = 10;

/** One note version read from the ref, carrying its serialized manifest content. */
export interface RecentNote {
  /** The notes-ref history commit this version came from. */
  historyCommit: string;
  /** The note blob's content (a serialized sync manifest). */
  content: string;
}

/** Notes-ref history commits, most-recent first, capped at `limit`. */
export async function readNotesRefHistory(
  exec: GitExec,
  fullRef: string,
  limit: number,
): Promise<string[]> {
  try {
    const { stdout } = await exec("git", [
      "log",
      "--format=%H",
      "--max-count",
      String(limit),
      fullRef,
    ]);
    return stdout.split("\n").map((entry) => entry.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Note paths changed in a single notes-ref history commit. */
export async function listChangedNotePaths(
  exec: GitExec,
  historyCommit: string,
): Promise<string[]> {
  try {
    const { stdout } = await exec("git", [
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      "--root",
      historyCommit,
    ]);
    return stdout.split("\n").map((entry) => entry.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Annotated commits carrying notes on a ref, unordered as returned by git notes. */
export async function listAnnotatedNoteCommits(
  exec: GitExec,
  fullRef: string,
): Promise<string[]> {
  try {
    const { stdout } = await exec("git", ["notes", `--ref=${fullRef}`, "list"]);
    return stdout
      .split("\n")
      .map((line) => line.trim().split(/\s+/u)[1])
      .filter((commit): commit is string => commit !== undefined && GIT_OBJECT_ID_PATTERN.test(commit));
  } catch {
    return [];
  }
}

/** A note blob's content for an annotated commit, or `null` when unreadable. */
export async function readNoteContentAtAnnotatedCommit(
  exec: GitExec,
  fullRef: string,
  commit: string,
): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["notes", `--ref=${fullRef}`, "show", commit]);
    return stdout;
  } catch {
    return null;
  }
}

/** The annotated commit a note path addresses, or `null` when the path isn't a note. */
export function notePathToCommit(path: string): string | null {
  const commit = path.replaceAll("/", "");
  return GIT_OBJECT_ID_PATTERN.test(commit) ? commit : null;
}

/** A note blob's content at a given history commit, or `null` when unreadable. */
export async function readNoteContentAtHistoryCommit(
  exec: GitExec,
  historyCommit: string,
  path: string,
): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["show", `${historyCommit}:${path}`]);
    return stdout;
  } catch {
    return null;
  }
}

/**
 * Read the most-recent notes from a user's notes ref, recency-ordered.
 *
 * Walks the ref's own history newest-first and collects each readable note
 * version up to `limit`. Unlike annotated-commit resolution, this returns an
 * ordered sequence (most-recent first) so the merge can resolve divergent
 * entries by recency. An empty or absent ref yields an empty sequence.
 *
 * @param exec - Git runner.
 * @param identity - The user identity whose notes ref to read.
 * @param limit - Maximum notes to return (default {@link CROSS_WU_NOTE_WINDOW}).
 * @returns Note versions, most-recent first; at most `limit`.
 */
export async function readRecentUserNotes(
  exec: GitExec,
  identity: string,
  limit: number = CROSS_WU_NOTE_WINDOW,
): Promise<RecentNote[]> {
  const fullRef = `${USER_NOTES_REF}/${identity}`;
  const history = await readNotesRefHistory(exec, fullRef, limit);

  const notes: RecentNote[] = [];
  for (const historyCommit of history) {
    if (notes.length >= limit) break;
    for (const path of await listChangedNotePaths(exec, historyCommit)) {
      if (notes.length >= limit) break;
      if (notePathToCommit(path) === null) continue;
      const content = await readNoteContentAtHistoryCommit(exec, historyCommit, path);
      if (content === null) continue;
      notes.push({ historyCommit, content });
    }
  }
  return notes;
}
