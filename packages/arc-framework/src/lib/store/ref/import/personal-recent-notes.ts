/** Strict, pinned acquisition of the same recent note versions ordinary personal load considers. */
import type { GitExec } from "../../../git/exec.js";
import { isGitProcessError } from "../../../git/process-error.js";
import { CROSS_WU_NOTE_WINDOW, CROSS_WU_NOTE_WINDOW_MS, NOTES_COMPACTION_SNAPSHOT_MESSAGE,
  notePathToCommit, type RecentNote } from "../../../user-sync/notes-ref.js";
import type { RefBackendContext } from "../context.js";
import { parseImportNoteFiles } from "./personal-note-manifest.js";

/** Capture a present ref's raw tip without confusing a missing commit object with an absent identity. */
export async function readImportNotesTip(exec: GitExec, person: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["--no-replace-objects", "rev-parse", "--verify", "--quiet", `refs/notes/arc/user/${person}`]);
    const tip = stdout.trim();
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(tip)) throw new Error("A personal notes ref has no readable object identity");
    return tip;
  } catch (error) {
    if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1) return null;
    throw error;
  }
}

/** Fail on required acquisition errors while retaining load's count, age and compaction exclusions. */
export async function readImportRecentNotes(context: RefBackendContext, tip: string | null): Promise<RecentNote[]> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  if (!tip) return [];
  const options = { cwd: source.ports.checkoutRoot, objectAccess: "local-only" as const };
  const since = context.clock().getTime() - CROSS_WU_NOTE_WINDOW_MS;
  const { stdout } = await source.ports.exec("git", ["--no-replace-objects", "log", "--format=%H%x00%cI%x00%s",
    `--since-as-filter=${new Date(since).toISOString()}`, tip], options);
  const notes: RecentNote[] = [];
  for (const row of stdout.split(/\r?\n/u).filter(Boolean)) {
    if (notes.length >= CROSS_WU_NOTE_WINDOW) break;
    const { historyCommit, at, subject } = importHistoryRow(row);
    if (at < since || subject === NOTES_COMPACTION_SNAPSHOT_MESSAGE) continue;
    notes.push(...await readChangedNotes(context, historyCommit, CROSS_WU_NOTE_WINDOW - notes.length));
  }
  return notes;
}

async function readChangedNotes(context: RefBackendContext, historyCommit: string, limit: number): Promise<RecentNote[]> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  const changed = await source.ports.exec("git", ["--no-replace-objects", "diff-tree", "--no-commit-id", "--name-only", "-z",
    "-r", "--root", "-M100%", "--diff-filter=AM", historyCommit], { cwd: source.ports.checkoutRoot, objectAccess: "local-only" });
  if (changed.stdout && !changed.stdout.endsWith("\0")) throw new Error(`The changed note paths at ${historyCommit} are incomplete`);
  const notes: RecentNote[] = [];
  for (const path of changed.stdout.split("\0").filter(Boolean)) {
    if (notes.length >= limit) break;
    if (notePathToCommit(path) === null) continue;
    notes.push({ historyCommit, content: await readRequiredNote(context, historyCommit, path) });
  }
  return notes;
}

function importHistoryRow(row: string): { historyCommit: string; at: number; subject: string } {
  const [historyCommit, committedAt, subject] = row.split("\0");
  if (!historyCommit || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(historyCommit)
    || !committedAt || !Number.isFinite(Date.parse(committedAt)) || subject === undefined) throw new Error("A required personal notes history row is malformed");
  return { historyCommit, at: Date.parse(committedAt), subject };
}

async function readRequiredNote(context: RefBackendContext, historyCommit: string, path: string): Promise<string> {
  const source = context.importSource;
  if (!source) throw new Error("No import source bound");
  try {
    const { stdout } = await source.ports.rawExec(["--no-replace-objects", "show", `${historyCommit}:${path}`],
      { cwd: source.ports.checkoutRoot, objectAccess: "local-only" });
    const content = new TextDecoder("utf-8", { fatal: true }).decode(stdout);
    parseImportNoteFiles(content);
    return content;
  } catch (error) {
    throw new Error(`Cannot acquire required note ${historyCommit}:${path}: ${error instanceof Error ? error.message : String(error)}. An older version inside the recent window remains required after a later overwrite; restore its original object or explicitly repair the source history before retrying.`, { cause: error });
  }
}
