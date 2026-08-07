/**
 * Ordered work-unit rename orchestration over evidence, tracked sweep, and
 * machine-local identity legs.
 *
 * The tracked rename commits atomically before any branch, notes, remote,
 * marker, or worktree identity changes. Re-entry under the new slug skips that
 * committed phase and converges the remaining legs through their own state
 * checks.
 *
 * @module
 */

import type { WorktreeMarkerReadResult } from "../../git/worktree-marker.js";
import type { RenameRemoteBranchResult } from "../rename-identity.js";
import type {
  RenameWorktreeMoveResolution,
  ReconcileWorkUnitWorktreeResult,
} from "../mutators/reconcile-work-unit-worktree.js";
import type { RenameLocusOutcome } from "../rename-locus.js";
import type {
  RenameRetirementContext,
  RenameTransitionSourceEvidence,
} from "../direct-retirement-driver.js";
import { validateManagedPath } from "../../canonical/managed-path.js";
import type { TerminalTransitionRecordWriter } from "../terminal-transition-record-writer.js";
import type { TransitionRecord } from "../transition-record.js";
import { resolveTransitionRecordRelativePath } from "../transition-record-store.js";

/** Subject shapes with distinct identity-leg applicability. */
export type RenameSubjectShape = "spawned" | "in-place" | "stub";

/** Fully guarded rename plan returned before any mutation. */
export interface RenamePlan {
  shape: RenameSubjectShape;
  sourceSlug: string;
  targetSlug: string;
  resolvedSlug: string;
  resuming: boolean;
  sourceDir: string;
  resultDir: string;
  expectedBranch: string | null;
  oldBranch: string | null;
  newBranch: string | null;
  oldRemoteOid: string | null;
  additionalPaths: readonly string[];
  worktreePath: string | null;
  baseBranch: string;
  coordinationAdvisories: readonly string[];
}

/** Result of the tracked commit plus applicable identity legs. */
export type RunRenameResult =
  | {
      status: "renamed";
      shape: RenameSubjectShape;
      trackedCommit: "created" | "existing";
      pendingIntegration: boolean;
      advisories: readonly string[];
      remote?: RenameRemoteBranchResult;
      marker?: WorktreeMarkerReadResult["kind"] | "renamed" | "foreign";
      worktree?: RenameWorktreeMoveResolution | ReconcileWorkUnitWorktreeResult;
      locus?: RenameLocusOutcome;
    }
  | { status: "rejected"; reason: string }
  | { status: "partial"; reason: string };

/** Rekey report: the record outcome plus any physical move the transaction performed. */
export interface RenameLocusRekeyReport {
  locus: RenameLocusOutcome;
  worktree?: ReconcileWorkUnitWorktreeResult;
}

/** Injected operations driven by {@link runRename}. */
export interface RunRenameContext {
  retirement: RenameRetirementContext;
  transitionWriter: TerminalTransitionRecordWriter;
  preflight(params: { sourceSlug: string; targetSlug: string }): Promise<RenamePlan>;
  onPrepared?(plan: RenamePlan): Promise<void>;
  mutateTracked(plan: RenamePlan): Promise<void>;
  regenerateReadiness(plan: RenamePlan): Promise<string | undefined>;
  commitTracked(plan: RenamePlan): Promise<void>;
  withStubBranch<T>(plan: RenamePlan, operation: () => Promise<T>): Promise<T>;
  renameLocalBranch(plan: RenamePlan): Promise<void>;
  renameUserWorkspace(plan: RenamePlan): Promise<void>;
  renameRemoteBranch(plan: RenamePlan): Promise<RenameRemoteBranchResult>;
  renameMarker(plan: RenamePlan): Promise<"renamed" | "absent" | "foreign" | "malformed">;
  resolveWorktreeMove(plan: RenamePlan): Promise<RenameWorktreeMoveResolution>;
  /**
   * Rekey the renamed subject's locus record, performing any physical move inside the record-lock
   * window so the checkout and its role never disagree outside the transaction.
   */
  rekeyLocus(plan: RenamePlan, move: RenameWorktreeMoveResolution): Promise<RenameLocusRekeyReport>;
  /**
   * Re-point the ownership marker for a resolution the rekey's own move leg cannot carry: a landed
   * move whose marker now sits at the destination, and a self-move deferred out of the running
   * process, which additionally records the pending relocation for a later session to complete.
   */
  reconcileWorktreeMoveMarker(
    plan: RenamePlan,
    move: Extract<RenameWorktreeMoveResolution, { status: "deferred-self-move" | "already-moved" }>,
  ): Promise<"renamed" | "absent" | "foreign" | "malformed">;
}

/**
 * Rename one work unit through the tracked evidence commit and applicable
 * identity legs.
 *
 * @param ctx - Guard, authority, mutation, and identity seams
 * @param params - Explicit old and new slugs
 * @returns Complete, refused, or resumable-partial outcome
 */
