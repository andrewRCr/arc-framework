/**
 * Paired worktree + notes push helper.
 *
 * Orchestrates the worktree branch push followed by the user-notes ref push
 * under worst-outcome exit semantics: partial success is failure. The push
 * ordering is fixed — worktree always lands before notes — so notes never
 * reference unpushed commits. When the worktree leg succeeds and the notes
 * leg fails, a partial-push marker is recorded so subsequent coherence
 * probes can surface the recovery state.
 *
 * Save lives inside this helper: the current user directory is saved to
 * `HEAD` before either push leg fires, with verification gated by
 * `runUserSave` (sync-state never advances past an unverified write). Save
 * failure short-circuits both legs. Single boundary, single owner — the
 * orchestrator does not save separately for the paired cell.
 *
 * Worktree pushes go through {@link pushWorktreeBranch} from `lib/git/`
 * (internal scope; not re-exported from `lib/git/index.ts`). Single-leg
 * worktree pushes in `handlers/sync.ts` consume the same helper, so the
 * paired and single-leg paths cannot diverge on the underlying push call.
 * The helper is the swappable seam for future push-wrapper work.
 *
 * Force-push refusal is enforced at the orchestrator boundary: a
 * `force-push-required` advisory condition (raised by `runPushabilityStatus`
 * on a diverged worktree) refuses the paired flow before save fires.
 * Single-leg `runUserPush` does not refuse the advisory at its call site —
 * divergent pushes instead route through `push-recovery.ts`'s `[rejected]`
 * branch. Both paths achieve user-facing safety; the asymmetry is
 * intentional (see {@link ../../lib/git/pushability.js}).
 *
 * The notes leg is delegated to an injected {@link PairedPushNotesPusher}
 * (production wires `pushWithInteractiveRecovery`) so the paired and
 * single-leg paths share conflict recovery, idempotent no-op detection, and
 * pre-check refusal without `commands/user/` taking a Clack dependency.
 *
 * No automatic retry. Recovery is the caller's responsibility via
 * `arc user push` (idempotent).
 *
 * @module
 */

import { runPushabilityStatus } from "../../lib/git/index.js";
import { pushWorktreeBranch } from "../../lib/git/push-worktree.js";
import {
  clearPartialPushMarker,
  recordPartialPushMarker,
  runUserSave,
} from "./save-load.js";
import type {
  PairedPushNotesOutcome,
  PairedPushResult,
  PairedPushSaveOutcome,
  RunPairedPushOptions,
  UserIOContext,
} from "./types.js";

/**
 * Run the paired worktree + notes push.
 *
 * Runs the pushability pre-check matrix (`target: "both"`) before either leg.
 * On block, neither leg fires and both are reported `skipped`. The
 * `force-push-required` advisory disposition also refuses here — the paired
 * flow inherits the user-sync-surface contract that force-push is destructive
 * and must be opted into explicitly. Otherwise the current user directory is
 * saved to `HEAD` (verified by `runUserSave` — sync-state advances only on
 * exact-`HEAD` readback match) before any push fires. Save failure skips both
 * push legs. On save success, the worktree push runs through
 * `pushWorktreeBranch` first; if it fails, the notes leg is skipped. On
 * worktree success, the injected notes pusher runs; the partial-push marker
 * is recorded on failure (and cleared on success for defense-in-depth —
 * `runUserPush` clears it on success internally).
 *
 * @param options - See {@link RunPairedPushOptions}.
 * @returns Discriminated outcome with per-leg status, surfaced pushability
 *   conditions, and a worst-outcome exit code.
 */
export async function runPairedPush(
  options: RunPairedPushOptions,
): Promise<PairedPushResult> {
  const { io, identity, cwd, access, branch, worktreeSyncState, pushNotes } = options;

  const pushability = await runPushabilityStatus({
    exec: io.exec,
    access,
    target: "both",
    worktreeSyncState,
  });

  const refusedByAdvisory = pushability.conditions.some(
    (c) => c.disposition === "advisory" && c.kind === "force-push-required",
  );

  if (!pushability.allowed || refusedByAdvisory) {
    return {
      save: { status: "skipped", reason: "blocked-by-precheck" },
      worktree: { status: "skipped", reason: "blocked-by-precheck" },
      notes: { status: "skipped", reason: "blocked-by-precheck" },
      conditions: pushability.conditions,
      exitCode: 1,
    };
  }

  const save = await saveUserDirectory(cwd, io, identity);
  if (save.status === "failed") {
    return {
      save,
      worktree: { status: "skipped", reason: "save-failed" },
      notes: { status: "skipped", reason: "save-failed" },
      conditions: pushability.conditions,
      exitCode: 1,
    };
  }

  const worktree = await pushWorktreeBranch({ exec: io.exec, branch });
  if (worktree.status === "failed") {
    return {
      save,
      worktree,
      notes: { status: "skipped", reason: "preceding-leg-failed" },
      conditions: pushability.conditions,
      exitCode: 1,
    };
  }

  const notes: PairedPushNotesOutcome = await pushNotes({
    io,
    identity,
    cwd,
    access,
    worktreeBranch: branch,
  });
  if (isNotesSuccess(notes)) {
    await clearPartialPushMarker(cwd, io, identity);
  } else {
    await recordPartialPushMarker(cwd, io, identity);
  }

  const exitCode = isNotesSuccess(notes) ? 0 : 1;
  return { save, worktree, notes, conditions: pushability.conditions, exitCode };
}

function isNotesSuccess(outcome: PairedPushNotesOutcome): boolean {
  return (
    outcome.status === "success"
    || outcome.status === "noop"
    || outcome.status === "ok-recovered"
  );
}

async function saveUserDirectory(
  cwd: string,
  io: UserIOContext,
  identity: string,
): Promise<PairedPushSaveOutcome> {
  try {
    const result = await runUserSave({ cwd, io, identity });
    return { status: "success", result };
  } catch (err) {
    return { status: "failed", error: toError(err) };
  }
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
