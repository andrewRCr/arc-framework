/**
 * `cutErrandBranch` — the errand-launch branch-cut mechanic.
 *
 * Cuts the branch an errand's identity record names off a resolved base, the create-side counterpart to the
 * post-merge teardown leg. The record is the errand's durable identity, so the branch is taken from it as named,
 * suffix and all, and never rebuilt from the slug. Creation only: occupying the branch (an ephemeral worktree under
 * full protection, or an in-place switch) is the caller's protection-mode dispatch, not this leg's.
 *
 * The git seam is injected (three-layer architecture).
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";

/** Dependencies for {@link cutErrandBranch}. */
export interface CutErrandBranchContext {
  /** Git executor — runs `git show-ref` / `git branch`. */
  exec: GitExec;
}

/** Operands for {@link cutErrandBranch}. */
export interface CutErrandBranchParams {
  /** The branch the errand's record names. */
  branch: string;
  /** The base branch the errand forks from (a resolved `branch.base`). */
  base: string;
}

/** Outcome of an errand branch-cut. */
export interface CutErrandBranchResult {
  /** The errand branch name, as the record names it. */
  branch: string;
  /** True when this call created the branch; false when it already existed (no-clobber). */
  created: boolean;
}

/**
 * Cut the errand's recorded branch off `base`.
 *
 * No-clobber: an already-existing branch of that name is left untouched and
 * reported as `created: false` — a force-create would move the ref and drop the
 * commits already on it.
 *
 * @param ctx - Injected git seam.
 * @param params - The recorded branch and the base to fork from.
 * @returns The branch name and whether this call created it.
 */
export async function cutErrandBranch(
  ctx: CutErrandBranchContext,
  params: CutErrandBranchParams,
): Promise<CutErrandBranchResult> {
  const branch = params.branch.trim();
  if (branch === "") throw new Error("cutErrandBranch: branch must be non-empty");

  if (await branchExists(ctx.exec, branch)) return { branch, created: false };

  await ctx.exec("git", ["branch", branch, params.base]);
  return { branch, created: true };
}

/** Whether a local branch ref exists (`git show-ref --verify --quiet`). */
async function branchExists(exec: GitExec, branch: string): Promise<boolean> {
  try {
    await exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}
