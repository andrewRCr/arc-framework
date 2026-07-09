/**
 * Advisory read for user-notes compaction.
 *
 * Counts the local notes-ref history and compares it to the internal advisory
 * threshold. This is read-only and intentionally local: the nudge says "this
 * checkout's notes history is large enough to consider compaction."
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";

import { COMPACTION_ADVISORY_HISTORY_THRESHOLD } from "./compaction-retention.js";

/** Local history-size advisory for notes compaction. */
export interface NotesCompactionAdvisory {
  historyCommitCount: number;
  threshold: number;
  shouldSuggest: boolean;
}

/** Count notes-ref history and resolve whether compaction should be suggested. */
export async function inspectNotesCompactionAdvisory(
  exec: GitExec,
  fullRef: string,
  threshold: number = COMPACTION_ADVISORY_HISTORY_THRESHOLD,
): Promise<NotesCompactionAdvisory> {
  let historyCommitCount: number;
  try {
    const { stdout } = await exec("git", ["rev-list", "--count", fullRef]);
    const parsed = Number.parseInt(stdout.trim(), 10);
    historyCommitCount = Number.isFinite(parsed) ? parsed : 0;
  } catch {
    historyCommitCount = 0;
  }
  return {
    historyCommitCount,
    threshold,
    shouldSuggest: historyCommitCount > threshold,
  };
}
