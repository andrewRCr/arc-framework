/** Branch occupancy retained by live checkouts and deliberately locked registrations. */

import type { RegisteredWorktree } from "../git/worktree-roster.js";

/** Find a branch holder, including a locked checkout temporarily absent from disk. */
export function findErrandBranchOccupant(
  worktrees: readonly RegisteredWorktree[],
  branch: string,
): RegisteredWorktree | undefined {
  return worktrees.find((worktree) => worktree.branch === branch
    && (worktree.folderPresent || worktree.locked !== undefined));
}

/** Describe the holder and the deliberate repair needed for an absent locked checkout. */
export function describeErrandBranchOccupant(worktree: RegisteredWorktree): string {
  if (!worktree.folderPresent && worktree.locked !== undefined) {
    return `Local Errand branch is held by locked registered worktree '${worktree.path}'. `
      + "Restore that checkout, or if intentionally retired, unlock and prune its registration "
      + "with git worktree unlock and git worktree prune, then retry.";
  }
  return `Local Errand branch is checked out by registered worktree '${worktree.path}'.`;
}
