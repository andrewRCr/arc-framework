/**
 * `plan/`-orphan sweep — cross-machine stale planning-branch reaper.
 *
 * `activate-work-unit` renames a `plan/<name>` planning branch to its working
 * `<type>/<name>` branch locally; the rename never propagates, so a sibling
 * machine that did not activate keeps a `plan/<name>` whose upstream is now
 * gone. Anchored at the primary worktree, this sweep enumerates those
 * gone-upstream `plan/` branches and resolves, for each, whether its commits
 * have landed in the integration base — the merged-only-safe gate for the
 * `git branch -d` offer the orientation renders. Outside the primary worktree
 * it returns nothing, so the resume path never pays for the scan.
 *
 * Branch hygiene only: the sweep never infers work-unit state from a branch's
 * presence, and never offers `-D`. A gone-upstream-but-unmerged branch is
 * surfaced as not-removable, never force-deleted.
 *
 * @module
 */

import { isLandedInBase } from "../git/branch-containment.js";
import type { GitExec } from "../git/exec.js";
import { listGoneUpstreamBranches } from "../git/gone-upstream-branches.js";
import type { WorktreeIdentity } from "../git/worktree-identity.js";

/** The ref namespace scoping the sweep to local planning branches. */
const PLAN_BRANCH_REF_PREFIX = "refs/heads/plan/";

/** One gone-upstream `plan/` branch paired with its merged-to-base safety verdict. */
export interface PlanOrphanReport {
  /** The local `plan/<name>` branch whose upstream is gone. */
  branch: string;
  /**
   * Whether every commit on the branch has landed in the integration base. Only
   * a merged orphan earns the `git branch -d` offer; an unmerged one is
   * surfaced as not-removable (never force-deleted).
   */
  merged: boolean;
}

export interface PlanOrphanSweepResult {
  /** Gone-upstream `plan/` branches, each with its merged-to-base verdict. */
  orphans: PlanOrphanReport[];
}

export interface RunPlanOrphanSweepOptions {
  /** Physical-worktree identity — the sweep runs only when `primary`. */
  worktreeIdentity: WorktreeIdentity;
  /** Integration base branch short-name (e.g. `main`); the merged check targets `origin/<base>`. */
  baseBranch: string;
  exec: GitExec;
}

/**
 * Run the `plan/`-orphan sweep: enumerate gone-upstream `plan/` branches and
 * resolve each one's merged-to-base verdict.
 *
 * Outside the primary worktree no git runs and the result is empty — the
 * sweep is a main-worktree-only hygiene check.
 *
 * @param options - Worktree identity, base branch, and the git executor
 * @returns The gone-upstream `plan/` orphans, each with its merged verdict
 */
export async function runPlanOrphanSweep(
  options: RunPlanOrphanSweepOptions,
): Promise<PlanOrphanSweepResult> {
  const { worktreeIdentity, baseBranch, exec } = options;
  if (worktreeIdentity.kind !== "primary") {
    return { orphans: [] };
  }

  const goneBranches = await listGoneUpstreamBranches(exec, PLAN_BRANCH_REF_PREFIX);
  const integrationTarget = `origin/${baseBranch}`;

  const orphans = await Promise.all(
    goneBranches.map(async (branch) => ({
      branch,
      merged: await isLandedInBase(exec, branch, integrationTarget),
    })),
  );

  return { orphans };
}
