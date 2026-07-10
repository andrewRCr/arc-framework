/**
 * Orphan-branch sweep — cross-machine stale local-branch reaper.
 *
 * Integration deletes a work unit's remote head, but only the integrating
 * machine's teardown reaps the local branch — every sibling machine keeps a
 * `<type>/<name>` local whose upstream is now gone. The same shape arises from
 * `activate-work-unit`'s local-only `plan/<name> → <type>/<name>` rename.
 * Anchored at the primary worktree, this sweep enumerates every gone-upstream
 * type-prefixed local branch and resolves, for each, the safest cleanup offer
 * the orientation can render:
 *
 * - Slug matches a `completed/` archive record → the WU shipped; offer the
 *   re-runnable `arc teardown <name>` (its own containment guards decide the
 *   reap, so the offer is safe even when `merged` cannot be proven here).
 * - Otherwise, `merged` (commits landed in the integration base) gates the
 *   interlock-gated `git branch -d` offer; an unmerged orphan is surfaced as
 *   not-removable, never force-deleted.
 *
 * Excluded from the scan: bare (unprefixed) branches such as the base branch,
 * branches checked out in any worktree (the stale-worktree sweep's domain),
 * and branches carrying an errand record — the errand surfaces own their
 * resume / close-replay cleanup, and a bare `git branch -d` there would orphan
 * the record.
 *
 * Outside the primary worktree it returns nothing, so the resume path never
 * pays for the scan. Branch hygiene only: the sweep never infers work-unit
 * state from a branch's presence, and never offers `-D`.
 *
 * @module
 */

import { isLandedInBase } from "../git/branch-containment.js";
import type { GitExec } from "../git/exec.js";
import { listGoneUpstreamBranches } from "../git/gone-upstream-branches.js";
import type { WorktreeIdentity } from "../git/worktree-identity.js";
import {
  branchToWorkUnitSlug,
  readShippedWorkUnitsFromRef,
} from "../work-unit/completed-index.js";

/** The ref namespace scoping the sweep to local branches. */
const LOCAL_BRANCH_REF_PREFIX = "refs/heads/";

/** One gone-upstream local branch paired with its cleanup verdicts. */
export interface OrphanBranchReport {
  /** The local `<type>/<name>` branch whose upstream is gone. */
  branch: string;
  /**
   * Whether every commit on the branch has landed in the integration base.
   * Gates the `git branch -d` offer when the WU has no `completed/` record;
   * an unmerged orphan is surfaced as not-removable (never force-deleted).
   */
  merged: boolean;
  /**
   * The shipped work-unit name when the branch's slug matches a `completed/`
   * archive record — the orientation prefers the re-runnable
   * `arc teardown <name>` offer over a bare branch delete. `null` otherwise.
   */
  shippedWorkUnit: string | null;
}

export interface OrphanBranchSweepResult {
  /** Gone-upstream type-prefixed local branches, each with its cleanup verdicts. */
  orphans: OrphanBranchReport[];
}

export interface RunOrphanBranchSweepOptions {
  /** Physical-worktree identity — the sweep runs only when `primary`. */
  worktreeIdentity: WorktreeIdentity;
  /** Integration base branch short-name (e.g. `main`); the merged check targets `origin/<base>`. */
  baseBranch: string;
  /**
   * Branches carrying an errand record — excluded from the sweep; the errand
   * surfaces (resume, close replay) own their cleanup.
   */
  errandBranches: ReadonlySet<string>;
  exec: GitExec;
}

/**
 * Run the orphan-branch sweep: enumerate gone-upstream type-prefixed local
 * branches and resolve each one's merged-to-base and shipped-WU verdicts.
 *
 * Outside the primary worktree no git runs and the result is empty — the
 * sweep is a main-worktree-only hygiene check. The shipped-WU index (one
 * `ls-tree` over the remote base) is read only when the scan surfaced
 * candidates, so the clean path pays a single `for-each-ref`.
 *
 * @param options - Worktree identity, base branch, errand-branch exclusions, and the git executor
 * @returns The gone-upstream orphans, each with its cleanup verdicts
 */
export async function runOrphanBranchSweep(
  options: RunOrphanBranchSweepOptions,
): Promise<OrphanBranchSweepResult> {
  const { worktreeIdentity, baseBranch, errandBranches, exec } = options;
  if (worktreeIdentity.kind !== "primary") {
    return { orphans: [] };
  }

  const goneBranches = (await listGoneUpstreamBranches(exec, LOCAL_BRANCH_REF_PREFIX)).filter(
    (branch) => branchToWorkUnitSlug(branch) !== null && !errandBranches.has(branch),
  );
  if (goneBranches.length === 0) {
    return { orphans: [] };
  }

  const integrationTarget = `origin/${baseBranch}`;
  const shipped = await readShippedWorkUnitsFromRef(exec, integrationTarget);

  const orphans = await Promise.all(
    goneBranches.map(async (branch) => {
      const slug = branchToWorkUnitSlug(branch);
      return {
        branch,
        merged: await isLandedInBase(exec, branch, integrationTarget),
        shippedWorkUnit: slug !== null && shipped.has(slug) ? slug : null,
      };
    }),
  );

  return { orphans };
}
