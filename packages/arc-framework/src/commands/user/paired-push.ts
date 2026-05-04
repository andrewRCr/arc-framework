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
} from "./save-load.js";
import { notesRef } from "./shared.js";
import type {
  PairedPushLegOutcome,
  PairedPushResult,
  RunPairedPushOptions,
  UserIOContext,
} from "./types.js";

/**
 * Run the paired worktree + notes push.
 *
 * Runs the pushability pre-check matrix (`target: "both"`) before either leg.
 * On block, neither leg fires and both are reported `skipped`. Otherwise the
 * worktree push runs first; if it fails, the notes leg is skipped. On
 * worktree success + notes failure, a partial-push marker is recorded; on
 * full success, any pre-existing marker is cleared.
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
      worktree: { status: "skipped", reason: "blocked-by-precheck" },
      notes: { status: "skipped", reason: "blocked-by-precheck" },
      conditions: pushability.conditions,
      exitCode: 1,
    };
  }

  const worktree = await pushWorktreeLeg(io, branch);
  if (worktree.status === "failed") {
    return {
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
  return { worktree, notes, conditions: pushability.conditions, exitCode };
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
