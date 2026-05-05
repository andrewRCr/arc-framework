/**
 * Worktree branch push helper — thin wrapper over `git push origin <branch>`.
 *
 * Internal seam shared by `handlers/sync.ts:executeSingleLeg` and
 * `commands/user/paired-push.ts:runPairedPush`. Centralizes the worktree-leg
 * push call site so push wrappers can swap the implementation without
 * re-extracting from raw `git push` call sites.
 *
 * Pushability gating is the caller's responsibility — this helper does not
 * run the pushability matrix. Callers route through `runPushabilityStatus`
 * (with their target) before invocation when needed; advisory dispositions
 * (`force-push-required`) require the caller to refuse explicitly.
 *
 * Not re-exported from `lib/git/index.ts` — kept at internal scope until a
 * downstream consumer commits to the public surface.
 *
 * @module
 */

import type { GitExec } from "./exec.js";

export interface PushWorktreeBranchOptions {
  exec: GitExec;
  branch: string;
}

/** Discriminated outcome of a worktree branch push attempt. */
export type PushWorktreeBranchResult =
  | { status: "success" }
  | { status: "failed"; error: Error };

/**
 * Push the named worktree branch to `origin`.
 *
 * Returns `{ status: "success" }` on a successful push, `{ status: "failed",
 * error }` when git rejects or the executor throws. Errors are normalized to
 * `Error` so callers don't need a separate type-narrowing branch.
 */
export async function pushWorktreeBranch(
  options: PushWorktreeBranchOptions,
): Promise<PushWorktreeBranchResult> {
  const { exec, branch } = options;
  try {
    await exec("git", ["push", "origin", branch]);
    return { status: "success" };
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
