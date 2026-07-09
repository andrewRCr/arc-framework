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

import { TOMBSTONE_TTL_MS } from "./merge.js";

/** Notes-ref namespace for ARC user directories; `{identity}` is appended. */
const USER_NOTES_REF = "refs/notes/arc/user";
const GIT_OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

/**
 * Commit subject of a compaction snapshot — the in-band marker recent-note
 * reads use to recognize the snapshot's bulk tree as history rewriting, not
 * note authorship.
 */
export const NOTES_COMPACTION_SNAPSHOT_MESSAGE = "user notes compaction snapshot";

/**
 * Maximum number of recent note versions the cross-WU merge reads after the
 * time horizon is applied.
 */
export const CROSS_WU_NOTE_WINDOW = 10;

/** Time horizon for recent-note reads, aligned with deletion tombstone TTL. */
export const CROSS_WU_NOTE_WINDOW_MS = TOMBSTONE_TTL_MS;

/** One note version read from the ref, carrying its serialized manifest content. */
export interface RecentNote {
  /** The notes-ref history commit this version came from. */
  historyCommit: string;
  /** The note blob's content (a serialized sync manifest). */
  content: string;
}

/** One note tree entry: note blob object id plus annotated commit object id. */
export interface NoteEntry {
  blob: string;
  commit: string;
}

interface NotesRefHistoryEntry {
  commit: string;
  committedAt: string | null;
  subject: string | null;
}

/** Notes-ref history commits, most-recent first, bounded by `sinceIso`. */
export async function readNotesRefHistory(
  exec: GitExec,
  fullRef: string,
  sinceIso: string,
): Promise<NotesRefHistoryEntry[]> {
  try {
    return parseHistoryLog(await readNotesRefHistoryWithSinceArg(exec, fullRef, `--since-as-filter=${sinceIso}`));
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (!isUnsupportedSinceAsFilterError(error.message)) return [];
    // `--since-as-filter` requires Git 2.37+. Older Git can only fall back to
    // `--since`, which may stop traversal early on non-date-ordered history;
    // returning that bounded view is still preferable to reporting no recent notes.
    try {
      return parseHistoryLog(await readNotesRefHistoryWithSinceArg(exec, fullRef, `--since=${sinceIso}`));
    } catch {
      return [];
    }
  }
}

async function readNotesRefHistoryWithSinceArg(
  exec: GitExec,
  fullRef: string,
  sinceArg: string,
): Promise<string> {
  const { stdout } = await exec("git", [
    "log",
    "--format=%H%x00%cI%x00%s",
    sinceArg,
    fullRef,
  ]);
  return stdout;
}

function parseHistoryLog(stdout: string): NotesRefHistoryEntry[] {
  return stdout
    .split("\n")
    .map(parseHistoryEntry)
    .filter((entry): entry is NotesRefHistoryEntry => entry !== null);
}

function isUnsupportedSinceAsFilterError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("since-as-filter") && (
    lower.includes("unknown option")
    || lower.includes("unrecognized option")
    || lower.includes("invalid option")
  );
}

/**
 * Note paths whose content a single notes-ref history commit added or
 * modified. Exact renames and deletions are excluded (`-M100%` +
 * `--diff-filter=AM`): git's automatic notes-tree fanout restructure rewrites
 * every note path as a pure rename in one commit, and treating those as note
 * events would grant stale notes fresh recency in the cross-WU merge window.
 */
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
      "-M100%",
      "--diff-filter=AM",
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
  return (await listNoteEntries(exec, fullRef)).map((entry) => entry.commit);
}

/** Note blob/commit pairs carried by a notes ref, unordered as returned by git notes. */
export async function listNoteEntries(
  exec: GitExec,
  fullRef: string,
): Promise<NoteEntry[]> {
  try {
    const { stdout } = await exec("git", ["notes", `--ref=${fullRef}`, "list"]);
    return stdout
      .split("\n")
      .map(parseNoteEntry)
      .filter((entry): entry is NoteEntry => entry !== null);
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
 * version within the tombstone-aligned time horizon, up to `limit`. Unlike
 * annotated-commit resolution, this returns an ordered sequence (most-recent
 * first) so the merge can resolve divergent entries by recency. History commits
 * that do not change note paths are skipped and do not consume the count bound.
 * Compaction snapshot commits are skipped entirely — their bulk tree is
 * history rewriting, not note authorship, and reading it would fill the window
 * with arbitrary old notes. An empty or absent ref yields an empty sequence.
 *
 * @param exec - Git runner.
 * @param identity - The user identity whose notes ref to read.
 * @param limit - Maximum notes to return (default {@link CROSS_WU_NOTE_WINDOW}).
 * @param now - Reference time for the tombstone-aligned time horizon.
 * @returns Note versions, most-recent first; at most `limit`.
 */
export async function readRecentUserNotes(
  exec: GitExec,
  identity: string,
  limit: number = CROSS_WU_NOTE_WINDOW,
  now: Date | string = new Date(),
): Promise<RecentNote[]> {
  const fullRef = `${USER_NOTES_REF}/${identity}`;
  const nowMs = typeof now === "string" ? Date.parse(now) : now.getTime();
  const sinceMs = nowMs - CROSS_WU_NOTE_WINDOW_MS;
  const history = await readNotesRefHistory(exec, fullRef, new Date(sinceMs).toISOString());

  const notes: RecentNote[] = [];
  for (const { commit: historyCommit, committedAt, subject } of history) {
    if (notes.length >= limit) break;
    if (committedAt !== null && Date.parse(committedAt) < sinceMs) continue;
    if (subject === NOTES_COMPACTION_SNAPSHOT_MESSAGE) continue;
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

function parseHistoryEntry(line: string): NotesRefHistoryEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const [commit, committedAt, subject] = trimmed.split("\0");
  if (!commit) return null;
  return { commit, committedAt: committedAt?.trim() || null, subject: subject?.trim() || null };
}

function parseNoteEntry(line: string): NoteEntry | null {
  const [blob, commit] = line.trim().split(/\s+/u);
  if (
    blob === undefined
    || commit === undefined
    || !GIT_OBJECT_ID_PATTERN.test(blob)
    || !GIT_OBJECT_ID_PATTERN.test(commit)
  ) {
    return null;
  }
  return { blob, commit };
}
