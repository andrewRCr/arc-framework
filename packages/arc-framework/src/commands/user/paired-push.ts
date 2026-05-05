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
 * No automatic retry. Recovery is the caller's responsibility via
 * `arc user push` (idempotent).
 *
 * @module
 */

import { runPushabilityStatus } from "../../lib/git/index.js";
import {
  clearPartialPushMarker,
  recordPartialPushMarker,
  runUserSave,
} from "./save-load.js";
import { notesRef } from "./shared.js";
import type {
  PairedPushLegOutcome,
  PairedPushResult,
  PairedPushSaveOutcome,
  RunPairedPushOptions,
  UserIOContext,
} from "./types.js";

/**
 * Run the paired worktree + notes push.
 *
 * Runs the pushability pre-check matrix (`target: "both"`) before either leg.
 * On block, neither leg fires and both are reported `skipped`. Otherwise the
 * current user directory is saved to HEAD before any push fires. Save failure
 * skips both push legs. On save success, the worktree push runs first; if it
 * fails, the notes leg is skipped. On worktree success + notes failure, a
 * partial-push marker is recorded; on full success, any pre-existing marker is
 * cleared.
 *
 * @param options - See {@link RunPairedPushOptions}.
 * @returns Discriminated outcome with per-leg status, surfaced pushability
 *   conditions, and a worst-outcome exit code.
 */
export async function runPairedPush(
  options: RunPairedPushOptions,
): Promise<PairedPushResult> {
  const { io, identity, cwd, access, branch, worktreeSyncState } = options;

  const pushability = await runPushabilityStatus({
    exec: io.exec,
    access,
    target: "both",
    worktreeSyncState,
  });

  if (!pushability.allowed) {
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

  const worktree = await pushWorktreeLeg(io, branch);
  if (worktree.status === "failed") {
    return {
      save,
      worktree,
      notes: { status: "skipped", reason: "preceding-leg-failed" },
      conditions: pushability.conditions,
      exitCode: 1,
    };
  }

  const notes = await pushNotesLeg(io, identity);
  if (notes.status === "failed") {
    await recordPartialPushMarker(cwd, io, identity);
  } else {
    await clearPartialPushMarker(cwd, io, identity);
  }

  const exitCode = notes.status === "success" ? 0 : 1;
  return { save, worktree, notes, conditions: pushability.conditions, exitCode };
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

async function pushWorktreeLeg(
  io: UserIOContext,
  branch: string,
): Promise<PairedPushLegOutcome> {
  try {
    await io.exec("git", ["push", "origin", branch]);
    return { status: "success" };
  } catch (err) {
    return { status: "failed", error: toError(err) };
  }
}

async function pushNotesLeg(
  io: UserIOContext,
  identity: string,
): Promise<PairedPushLegOutcome> {
  try {
    await io.exec("git", ["push", "origin", `refs/notes/${notesRef(identity)}`]);
    return { status: "success" };
  } catch (err) {
    return { status: "failed", error: toError(err) };
  }
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
