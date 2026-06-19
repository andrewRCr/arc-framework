/**
 * `reconcile-branch` — the branch-axis encoding mutator.
 *
 * Reconciles a work unit's branch to a transition's `(phase, location)`
 * direction — *rotate*, *preserve*, or *tear down* — identically in both
 * protection modes (a tracked WU at an active location owns its single branch in
 * `full` and `partial` alike; a backlog-tier stub is branchless in both). The
 * leg keys on direction alone, never the protection mode.
 *
 * It owns the **standalone** branch operations: the `plan/ → <type>/` rotate at
 * `activate`, the preserve at `park@Active`, the local + remote teardown at
 * `park@Planning` / pre-merge `abandon`, and the merged-safe local delete the
 * post-merge teardown verb uses. Branch *creation* is not a standalone op here —
 * `reconcile-worktree` owns branch birth in both placement modes (spawn via
 * `git worktree add -b`, in-place via `git checkout -b`); `create` is a no-op in
 * this leg.
 *
 * Branch deletion targets the *current* branch of the WU's worktree, so the
 * executor sequences a worktree teardown (with locus-hop) ahead of it — this leg
 * runs the bare `git branch -D` and is not responsible for that ordering.
 *
 * The git seam is injected (three-layer architecture).
 *
 * @module
 */

import type { GitExec } from "../../git/exec.js";

/** The default remote a teardown deletes the branch from. */
const DEFAULT_REMOTE = "origin";

/** Dependencies for {@link reconcileBranch}. */
export interface ReconcileBranchContext {
  /** Git executor — runs `git branch` / `git push`. */
  exec: GitExec;
}

/**
 * The branch operation to perform, as a discriminated union so each mutation
 * carries exactly the operands it needs:
 *
 * - `rename` — rotate `branch` → `toBranch` (the `plan/ → <type>/` activate flip).
 * - `delete` — force-tear down `branch` locally and on `remote` (default `origin`);
 *   the park / pre-merge `abandon` path, where the branch is discarded outright.
 * - `delete-merged` — a **local-only** merged-safe delete: remove `branch` only
 *   when its tip is contained in its upstream (`remote`/`branch`), so the commits
 *   are provably preserved on the remote. The post-merge teardown path; never
 *   touches the remote ref (that is where the work is kept).
 * - `preserve` — leave the branch untouched (`park@Active` keeps the pushed
 *   branch as the durable shelf).
 * - `create` — a no-op here; `reconcile-worktree` creates the branch (spawn via
 *   `git worktree add -b`, in-place via `git checkout -b`).
 */
export type ReconcileBranchOp =
  | { mutation: "rename"; branch: string; toBranch: string }
  | { mutation: "delete"; branch: string; remote?: string }
  | { mutation: "delete-merged"; branch: string; remote?: string }
  | { mutation: "preserve" }
  | { mutation: "create" };

/**
 * Reconcile a work unit's branch per `op`.
 *
 * Rotate renames locally (`git branch -m`); teardown force-deletes the local
 * branch (`git branch -D`) then best-effort deletes the remote ref — an unpushed
 * planning branch has no remote to delete, so that failure is swallowed while the
 * authoritative local teardown still lands. Merged-safe delete removes only the
 * local branch, and only when its tip is contained in its upstream. Preserve and
 * create perform no git operation.
 *
 * @param ctx - Injected git seam.
 * @param op - The branch mutation and its operands.
 */
export async function reconcileBranch(
  ctx: ReconcileBranchContext,
  op: ReconcileBranchOp,
): Promise<void> {
  switch (op.mutation) {
    case "rename":
      await ctx.exec("git", ["branch", "-m", op.branch, op.toBranch]);
      return;
    case "delete": {
      await ctx.exec("git", ["branch", "-D", op.branch]);
      const remote = op.remote ?? DEFAULT_REMOTE;
      try {
        await ctx.exec("git", ["push", remote, "--delete", op.branch]);
      } catch (err) {
        // Swallow only the benign case: a never-pushed branch has no remote ref
        // to delete (git reports "remote ref does not exist"), and the local
        // force-delete above is the authoritative teardown. Actionable failures
        // (auth, connectivity, wrong remote) must propagate so the executor
        // reports partial application instead of silently orphaning a remote ref.
        const detail =
          (err as { stderr?: string }).stderr ?? (err instanceof Error ? err.message : String(err));
        if (!/remote ref does not exist|unable to delete/i.test(detail)) throw err;
      }
      return;
    }
    case "delete-merged": {
      const remote = op.remote ?? DEFAULT_REMOTE;
      const upstream = `${remote}/${op.branch}`;
      // Prove the upstream exists. A never-pushed branch has no upstream to
      // contain it, so it can't be shown safe — refuse (no delete). The
      // WU-lifecycle caller only tears down shipped, pushed branches.
      try {
        await ctx.exec("git", ["rev-parse", "--verify", "--quiet", upstream]);
      } catch {
        return;
      }
      // Containment check: commits on `branch` not reachable from its upstream.
      // Empty output → the tip is fully contained → safe to delete regardless of
      // merge strategy (squash / rebase / merge-commit all land the commits in
      // the upstream). Non-empty → the branch is ahead; deleting would drop
      // unpushed work, so refuse.
      const { stdout } = await ctx.exec("git", ["rev-list", op.branch, `^${upstream}`]);
      if (stdout.trim() !== "") return;
      // Containment is proven, so force-delete: `-d` re-checks base-reachability,
      // which false-negatives under squash / rebase merges (the bug this guards).
      await ctx.exec("git", ["branch", "-D", op.branch]);
      return;
    }
    case "preserve":
    case "create":
      return;
  }
}
