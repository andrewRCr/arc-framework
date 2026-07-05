/**
 * Repo-shared user-sync paths rooted in Git's common directory.
 *
 * These paths are machine-local but shared by every linked worktree for the
 * repository. They are deliberately outside the worktree's `.arc/user` tree so
 * per-machine guards and provenance do not pollute checkout-local user state.
 *
 * @module
 */

import { isAbsolute, join, resolve } from "node:path";

import type { GitExec } from "../git/exec.js";

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

/** Resolve Git's common directory as an absolute path for the current worktree. */
export async function resolveGitCommonDir(exec: GitExec, cwd: string): Promise<string> {
  const { stdout } = await exec("git", ["rev-parse", "--git-common-dir"], { cwd });
  const commonDir = stdout.trim();
  if (commonDir.length === 0) {
    throw new Error("git rev-parse --git-common-dir returned an empty path");
  }
  return isAbsolute(commonDir) ? commonDir : resolve(cwd, commonDir);
}
