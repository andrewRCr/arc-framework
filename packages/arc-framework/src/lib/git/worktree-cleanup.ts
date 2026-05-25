/**
 * Worktree cleanup gating.
 *
 * Two pieces, consumed wherever ARC decides whether to remove a worktree
 * (post-merge integration, the branch-gone cascade, the stale-worktree sweep):
 *
 * - {@link isBranchMerged} — the "is this branch merged into the integration
 *   target" check, via `git merge-base --is-ancestor`. Detects true-merge and
 *   fast-forward integration (the branch tip is reachable from the target). A
 *   squash- or rebase-merge rewrites history, so the original tip is no longer
 *   an ancestor and reads as not-merged — the same boundary `git branch
 *   --merged` has.
 * - {@link decideWorktreeCleanup} — the pure decision mapping marker presence,
 *   clean, and merged signals to one cleanup action. Only present + clean +
 *   merged offers removal; an untrustworthy marker (absent or malformed) is
 *   advisory, the safe "externally managed" default.
 *
 * @module
 */

import type { GitExec, GitExecOptions } from "./exec.js";
import type { WorktreeMarkerReadResult } from "./worktree-marker.js";

/** Inputs for the merged-check. */
export interface IsBranchMergedOptions {
  exec: GitExec;
  /** Branch (or commit) tested for being merged into `target`. */
  branch: string;
  /** Integration target the branch is tested against (e.g. `main`, `origin/main`). */
  target: string;
  /** Working directory pinned for the git invocation. */
  cwd?: string;
}

/**
 * Whether `branch`'s tip is reachable from `target` — i.e. the branch is
 * merged. Implemented with `git merge-base --is-ancestor` (exit 0 → merged). A
 * non-zero exit (not an ancestor) or any exec failure reads as not merged, the
 * safe default — uncertainty never yields a removal offer downstream.
 *
 * @param options - Executor, branch, integration target, optional cwd
 * @returns Whether the branch is merged into the target
 */
export async function isBranchMerged(options: IsBranchMergedOptions): Promise<boolean> {
  const { exec, branch, target, cwd } = options;
  const execOptions: GitExecOptions | undefined = cwd === undefined ? undefined : { cwd };
  try {
    await exec("git", ["merge-base", "--is-ancestor", branch, target], execOptions);
    return true;
  } catch {
    return false;
  }
}

/** Cleanup action for an ARC-managed worktree at a removal site. */
export type WorktreeCleanupDecision =
  | { action: "offer-remove" }
  | { action: "surface"; reason: "uncommitted" | "unmerged" }
  | { action: "advisory" };

/** Signals the cleanup decision is computed from. */
export interface WorktreeCleanupInputs {
  /** Result of reading the worktree-ownership marker. */
  marker: WorktreeMarkerReadResult;
  /** Whether the working tree is clean (no uncommitted changes). */
  clean: boolean;
  /** Whether the branch is merged into the integration target. */
  merged: boolean;
}

/**
 * Map a marker read result plus the clean/merged signals to a cleanup action.
 *
 * - No trustworthy marker (`absent` or `malformed`) → `advisory`: the worktree
 *   is treated as externally managed; cleanup is advised, never offered.
 * - Present but uncommitted changes → `surface` (`uncommitted`): never
 *   auto-remove; the dirty state is shown.
 * - Present and clean but unmerged → `surface` (`unmerged`): the branch (or its
 *   unpushed commits) is not in the target; never auto-remove.
 * - Present + clean + merged → `offer-remove`: the only state that offers an
 *   (interlock-gated) `git worktree remove`.
 *
 * @param inputs - Marker read result plus clean and merged signals
 * @returns The cleanup action for this worktree
 */
export function decideWorktreeCleanup(inputs: WorktreeCleanupInputs): WorktreeCleanupDecision {
  const { marker, clean, merged } = inputs;
  if (marker.kind !== "present") {
    return { action: "advisory" };
  }
  if (!clean) {
    return { action: "surface", reason: "uncommitted" };
  }
  if (!merged) {
    return { action: "surface", reason: "unmerged" };
  }
  return { action: "offer-remove" };
}
