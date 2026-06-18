/**
 * The `teardown` verb — post-merge physical cleanup of a shipped work unit.
 *
 * The deterministic cleanup hand-run today in the integration tail: reap the
 * merged branch, remove the worktree (worktree-kind dispatched, presence-guarded),
 * and prune the stale remote-tracking ref a delete-on-merge leaves behind. It
 * composes the shared legs — the merged-safe `reconcile-branch` delete, the
 * `reconcile-worktree` teardown, and the `fetch-prune` leg — never re-implementing
 * their mechanics.
 *
 * Teardown is **not** a lifecycle transition: the branch and worktree are
 * *projections*, not lifecycle state, so it does not run through the transition
 * table. It fires *after* merge, distinct from the pre-merge `archive` sweep.
 *
 * The two-part safety model (settled upstream):
 *
 * 1. **Arc-state authority** — the WU resides in `completed/` (the `archive`
 *    transition ran; the WU shipped as a lifecycle fact). Resolved from location
 *    via {@link isShipped}, never from `git branch` / `git log` inference.
 * 2. **Push-state durability** — every local commit on the branch is contained in
 *    its remote-tracking ref. Enacted by the merged-safe delete leg, and
 *    merge-strategy-independent (unlike `git branch -d`'s base-reachability test,
 *    which false-negatives under squash / rebase).
 *
 * The branch name is resolved by enumerating local refs and matching the WU slug
 * ({@link branchToWorkUnitSlug}) — a ref-projection lookup, type-prefix agnostic,
 * because the meta `Branch` field is cleared to `[none]` at archive. The legs fire
 * in the only constraint-safe order: worktree teardown (frees the checked-out
 * branch), then the branch delete, then the prune (so the containment check can
 * still read the stale `<remote>/<branch>` tracking ref before it is pruned).
 *
 * @module
 */

import type { GitExec } from "../../git/exec.js";
import {
  resolvePrimaryWorktreePath,
  resolveWorktreePathsByBranch,
} from "../../git/worktree-roster.js";
import { branchToWorkUnitSlug } from "../completed-index.js";
import { buildLifecycleIndex, type LifecycleIndexFs } from "../lifecycle-index.js";
import { isShipped } from "../lifecycle-resolver.js";
import { fetchPrune } from "../mutators/fetch-prune.js";
import { reconcileBranch } from "../mutators/reconcile-branch.js";
import { reconcileWorktree } from "../mutators/reconcile-worktree.js";

/** The seams `runTeardown` drives — the git executor (pinned to cwd), the index scan, and the locus-hop. */
export interface TeardownContext {
  /** Repository root containing `.arc/`. */
  cwd: string;
  /** Git executor, pinned to the repository root. */
  exec: GitExec;
  /** Lifecycle-index scan seam — backs the arc-state authority gate. */
  indexFs: LifecycleIndexFs;
  /** Relocate the process locus on a self-teardown (production binds `process.chdir`). */
  chdir: (dir: string) => void;
}

/** The operational inputs a `teardown` supplies. */
export interface TeardownParams {
  /** Target WU name (the CLI defaults this to the current worktree's WU). */
  name: string;
  /** Remote whose ref the containment check reads and the prune cleans (default `origin`). */
  remote?: string;
  /** Ephemeral next-step suggestion to surface (advisory; never persisted). */
  suggestion?: string;
}

/** The outcome of a `teardown` attempt — a rejection, or the completed cleanup. */
export type TeardownResult =
  | { status: "rejected"; reason: string }
  | {
      status: "torn-down";
      /** The reaped WU branch, or `null` when no local branch remained (already reaped). */
      branch: string | null;
      /** Whether the merged-safe delete removed the branch (false when the push-state gate refused it). */
      branchDeleted: boolean;
      /** The removed worktree path, or `null` for the in-place / already-absent arm. */
      worktreeRemoved: string | null;
      /** Whether the prune leg ran cleanly. */
      pruned: boolean;
      /** Non-fatal advisories (a push-state refusal, a best-effort prune failure). */
      notices: string[];
      /** The ephemeral next-step suggestion, surfaced not persisted. */
      suggestion: string | null;
    };

/**
 * Resolve the WU's local branch by enumerating `refs/heads` and matching the slug.
 * Type-prefix agnostic ({@link branchToWorkUnitSlug}), since the meta `Branch`
 * field is `[none]` post-archive. `null` means no local branch maps (already
 * reaped); an `error` means more than one does (ambiguous — refuse).
 */
