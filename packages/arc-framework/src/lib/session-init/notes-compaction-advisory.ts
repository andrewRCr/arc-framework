/**
 * Session-init advisory for user-notes compaction.
 *
 * This slot is offer-only: it counts local notes-ref history, compares it to
 * the internal threshold, and carries the shared once-per-day nudge state for
 * workflow rendering. It never runs compaction.
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";
import {
  inspectNotesCompactionAdvisory,
  type NotesCompactionAdvisory,
} from "../user-sync/index.js";
import type { NudgeMarkerState } from "./nudge-rate-limit.js";

/** Session-init slot payload for the compaction advisory. */
export interface NotesCompactionSessionAdvisoryResult extends NotesCompactionAdvisory {
  nudge: NudgeMarkerState;
}

/** Inputs for the compaction advisory probe. */
export interface RunNotesCompactionSessionAdvisoryOptions {
  exec: GitExec;
  identity: string;
  nudge: NudgeMarkerState;
}

/** Resolve the notes-history advisory for session-init. */
export async function runNotesCompactionSessionAdvisory(
  options: RunNotesCompactionSessionAdvisoryOptions,
): Promise<NotesCompactionSessionAdvisoryResult> {
  const advisory = await inspectNotesCompactionAdvisory(
    options.exec,
    `refs/notes/arc/user/${options.identity}`,
  );
  return { ...advisory, nudge: options.nudge };
}
