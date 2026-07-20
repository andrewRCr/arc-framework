/**
 * Session-init advisory for user-notes compaction.
 *
 * This slot is offer-only: it counts local notes-ref history, compares it to
 * the internal threshold, and carries the shared once-per-day nudge state for
 * workflow rendering. It never runs compaction.
 *
 * @module
 */

import { z } from "zod";

import type { GitExec } from "../git/exec.js";
import { LoadSetPathSchema } from "../load-set/types.js";
import { inspectNotesCompactionAdvisory } from "../user-sync/index.js";
import { notesRef } from "../../commands/user/shared.js";
import type { NudgeMarkerState } from "./nudge-rate-limit.js";

const CalendarDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((value) => {
    const parsed = Date.parse(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
  }, "must be a valid calendar day");

const NudgeMarkerStateViewSchema = z.strictObject({
  shouldNudge: z.boolean(),
  markerPath: LoadSetPathSchema.nullable(),
  today: CalendarDaySchema,
});

/** Runtime authority for the local session notes-compaction advisory view. */
export const NotesCompactionSessionAdvisoryResultSchema = z
  .strictObject({
    historyCommitCount: z.number().int().nonnegative(),
    threshold: z.number().int().nonnegative(),
    shouldSuggest: z.boolean(),
    nudge: NudgeMarkerStateViewSchema,
  })
  .refine((value) => value.shouldSuggest === (value.historyCommitCount > value.threshold), {
    message: "shouldSuggest must reflect whether historyCommitCount exceeds threshold",
    path: ["shouldSuggest"],
  });

/** Session-init slot payload for the notes-compaction advisory. */
export type NotesCompactionSessionAdvisoryResult = z.infer<
  typeof NotesCompactionSessionAdvisoryResultSchema
>;

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
    `refs/notes/${notesRef(options.identity)}`,
  );
  return { ...advisory, nudge: options.nudge };
}