async function resolveWuBranch(
  exec: GitExec,
  name: string,
): Promise<{ branch: string | null } | { error: string }> {
  let stdout: string;
  try {
    ({ stdout } = await exec("git", ["for-each-ref", "--format=%(refname:short)", "refs/heads"]));
  } catch {
    return { branch: null };
  }
  const matches = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .filter((branch) => branchToWorkUnitSlug(branch) === name);
  const [first, ...rest] = matches;
  if (first === undefined) return { branch: null };
  if (rest.length > 0) {
    return { error: `multiple local branches map to \`${name}\`: ${matches.join(", ")} — resolve manually.` };
  }
  return { branch: first };
}

/** Whether a local branch ref exists. */
async function branchExists(exec: GitExec, branch: string): Promise<boolean> {
  try {
    await exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run `teardown`: gate on `completed/` arc-state, resolve the WU branch, then
 * compose the cleanup legs in their constraint-safe order — worktree teardown
 * (linked arm only; the in-place / absent arm is a presence-guarded no-op), the
 * merged-safe branch delete (push-state gated), and the prune. Rejects a
 * not-yet-shipped WU, an ambiguous branch match, or a dirty linked worktree.
 *
 * @param ctx - The git executor, index-scan seam, and locus-hop.
 * @param params - The target WU (and an optional remote / next-step suggestion).
 * @returns A rejection or the completed cleanup report.
 */
export async function runTeardown(ctx: TeardownContext, params: TeardownParams): Promise<TeardownResult> {
  const { cwd, exec, indexFs, chdir } = ctx;
  const { name, remote, suggestion } = params;

  // 1. Arc-state authority gate — only a shipped (`completed/`) WU. Location, never git.
  const index = await buildLifecycleIndex({ cwd, fs: indexFs });
  if (!isShipped(index, name)) {
    return {
      status: "rejected",
      reason: `\`${name}\` has not shipped (no \`completed/\` presence) — teardown runs only after archive + merge.`,
    };
  }

  // 2. Resolve the WU branch by slug (type-prefix agnostic; meta `Branch` is `[none]` post-archive).
  const resolved = await resolveWuBranch(exec, name);
  if ("error" in resolved) return { status: "rejected", reason: resolved.error };
  const branch = resolved.branch;

  const notices: string[] = [];

  // 3. Worktree arm: tear down a *linked* worktree (distinct from the primary). The
  //    in-place arm (branch in the primary worktree) and an already-removed worktree
  //    are presence-guarded no-ops. Worktree first, so the branch delete in step 4
  //    is not refused for a checked-out branch.
  let worktreeRemoved: string | null = null;
  if (branch !== null) {
    const byBranch = await resolveWorktreePathsByBranch(exec);
    const worktreePath = byBranch.get(branch);
    const primary = await resolvePrimaryWorktreePath(exec);
    if (worktreePath !== undefined && worktreePath !== primary) {
      try {
        await reconcileWorktree({ exec, chdir }, { mutation: "teardown", worktreePath, currentLocus: cwd });
      } catch (err) {
        return { status: "rejected", reason: err instanceof Error ? err.message : String(err) };
      }
      worktreeRemoved = worktreePath;
    }
  }

  // 4. Merged-safe branch delete — the push-state gate lives in the leg. Local-only
  //    (the work is preserved on the remote). A refusal (branch ahead of / no
  //    upstream) leaves the branch intact; surface it rather than dropping work.
  let branchDeleted = false;
  if (branch !== null) {
    await reconcileBranch({ exec }, { mutation: "delete-merged", branch, remote });
    branchDeleted = !(await branchExists(exec, branch));
    if (!branchDeleted) {
      notices.push(
        `Branch \`${branch}\` is ahead of (or has no) upstream — left intact (unpushed commits would be lost).`,
      );
    }
  }

  // 5. Prune the stale remote-tracking ref a delete-on-merge left — last, after the
  //    step-4 containment check read it. Best-effort: a prune failure (offline) does
  //    not undo the completed branch/worktree teardown.
  let pruned = false;
  try {
    await fetchPrune({ exec }, { remote });
    pruned = true;
  } catch (err) {
    notices.push(`Could not prune stale tracking refs (${err instanceof Error ? err.message : String(err)}).`);
  }

  return {
    status: "torn-down",
    branch,
    branchDeleted,
    worktreeRemoved,
    pruned,
    notices,
    suggestion: suggestion ?? null,
  };
}