export async function runRename(
  ctx: RunRenameContext,
  params: { sourceSlug: string; targetSlug: string },
): Promise<RunRenameResult> {
  let plan: RenamePlan;
  try {
    plan = await ctx.preflight(params);
    await ctx.onPrepared?.(plan);
  } catch (error) {
    return { status: "rejected", reason: errorMessage(error) };
  }

  let advisories: string[] = [];
  const runTracked = async (): Promise<"created" | "existing"> => {
    if (plan.resuming) return "existing";
    const tracked = await runTrackedRename(ctx, plan);
    if (tracked.status === "rejected") throw new RenameTrackedRefusal(tracked.reason);
    advisories = [...tracked.advisories];
    return "created";
  };

  let trackedCommit: "created" | "existing";
  try {
    trackedCommit = plan.shape === "stub"
      ? await ctx.withStubBranch(plan, runTracked)
      : await runTracked();
  } catch (error) {
    return { status: "rejected", reason: errorMessage(error) };
  }

  if (plan.shape === "stub") {
    return {
      status: "renamed",
      shape: plan.shape,
      trackedCommit,
      pendingIntegration: true,
      advisories,
    };
  }

  try {
    await ctx.renameLocalBranch(plan);
    await ctx.renameUserWorkspace(plan);
    const remote = await ctx.renameRemoteBranch(plan);
    if (remote.status === "stale") {
      return {
        status: "partial",
        reason: `old remote head moved from ${remote.expectedOid} to ${remote.actualOid ?? "[absent]"}`,
      };
    }

    let marker: "renamed" | "absent" | "foreign" | "malformed" | undefined;
    if (plan.shape === "spawned") marker = await ctx.renameMarker(plan);
    const move: RenameWorktreeMoveResolution = plan.shape === "spawned"
      ? await ctx.resolveWorktreeMove(plan)
      : { status: "in-place" };
    const rekey = await ctx.rekeyLocus(plan, move);
    if (rekey.locus.kind === "refused") {
      return { status: "partial", reason: `session locus rekey refused: ${rekey.locus.reason}` };
    }
    if (move.status === "deferred-self-move" || move.status === "already-moved") {
      marker = await ctx.reconcileWorktreeMoveMarker(plan, move);
    }
    const worktree = plan.shape === "spawned" ? rekey.worktree ?? move : undefined;
    return {
      status: "renamed",
      shape: plan.shape,
      trackedCommit,
      pendingIntegration: false,
      advisories,
      remote,
      ...(marker === undefined ? {} : { marker }),
      ...(worktree === undefined ? {} : { worktree }),
      locus: rekey.locus,
    };
  } catch (error) {
    return { status: "partial", reason: errorMessage(error) };
  }
}

class RenameTrackedRefusal extends Error {}

async function runTrackedRename(
  ctx: RunRenameContext,
  plan: RenamePlan,
): Promise<{ status: "ok"; advisories: readonly string[] } | { status: "rejected"; reason: string }> {
  let source: RenameTransitionSourceEvidence;
  try {
    source = await ctx.retirement.captureSource({
      name: plan.sourceSlug,
      targetSlug: plan.targetSlug,
      sourceDir: plan.sourceDir,
      resultDir: plan.resultDir,
      expectedBranch: plan.expectedBranch,
      additionalPaths: plan.additionalPaths,
    });
  } catch (error) {
    return { status: "rejected", reason: `rename evidence capture failed: ${errorMessage(error)}` };
  }

  const snapshot = await ctx.retirement.authority.readSnapshot(source.scope);
  if (snapshot.status === "refused") {
    return { status: "rejected", reason: `rename authority snapshot refused: ${snapshot.reason}` };
  }

  let readinessAdvisory: string | undefined;
  try {
    await ctx.mutateTracked(plan);
    await ctx.retirement.stageTransition(source);
    readinessAdvisory = await ctx.regenerateReadiness(plan);
  } catch (error) {
    try {
      await ctx.retirement.rollbackTransition(source);
    } catch (rollbackError) {
      return {
        status: "rejected",
        reason: `rename conservation failed: ${errorMessage(error)}; rollback failed: ${errorMessage(rollbackError)}`,
      };
    }
    return { status: "rejected", reason: `rename conservation failed: ${errorMessage(error)}` };
  }

  const transitionRecord: TransitionRecord = {
    schemaVersion: 1,
    origin: plan.sourceSlug,
    kind: "rename",
    successors: [plan.targetSlug],
    edges: [],
  };
  const transitionRecorded = await ctx.transitionWriter.record(transitionRecord);
  if (transitionRecorded.status !== "recorded") {
    const rollback = await ctx.retirement.rollbackRefusedCommit(source);
    return {
      status: "rejected",
      reason: `rename transition recording refused: ${transitionRecorded.status}`
        + (transitionRecorded.status === "unavailable" ? `; ${transitionRecorded.diagnostic}` : "")
        + (rollback.status === "rolled-back" ? "" : `; ${rollback.diagnostic}`),
    };
  }

  const completed = await ctx.retirement.completeTransition(
    source,
    snapshot.snapshot.authorityVersion,
    [validateManagedPath(resolveTransitionRecordRelativePath(plan.sourceSlug))],
  );
  if (completed.status === "refused") {
    const transitionRollback = await ctx.transitionWriter.rollback(transitionRecord);
    const rollback = await ctx.retirement.rollbackRefusedCommit(source);
    return {
      status: "rejected",
      reason: `rename completion refused: ${completed.reason}`
        + (completed.diagnostic === undefined ? "" : `; ${completed.diagnostic}`)
        + (rollback.status === "rolled-back" ? "" : `; ${rollback.diagnostic}`)
        + (transitionRollback.status === "rolled-back" ? "" : `; ${transitionRollback.diagnostic}`),
    };
  }

  try {
    await ctx.commitTracked(plan);
  } catch (error) {
    const transitionRollback = await ctx.transitionWriter.rollback(transitionRecord);
    const rollback = await ctx.retirement.rollbackRefusedCommit(source);
    return {
      status: "rejected",
      reason: `rename commit refused: ${errorMessage(error)}`
        + (rollback.status === "rolled-back" ? "" : `; ${rollback.diagnostic}`)
        + (transitionRollback.status === "rolled-back" ? "" : `; ${transitionRollback.diagnostic}`),
    };
  }
  return {
    status: "ok",
    advisories: readinessAdvisory === undefined ? [] : [readinessAdvisory],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
