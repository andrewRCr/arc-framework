/**
 * Notes push with automatic lossless reconcile.
 *
 * Wraps `reconcileNotesPush` with spinner output and the local-note-staleness
 * warning. Shared by `arc user push`, `arc sync`, and the save+push flow. On a
 * non-fast-forward rejection — a concurrent worktree pushed the shared notes
 * ref first — the push reconciles losslessly via `git notes merge` and
 * re-pushes, with no prompt. Returns the discriminated outcome so callers
 * render context-appropriate messaging without this helper knowing about its
 * embedding.
 *
 * @module
 */

import { findNearestUserNote, reconcileNotesPush } from "../commands/user.js";
import type { NotesPushOutcome, UserIOContext } from "../commands/user.js";
import type { AccessFn } from "../lib/git/index.js";
import type { SyncOutput } from "../lib/sync-output.js";

export interface PushNotesWithReconcileOptions {
  io: UserIOContext;
  identity: string;
  cwd: string;
  access?: AccessFn;
  /** Current worktree branch — threaded into the pushability matrix. */
  worktreeBranch?: string;
  /**
   * Output routing for spinner and log emission. Required so JSON-mode callers
   * route spinner cursor codes and log lines through a no-op spinner / stderr
   * sink, keeping subprocess stdout free of Clack artifacts. Human-mode callers
   * pass `createSyncOutput(false)` for a pass-through wrapper around
   * `@clack/prompts`.
   */
  output: SyncOutput;
}

/**
 * Push user notes, auto-reconciling a concurrent-worktree non-fast-forward.
 *
 * Brackets {@link reconcileNotesPush} with a spinner and, on a no-op, the
 * local-note-staleness warning. The reconcile itself is automatic and lossless
 * (`git notes merge -s cat_sort_uniq`); force-push stays an explicit `--force`
 * opt-in on the single-leg path. The returned outcome carries no rendering —
 * callers map it to their own surfaces.
 */
export async function pushNotesWithReconcile(
  options: PushNotesWithReconcileOptions,
): Promise<NotesPushOutcome> {
  const { io, identity, cwd, access, worktreeBranch, output } = options;
  const spinner = output.spinner();
  spinner.start("Pushing user notes...");
  const outcome = await reconcileNotesPush({ io, identity, cwd, access, worktreeBranch });
  spinner.stop(notesPushStopMessage(outcome));
  if (outcome.kind === "noop") {
    await warnIfLocalNoteStaleForHead(output, { cwd, io, identity });
  }
  return outcome;
}

/** Spinner stop line for each push outcome. */
function notesPushStopMessage(outcome: NotesPushOutcome): string {
  switch (outcome.kind) {
    case "pushed":
      return "Push complete.";
    case "noop":
      return "Remote user notes already match local user notes.";
    case "reconciled":
      return "Reconciled concurrent notes and pushed.";
    case "no-remote":
      return "No remote configured.";
    case "blocked":
      return "Push blocked.";
    case "conflict":
      return "Could not auto-reconcile concurrent notes.";
    case "failed":
      return "Failed.";
  }
}

async function warnIfLocalNoteStaleForHead(
  output: SyncOutput,
  options: Pick<PushNotesWithReconcileOptions, "cwd" | "io" | "identity">,
): Promise<void> {
  const { cwd, io, identity } = options;
  const { note } = await findNearestUserNote({ cwd, io, identity });
  if (!note?.reachableFromHead || note.ancestorDistance <= 0) return;

  output.log.warn(
    `Latest local user note is attached to a commit ${note.ancestorDistance} commit(s) behind HEAD.`,
  );
  output.log.info("Run `arc user save` or `arc sync` before relying on handoff.");
}
