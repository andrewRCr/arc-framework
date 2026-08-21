/**
 * Branch-gone recovery assembler — the I/O layer over the pure cascade.
 *
 * Consumes the already-computed session-init roster (so the roster is gathered
 * once and read here, not recomputed), enriches each in-flight worktree with
 * the per-worktree signals the action decision needs, folds in recently-active
 * remote branches as the fallback tier, and hands both tiers to the pure
 * {@link resolveCascade}. The current (branch-gone) branch and the integration
 * base are excluded so recovery never points back at the gone branch or
 * pre-empts the explicit `main` fallback.
 *
 * @module
 */

import { isLandedInBase, isLandedInBaseStrict } from "../git/branch-containment.js";
import { isWorktreeClean } from "../git/worktree-cleanup.js";
import { readWorktreeMarker } from "../git/worktree-marker.js";
import type { GitExec } from "../git/exec.js";
import {
  resolvePrimaryWorktreePath,
  type WorktreeRosterEntry,
  type WorktreeRosterResult,
} from "../git/worktree-roster.js";
import type { WorktreeMarkerReadResult } from "../git/worktree-marker.js";
import {
  linkedIdentityGlobalUserSurfacesAreSafe,
  nodeUserSurfaceMigrationFs,
  type UserSurfaceMigrationFs,
} from "../user-surface-migration.js";
import {
  determineCandidateAction,
  resolveCascade,
  type CascadeCandidate,
  type CascadeResolution,
} from "./branch-gone-cascade.js";
import { projectCleanupRemoteEvidence, type CleanupBaseEvidence } from "./cleanup-remote-evidence.js";

/**
 * Recency window for the fallback remote-branch tier, in days. A fixed
 * Foundation-internal constant — the configurable `coord.recency_days` key is
 * Coord Probe's to add, not ours.
 */
export const RECOVERY_RECENCY_DAYS = 30;

export interface RunBranchGoneRecoveryOptions {
  /** Pre-computed, identity-filtered roster from the session-init roster slot. */
  roster: WorktreeRosterResult;
  /** The branch-gone branch — excluded from candidates (cannot recover onto it). */
  currentBranch: string | null;
  /** Integration base branch short-name (e.g. `main`) — the merge target and the fallback. */
  baseBranch: string;
  /** Recently-active remote branch short-names, newest first, from the recency probe. */
  recentBranches: string[];
  /** Eligible advertised branch tips whose objects are not locally available. */
  recentPendingBranchCount?: number;
  /** Supplied advertised-base prerequisites; omitted only by compatibility callers pending composition cutover. */
  baseEvidence?: CleanupBaseEvidence;
  exec: GitExec;
  /** Reads a worktree's ownership marker; injected for testability. */
  readMarker?: (worktreePath: string) => Promise<WorktreeMarkerReadResult>;
  /** Filesystem seam for ignored identity-global user-surface safety scans. */
  userSurfaceFs?: UserSurfaceMigrationFs;
}

/**
 * Assemble candidate tiers and resolve the branch-gone recovery cascade.
 *
 * @param options - Roster, current/base branches, recent branches, and I/O bindings
 * @returns The cascade resolution (resolved / surface / main-fallback)
 */
