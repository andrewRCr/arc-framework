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
 * The notes leg is branch-bounded. After the worktree leg lands, the helper
 * derives one temporary notes-export target and hands that exact target to
 * the marker publisher and injected notes pusher. This keeps sibling
 * worktree notes local until their branches land, without `commands/user/`
 * taking a Clack dependency.
 *
 * The notes leg silently retries transient push failures before surfacing a
 * partial-push recovery state. Durable recovery is the caller's responsibility
 * via `arc user push` (idempotent).
 *
 * @module
 */

import { runPushabilityStatus } from "../../lib/git/index.js";
import { pushWorktreeBranch } from "../../lib/git/push-worktree.js";
import {
  cleanupBranchBoundedNotesExport,
  planBranchBoundedNotesExport,
  type PlanBranchBoundedNotesExportResult,
} from "../../lib/user-sync/branch-bounded-notes-export.js";
import { clearPartialPushMarker, recordPartialPushMarker } from "../../lib/user-sync/index.js";
import { runNotesPushWithRetry } from "./notes-push-retry.js";
import { runUserSave } from "./save-load.js";
import type {
  PairedPushMarkerContext,
  PairedPushMarkerPublisher,
  PairedPushNotesContext,
  PairedPushNotesOutcome,
  PairedPushNotesPusherResult,
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
  const {
    io, identity, cwd, access, branch, worktreeSyncState, pushNotes,
    publishMarker, setUpstream = false, notesRetryConfig, sleep,
    planNotesExport = defaultPlanNotesExport,
    cleanupNotesExport,
  } = options;

  const pushability = await runPushabilityStatus({
    exec: io.exec,
    access,
    target: "both",
    worktreeSyncState,
  });

  // Filter the caller-resolvable `no-upstream-branch` condition out of the
  // refusal check when the orchestrator opted into upstream init. The
  // worktree leg below picks up `-u` to publish and set upstream in one op.
  const conditionsAfterResolution = setUpstream
    ? pushability.conditions.filter((c) => c.kind !== "no-upstream-branch")
    : pushability.conditions;
  const refused = conditionsAfterResolution.some(
    (c) => c.disposition === "block" || c.disposition === "caller-resolvable",
  );
  const refusedByAdvisory = pushability.conditions.some(
    (c) => c.disposition === "advisory" && c.kind === "force-push-required",
  );

  if (refused || refusedByAdvisory) {
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

  const worktree = await pushWorktreeBranch({
    exec: io.exec,
    branch,
    args: setUpstream ? ["-u"] : [],
  });
  if (worktree.status === "failed") {
    return {
      save,
      worktree,
      notes: { status: "skipped", reason: "preceding-leg-failed" },
      conditions: pushability.conditions,
      exitCode: 1,
    };
  }

  const exportPlan = await planNotesExport({ io, identity, worktreeBranch: branch });
  if (exportPlan.kind !== "planned") {
    const notes = notesOutcomeForPlanMiss(exportPlan);
    const partialPushMarkerRecorded = await recordPartialPushMarkerSafely(cwd, io, identity);
    return {
      save,
      worktree,
      notes,
      conditions: conditionsAfterResolution,
      exitCode: 1,
      retryOffer: { autoRetries: 0 },
      partialPushMarkerRecorded,
    };
  }

  const notesExportTarget = exportPlan.target;

  // Marker before notes: publish this machine's outstanding notes-push intent
  // ahead of the notes leg, so a landed marker names the same export target the
  // notes leg is about to push. Best-effort and isolated — a publish failure
  // (or a throwing delegate) never blocks the notes leg or flips the exit code.
  if (publishMarker) {
    await publishMarkerSafely(publishMarker, {
      io,
      identity,
      cwd,
      worktreeBranch: branch,
      notesExportTarget,
    });
  }

  // Auto-retry a transient notes-leg failure a couple of times before surfacing
  // anything (re-pushing the same ref carries zero clobber risk). A success —
  // first try or after retries — clears the marker; a still-failing leg records
  // it and returns a structured retry-offer for the agent/workflow layer to
  // resolve. Non-blocking by construction.
  const retry = await runNotesPushWithRetry(
    () => pushNotes({ io, identity, cwd, access, worktreeBranch: branch, notesExportTarget }),
    notesRetryConfig,
    sleep,
  );
  await cleanupNotesExportSafely(
    cleanupNotesExport ?? ((target) => cleanupBranchBoundedNotesExport({ exec: io.exec, target })),
    notesExportTarget,
  );
  const notes: PairedPushNotesOutcome = retry.result;
  if (isNotesSuccess(notes)) {
    await clearPartialPushMarker(cwd, io, identity);
  } else {
    const partialPushMarkerRecorded = await recordPartialPushMarkerSafely(cwd, io, identity);
    const exitCode = 1;
    return {
      save,
      worktree,
      notes,
      conditions: conditionsAfterResolution,
      exitCode,
      ...(retry.kind === "retry-offer"
        ? { retryOffer: { autoRetries: retry.autoRetries } }
        : {}),
      partialPushMarkerRecorded,
    };
  }

  const exitCode = 0;
  return {
    save,
    worktree,
    notes,
    // Post-resolution conditions: a `no-upstream-branch` resolved by the `-u`
    // push is filtered out (see `conditionsAfterResolution`), so a successful
    // upstream-init push never surfaces its "Set upstream first" guidance as a
    // stray stderr error. The structured result is the source of truth for
    // success.
    conditions: conditionsAfterResolution,
    exitCode,
    ...(retry.kind === "retry-offer"
      ? { retryOffer: { autoRetries: retry.autoRetries } }
      : {}),
  };
}

async function defaultPlanNotesExport(
  context: Pick<PairedPushNotesContext, "io" | "identity" | "worktreeBranch">,
): Promise<PlanBranchBoundedNotesExportResult> {
  return planBranchBoundedNotesExport({
    exec: context.io.exec,
    execInput: context.io.execInput,
    identity: context.identity,
    branch: context.worktreeBranch,
  });
}

function notesOutcomeForPlanMiss(
  plan: Exclude<PlanBranchBoundedNotesExportResult, { kind: "planned" }>,
): PairedPushNotesPusherResult {
  switch (plan.kind) {
    case "skipped":
      return {
        status: "refused",
        message: `Branch-bounded notes export could not find a safe target (${plan.reason}).`,
      };
    case "refused":
      return { status: "refused", message: plan.message };
    case "failed":
      return { status: "failed", error: plan.error };
  }
}

async function cleanupNotesExportSafely(
  cleanupNotesExport: (target: PairedPushNotesContext["notesExportTarget"]) => Promise<void>,
  target: PairedPushNotesContext["notesExportTarget"],
): Promise<void> {
  try {
    await cleanupNotesExport(target);
  } catch {
    // Best-effort: temp-ref cleanup must not hide the notes outcome or marker update.
  }
}

/**
 * Run the marker publisher under best-effort isolation. The publisher is
 * contracted not to throw, but a defensive guard here keeps a misbehaving
 * delegate from ever breaking the notes leg — a failed marker push must leave
 * behavior exactly as it was before this leg existed (the worktree push has
 * already landed; the notes leg and its recovery markers are unaffected).
 */
async function publishMarkerSafely(
  publishMarker: PairedPushMarkerPublisher,
  context: PairedPushMarkerContext,
): Promise<void> {
  try {
    await publishMarker(context);
  } catch {
    // Best-effort: the marker never gates the paired push.
  }
}

async function recordPartialPushMarkerSafely(
  cwd: string,
  io: UserIOContext,
  identity: string,
): Promise<boolean> {
  try {
    return await recordPartialPushMarker(cwd, io, identity);
  } catch {
    return false;
  }
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
