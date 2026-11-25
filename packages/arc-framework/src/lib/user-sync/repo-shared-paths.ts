/**
 * Repo-shared user-sync paths rooted in Git's common directory.
 *
 * These paths are machine-local but shared by every linked worktree for the
 * repository. They are deliberately outside the worktree's `.arc/user` tree so
 * per-machine guards and provenance do not pollute checkout-local user state.
 *
 * @module
 */

import { join } from "node:path";

import { resolveGitCommonDir, type GitExec } from "../git/exec.js";

const REPO_SHARED_ARC_DIR = "arc";
const REPO_SHARED_USER_DIR = "user";
const REPO_SHARED_INTERNAL_DIR = ".internal";

/** Absolute path to a user's repo-shared `.internal/` directory. */
export async function getRepoSharedUserInternalDir(
  exec: GitExec,
  cwd: string,
  identity: string,
): Promise<string> {
  const commonDir = await resolveGitCommonDir(exec, cwd);
  return join(commonDir, REPO_SHARED_ARC_DIR, REPO_SHARED_USER_DIR, identity, REPO_SHARED_INTERNAL_DIR);
}
