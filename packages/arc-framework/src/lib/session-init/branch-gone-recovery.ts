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
import { stat } from "node:fs/promises";
import { checkWorktreeRemoval, type ProjectionRemovalSlots } from "../git/worktree-removal.js";
import type { DerivedCheckoutRow } from "../locus/derived-roster.js";
import { missingRegistrationActions } from "./missing-worktree-folders.js";
import type { SessionAction } from "./actions.js";
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
  /** The same reader-owned checkout rows used by session entry. */
  derivedRoster: readonly DerivedCheckoutRow[] | null;
  /** Projection policy used by read-only removal observations. */
  projectionRemovalSlots?: ProjectionRemovalSlots;
  /** Filesystem boundary for checkout folder observations. */
  folderExists?: (path: string) => Promise<boolean>;
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

  if (options.derivedRoster === null) throw new Error("Recovery checkout observations are unavailable.");
  const rows = new Map(options.derivedRoster.map((row) => [row.checkout.path, row]));
  const missingFolders: { worktreePath: string; branch: string; actions: SessionAction[] }[] = [];
  const candidates = await Promise.all(
    worktreeEntries.map((entry) =>
      buildWorktreeCandidate(entry, {
        exec,
        readMarker,
        row: rows.get(entry.worktreePath),
        folderExists: options.folderExists,
        projectionRemovalSlots: options.projectionRemovalSlots,
        missingFolders,
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
  const worktreeCandidates = candidates.filter((candidate): candidate is CascadeCandidate => candidate !== null);
  const represented = new Set(roster.entries.map((entry) => entry.branch));
  const recentBranchCandidates: CascadeCandidate[] = recentBranches
    .filter(
      (branch) =>
        branch !== currentBranch && branch !== baseBranch && !represented.has(branch),
    )
    .map((branch) => ({ branch, proposedAction: "switch" }));

  const result = resolveCascade({
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
  return missingFolders.length === 0 ? result : { ...result, missingFolders };
}

interface CandidateContext {
  row: DerivedCheckoutRow | undefined;
  folderExists?: (path: string) => Promise<boolean>;
  projectionRemovalSlots?: ProjectionRemovalSlots;
  missingFolders: { worktreePath: string; branch: string; actions: SessionAction[] }[];
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
): Promise<CascadeCandidate | null> {
  if (entry.branch === undefined) return null;
  if (ctx.row === undefined) {
    return { branch: entry.branch, worktreePath: entry.worktreePath, proposedAction: "external" };
  }
  if (!ctx.row.checkout.folderPresent) {
    const check = await checkWorktreeRemoval({ exec: ctx.exec, checkoutPath: entry.worktreePath,
      disposition: "remove", check: ctx.projectionRemovalSlots?.check, folderExists: ctx.folderExists });
    if (check.kind === "missing" || (check.kind === "refused" && check.reason === "locked" && !check.folderPresent)) {
      ctx.missingFolders.push({ worktreePath: entry.worktreePath, branch: entry.branch,
        actions: missingRegistrationActions(entry.worktreePath, { locked: check.kind === "refused" }) });
    }
    return null;
  }
  if (ctx.row.kind === "unresolved-checkout" || ctx.row.diagnostics.length > 0) {
    return { branch: entry.branch, worktreePath: entry.worktreePath, proposedAction: "external",
      diagnostics: ctx.row.diagnostics.length > 0 ? ctx.row.diagnostics
        : [{ code: "unresolved-checkout", message: "Checkout role could not be established." }] };
  }
  // Main / admin destinations need a fresh folder observation, without
  // gathering marker, cleanliness or removal authority.
  if (entry.workUnit === undefined && entry.metaFilePath === undefined) {
    return { branch: entry.branch, worktreePath: entry.worktreePath,
      proposedAction: await administrativeFolderAction(entry.worktreePath, ctx.folderExists) };
  }

  const [marker, removalCheck, merged, userSurfacesSafe] = await Promise.all([
    ctx.readMarker(entry.worktreePath),
    checkWorktreeRemoval({ exec: ctx.exec, checkoutPath: entry.worktreePath, disposition: "remove", check: ctx.projectionRemovalSlots?.check, folderExists: ctx.folderExists }),
    resolveCandidateMerged(ctx, entry.branch),
    linkedIdentityGlobalUserSurfacesAreSafe({
      primaryWorktreePath: ctx.primaryWorktreePath,
      worktreePath: entry.worktreePath,
      fs: ctx.userSurfaceFs,
    }),
  ]);

  const proposedAction = determineCandidateAction({ isMainOrAdmin: false, marker, removalCheck,
    userSurfacesSafe, merged: merged ?? false });
  const candidate = { branch: entry.branch, worktreePath: entry.worktreePath };
  if (proposedAction !== "removable") return { ...candidate, proposedAction };
  const workUnitName = marker.kind === "present" ? marker.marker.wuName : undefined;
  return workUnitName === undefined ? { ...candidate, proposedAction: "external" }
    : { ...candidate, proposedAction, workUnitName };
}

async function administrativeFolderAction(path: string, folderExists: CandidateContext["folderExists"]): Promise<"switch" | "external"> {
  try {
    const present = folderExists === undefined ? (await stat(path)).isDirectory() : await folderExists(path);
    return present ? "switch" : "external";
  } catch { return "external"; }
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
