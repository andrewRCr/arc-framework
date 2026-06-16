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
 * `activate`, the preserve at `park@Active`, and the local + remote teardown at
 * `park@Planning` / pre-merge `abandon`. Branch *creation* is realized two ways:
 * **spawn-backed** (the default — the branch rides `reconcile-worktree`'s `git
 * worktree add -b`, so this leg stays inert) and **in-place** (the `--here`
 * no-spawn path — a current-worktree `git checkout -b`, no operand → no-op).
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
 * - `delete` — tear down `branch` locally and on `remote` (default `origin`).
 * - `preserve` — leave the branch untouched (`park@Active` keeps the pushed
 *   branch as the durable shelf).
 * - `create` — realize the branch. **Spawn-backed** (`inPlace` absent): a no-op,
 *   the worktree-spawn leg's `-b` creates the branch. **In-place** (`inPlace`
 *   present, the `--here` no-spawn path): `git checkout -b` cuts the branch in the
 *   current worktree, off current HEAD.
 */
export type ReconcileBranchOp =
  | { mutation: "rename"; branch: string; toBranch: string }
  | { mutation: "delete"; branch: string; remote?: string }
  | { mutation: "preserve" }
  | { mutation: "create"; inPlace?: { branch: string } };

/**
 * Reconcile a work unit's branch per `op`.
 *
 * Rotate renames locally (`git branch -m`); teardown force-deletes the local
 * branch (`git branch -D`) then best-effort deletes the remote ref — an unpushed
 * planning branch has no remote to delete, so that failure is swallowed while the
 * authoritative local teardown still lands. Preserve performs no git operation;
 * create performs one only on the in-place path (`git checkout -b`), staying
 * inert when the worktree-spawn leg owns the branch birth.
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
      } catch {
        // Best-effort: a never-pushed branch has no remote ref to delete; the
        // local force-delete above is the authoritative teardown.
      }
      return;
    }
    case "create":
      // In-place (`--here`): cut the branch in the current worktree off HEAD.
      // Spawn-backed (no `inPlace`): inert — `reconcile-worktree`'s `-b` owns it.
      if (op.inPlace !== undefined) {
        await ctx.exec("git", ["checkout", "-b", op.inPlace.branch]);
      }
      return;
    case "preserve":
      return;
  }
}
