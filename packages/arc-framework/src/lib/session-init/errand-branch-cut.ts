/**
 * `cutErrandBranch` — the errand-launch branch-cut mechanic.
 *
 * Cuts the `chore/<slug>` branch off a resolved base, the create-side
 * counterpart to the post-merge teardown leg. The slug is consumed as the
 * errand's logical identity (`chore/<slug>` is its projection); identity is
 * never recovered by parsing the branch — the durable identity record is the
 * errand-lattice's. Creation only: occupying the branch (an ephemeral worktree
 * under full protection, or an in-place switch) is the caller's protection-mode
 * dispatch, not this leg's.
 *
 * The git seam is injected (three-layer architecture).
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";
import { DEFAULT_ERRAND_BRANCH_TYPE, type ErrandBranchType } from "../errand/branch-type.js";

/** Dependencies for {@link cutErrandBranch}. */
export interface CutErrandBranchContext {
  /** Git executor — runs `git show-ref` / `git branch`. */
  exec: GitExec;
}

/** Operands for {@link cutErrandBranch}. */
export interface CutErrandBranchParams {
  /** The errand slug — its logical identity; `<type>/<slug>` is the projection. */
  slug: string;
  /** The base branch the errand forks from (a resolved `branch.base`). */
  base: string;
  /** Branch nature-type prefixing the slug; defaults to `chore`. */
  type?: ErrandBranchType;
}

/** Outcome of an errand branch-cut. */
export interface CutErrandBranchResult {
  /** The errand branch name (`chore/<slug>`). */
  branch: string;
  /** True when this call created the branch; false when it already existed (no-clobber). */
  created: boolean;
}

/**
 * Cut `chore/<slug>` off `base`.
 *
 * No-clobber: an already-existing branch of that name is left untouched and
 * reported as `created: false` — a force-create would move the ref and drop the
 * commits already on it. The slug is consumed verbatim as logical identity;
 * `<type>/<slug>` is derived from it (the nature-type defaulting to `chore`),
 * never the reverse.
 *
 * @param ctx - Injected git seam.
 * @param params - The errand slug, the base to fork from, and the nature-type.
 * @returns The resolved branch name and whether this call created it.
 */
export async function cutErrandBranch(
  ctx: CutErrandBranchContext,
  params: CutErrandBranchParams,
): Promise<CutErrandBranchResult> {
  const slug = params.slug.trim();
  if (slug === "") throw new Error("cutErrandBranch: slug must be non-empty");
  const branch = `${params.type ?? DEFAULT_ERRAND_BRANCH_TYPE}/${slug}`;

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
