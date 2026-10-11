/**
 * `.worktreeinclude` copying for ARC-created linked worktrees.
 *
 * A `.worktreeinclude` file at the primary checkout's root lists gitignore-syntax
 * patterns. Each untracked file in the primary checkout that one of them matches is
 * copied into a fresh linked worktree when the new worktree's own ignore rules ignore
 * it, so local-only files such as `.env` follow each new checkout without being
 * committed. A file the new worktree would not ignore is never copied: it would leave
 * that worktree dirty. Ignore status is read from the new worktree rather than the
 * primary because the two can be checked out at commits with different `.gitignore`s.
 *
 * @module
 */

import { cp } from "node:fs/promises";
import { join } from "node:path";

import type { GitExec } from "./exec.js";
import { isGitProcessError } from "./process-error.js";

/** Primary-checkout file listing the gitignored paths copied into new linked worktrees. */
const WORKTREE_INCLUDE_FILE = ".worktreeinclude";

/** Filesystem operations used to copy `.worktreeinclude` matches. */
export interface WorktreeIncludeFs {
  /** Return true when any filesystem entry occupies `path`. */
  pathExists(path: string): Promise<boolean>;
  /** Copy one file, creating parent directories, unless the destination already exists. */
  copyFileIfAbsent(source: string, destination: string): Promise<void>;
}

/** Git and filesystem boundaries for {@link copyWorktreeIncludes}. */
export interface WorktreeIncludeContext {
  exec: GitExec;
  fs: WorktreeIncludeFs;
}

/**
 * List the primary checkout's untracked files that `.worktreeinclude` matches.
 *
 * Paths under `.arc/` are never listed; ARC owns that state in each checkout.
 *
 * @param exec - Git executor.
 * @param primaryWorktreePath - Primary checkout holding `.worktreeinclude`.
 * @returns Repository-relative paths in Git's listing order.
 */
async function listWorktreeIncludeCandidates(
  exec: GitExec,
  primaryWorktreePath: string,
): Promise<string[]> {
  const { stdout } = await exec("git", [
    "ls-files",
    "--others",
    "--ignored",
    "-z",
    `--exclude-from=${join(primaryWorktreePath, WORKTREE_INCLUDE_FILE)}`,
  ], { cwd: primaryWorktreePath, preserveOutput: true });
  return stdout.split("\0").filter((path) => path !== "" && !isArcPath(path));
}

/**
 * Report whether a checkout's own ignore rules ignore a path.
 *
 * One `check-ignore` call per path, answered by its exit status: a batched call
 * names the ignored paths only on stdout, which quotes unusual names unless `-z`,
 * and `-z` reads its paths from stdin. The `./` prefix keeps a name starting with
 * `:` from being read as pathspec magic.
 *
 * @param exec - Git executor.
 * @param checkoutPath - Checkout whose ignore rules apply.
 * @param path - Repository-relative path, which need not exist.
 * @returns True when the path is ignored and untracked there.
 */
async function isIgnoredIn(exec: GitExec, checkoutPath: string, path: string): Promise<boolean> {
  try {
    await exec("git", ["check-ignore", "-q", "--", `./${path}`], { cwd: checkoutPath });
    return true;
  } catch (error) {
    if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1) return false;
    throw error;
  }
}

/**
 * Copy the primary checkout's `.worktreeinclude` matches into a linked worktree.
 *
 * A missing `.worktreeinclude` copies nothing, a match the linked worktree would
 * not ignore is skipped, and a file already present there is left as it is.
 *
 * @param context - Git and filesystem boundaries.
 * @param primaryWorktreePath - Primary checkout holding `.worktreeinclude` and the source files.
 * @param worktreePath - Linked worktree receiving the copies.
 * @throws When listing or copying fails.
 */
export async function copyWorktreeIncludes(
  context: WorktreeIncludeContext,
  primaryWorktreePath: string,
  worktreePath: string,
): Promise<void> {
  if (!(await context.fs.pathExists(join(primaryWorktreePath, WORKTREE_INCLUDE_FILE)))) return;
  try {
    for (const path of await listWorktreeIncludeCandidates(context.exec, primaryWorktreePath)) {
      if (!(await isIgnoredIn(context.exec, worktreePath, path))) continue;
      await context.fs.copyFileIfAbsent(join(primaryWorktreePath, path), join(worktreePath, path));
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${WORKTREE_INCLUDE_FILE} copy failed: ${detail}`, { cause: error });
  }
}

/**
 * Production {@link WorktreeIncludeFs.copyFileIfAbsent}: copies a symlink as a link.
 *
 * @param source - File in the primary checkout.
 * @param destination - Path in the linked worktree.
 */
export async function nodeCopyFileIfAbsent(source: string, destination: string): Promise<void> {
  await cp(source, destination, { force: false, errorOnExist: false, verbatimSymlinks: true });
}

function isArcPath(path: string): boolean {
  return path.split("/", 1)[0]?.toLowerCase() === ".arc";
}
