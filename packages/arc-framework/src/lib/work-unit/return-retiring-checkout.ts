/** Return a clean checkout off a branch ARC will reap; retain every dirty checkout coordinate. */
import type { GitExec } from "../git/exec.js";
import { readCheckoutChanges } from "../git/worktree-removal.js";
import type { RegisteredWorktree } from "../git/worktree-roster.js";
/** Clean return or preservation report used independently of checkout ownership. */
export type RetiringCheckoutReturn = { kind: "returned"; notice: string } | { kind: "kept"; notice: string };
/** Leave dirty work untouched; where another checkout holds base, detach at its exact tip. */
export async function returnRetiringCheckout(options: {
  exec: GitExec; checkoutPath: string; branch: string; baseBranch: string; baseOid: string;
  worktrees: readonly RegisteredWorktree[]; folderExists: (path: string) => Promise<boolean>;
}): Promise<RetiringCheckoutReturn> {
  const changes = await readCheckoutChanges(options.exec, options.checkoutPath);
  if (changes.kind === "unobservable") return { kind: "kept", notice: `Kept ${options.branch}: checkout changes could not be observed (${changes.detail}); inspect it and retry.` };
  if (changes.paths.length !== 0) return { kind: "kept", notice: `Kept ${options.branch} at ${options.checkoutPath}: uncommitted changes ${changes.paths.join(", ")}; preserve or discard them and retry teardown.` };
  let busy = false;
  for (const item of options.worktrees) {
    if (item.branch === options.baseBranch && item.path !== options.checkoutPath && await options.folderExists(item.path)) busy = true;
  }
  if (busy) await options.exec("git", ["switch", "--detach", options.baseOid], { cwd: options.checkoutPath });
  else {
    await options.exec("git", ["switch", options.baseBranch], { cwd: options.checkoutPath });
    await options.exec("git", ["merge", "--ff-only", options.baseOid], { cwd: options.checkoutPath });
  }
  return { kind: "returned", notice: `Returned ${options.checkoutPath} to ${busy ? `detached base ${options.baseOid}` : options.baseBranch} before reaping ${options.branch}.` };
}