export async function runBranchGoneRecovery(
  options: RunBranchGoneRecoveryOptions,
): Promise<CascadeResolution> {
  const { roster, currentBranch, baseBranch, recentBranches, exec } = options;
  const readMarker = options.readMarker ?? readWorktreeMarker;
  const userSurfaceFs = options.userSurfaceFs ?? nodeUserSurfaceMigrationFs;
  const integrationTarget = `origin/${baseBranch}`;
  const worktreeEntries = roster.entries.filter((entry) => entry.branch !== currentBranch);
  const primaryWorktreePath = worktreeEntries.length === 0 ? null : await resolvePrimaryWorktreePath(exec);

  const worktreeCandidates = await Promise.all(
    worktreeEntries.map((entry) =>
      buildWorktreeCandidate(entry, {
        exec,
        readMarker,
        userSurfaceFs,
        integrationTarget,
        primaryWorktreePath,
        baseBranch,
        baseEvidence: options.baseEvidence,
      }),
    ),
  );

  // The fallback tier: recent branches that are not the gone branch, not the
  // base (that resolves through the explicit main-fallback), and not already
  // represented by a local worktree candidate.
  const represented = new Set(worktreeCandidates.map((candidate) => candidate.branch));
  const recentBranchCandidates: CascadeCandidate[] = recentBranches
    .filter(
      (branch) =>
        branch !== currentBranch && branch !== baseBranch && !represented.has(branch),
    )
    .map((branch) => ({ branch, proposedAction: "switch" }));

  return resolveCascade({
    worktreeCandidates,
    recentBranchCandidates,
    pendingBranchCount: options.recentPendingBranchCount,
    baseBranch,
    // The compatibility path (no supplied prerequisites) resolves containment
    // through a direct remote-tracking read, so it does establish the merged
    // fact and reports `exact`. Supplied prerequisites project through the
    // shared vocabulary, which reports whatever they actually establish.
    evidence: options.baseEvidence === undefined
      ? { remoteEvidence: "exact" }
      : projectCleanupRemoteEvidence(baseBranch, options.baseEvidence),
  });
}

interface CandidateContext {
  exec: GitExec;
  readMarker: (worktreePath: string) => Promise<WorktreeMarkerReadResult>;
  userSurfaceFs: UserSurfaceMigrationFs;
  integrationTarget: string;
  primaryWorktreePath: string | null;
  baseBranch: string;
  baseEvidence?: CleanupBaseEvidence;
}

async function buildWorktreeCandidate(
  entry: WorktreeRosterEntry,
  ctx: CandidateContext,
): Promise<CascadeCandidate> {
  // A worktree with no resolved meta is main / admin — always a switch
  // destination, so the marker / clean / merged gathering is skipped.
  if (entry.metaFilePath === undefined) {
    return { branch: entry.branch, worktreePath: entry.worktreePath, proposedAction: "switch" };
  }

  const [marker, clean, merged, userSurfacesSafe] = await Promise.all([
    ctx.readMarker(entry.worktreePath),
    isWorktreeClean({ exec: ctx.exec, cwd: entry.worktreePath }),
    resolveCandidateMerged(ctx, entry.branch),
    linkedIdentityGlobalUserSurfacesAreSafe({
      primaryWorktreePath: ctx.primaryWorktreePath,
      worktreePath: entry.worktreePath,
      fs: ctx.userSurfaceFs,
    }),
  ]);

  return {
    branch: entry.branch,
    worktreePath: entry.worktreePath,
    proposedAction: determineCandidateAction({
      isMainOrAdmin: false,
      marker,
      clean,
      userSurfacesSafe,
      merged: merged ?? false,
    }),
  };
}

async function resolveCandidateMerged(ctx: CandidateContext, branch: string): Promise<boolean | null> {
  const evidence = ctx.baseEvidence;
  if (evidence === undefined) return isLandedInBase(ctx.exec, branch, ctx.integrationTarget);
  if (!evidence.remoteSyncEnabled || evidence.snapshot.kind === "unreachable") return null;
  const baseOid = evidence.snapshot.tips[ctx.baseBranch];
  if (baseOid === undefined) return null;
  if (evidence.objectAvailability.kind !== "complete") {
    throw new Error("Advertised recovery object availability could not be inspected.");
  }
  const baseCommitIsLocal = evidence.objectAvailability.commits[baseOid];
  if (baseCommitIsLocal === false) return null;
  if (baseCommitIsLocal === undefined) {
    throw new Error("The advertised recovery base commit has no local availability fact.");
  }
  if (evidence.history.kind === "shallow") return null;
  if (evidence.history.kind !== "complete") {
    throw new Error("Local recovery history completeness could not be inspected.");
  }
  const localOnlyExec: GitExec = (command, args, options) => ctx.exec(command, args, {
    ...options,
    objectAccess: "local-only",
  });
  return isLandedInBaseStrict(localOnlyExec, branch, baseOid);
}
