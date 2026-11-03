/** A registered worktree's lock, read from Git's own listing rather than through the code under test. */
import { resolve } from "node:path";
import type { GitExec } from "../../src/lib/git/exec.js";

/**
 * Read the lock Git records for a registered worktree.
 * @param exec - Git boundary in any checkout of the repository.
 * @param path - The worktree's path.
 * @returns Its lock reason, null for a lock with no reason, or undefined when it is not locked.
 */
export async function readWorktreeLock(exec: GitExec, path: string): Promise<string | null | undefined> {
  const { stdout } = await exec("git", ["worktree", "list", "--porcelain", "-z"]);
  for (const record of stdout.split("\0\0")) {
    const fields = record.split("\0").filter((field) => field !== "");
    const worktree = fields.find((field) => field.startsWith("worktree "));
    if (worktree === undefined || resolve(worktree.slice("worktree ".length)) !== resolve(path)) continue;
    const locked = fields.find((field) => field === "locked" || field.startsWith("locked "));
    if (locked === undefined) return undefined;
    return locked === "locked" ? null : locked.slice("locked ".length);
  }
  throw new Error(`${path} is not a registered worktree`);
}
