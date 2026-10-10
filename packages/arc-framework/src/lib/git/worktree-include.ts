/**
 * `.worktreeinclude` copying for ARC-created linked worktrees.
 *
 * A `.worktreeinclude` file at the primary checkout's root lists gitignore-syntax
 * patterns. Every untracked, gitignored file in the primary checkout that one of
 * them matches is copied into a fresh linked worktree, so local-only files such as
 * `.env` follow each new checkout without being committed. Files that are tracked,
 * or untracked but not ignored, are never copied: they would either duplicate the
 * checkout's own content or leave the new worktree dirty.
 *
 * @module
 */

import { cp } from "node:fs/promises";
import { join } from "node:path";

import type { GitExec } from "./exec.js";
import { partitionGitPathspecBatches } from "./pathspec-batches.js";

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
 * List the primary checkout's untracked, gitignored files that `.worktreeinclude` matches.
 *
 * Paths under `.arc/` are never listed; ARC owns that state in each checkout.
 *
 * @param exec - Git executor.
 * @param primaryWorktreePath - Primary checkout holding `.worktreeinclude`.
 * @returns Repository-relative paths in Git's listing order.
 */
async function listWorktreeIncludePaths(
  exec: GitExec,
  primaryWorktreePath: string,
): Promise<string[]> {
  const options = { cwd: primaryWorktreePath, preserveOutput: true };
  const matched = await exec("git", [
    "ls-files",
    "--others",
    "--ignored",
    "-z",
    `--exclude-from=${join(primaryWorktreePath, WORKTREE_INCLUDE_FILE)}`,
  ], options);
  const candidates = splitNulRecords(matched.stdout).filter((path) => !isArcPath(path));
  const included: string[] = [];
  for (const pathspecs of partitionGitPathspecBatches(candidates)) {
    const ignored = await exec("git", [
      "ls-files",
      "--others",
      "--ignored",
      "--exclude-standard",
      "-z",
      "--",
      ...pathspecs,
    ], options);
    included.push(...splitNulRecords(ignored.stdout));
  }
  return included;
}

/**
 * Copy the primary checkout's `.worktreeinclude` matches into a linked worktree.
 *
 * A missing `.worktreeinclude` copies nothing, and a file already present in the
 * linked worktree is left as it is.
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
    for (const path of await listWorktreeIncludePaths(context.exec, primaryWorktreePath)) {
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

function splitNulRecords(stdout: string): string[] {
  return stdout.split("\0").filter((record) => record !== "");
}

function isArcPath(path: string): boolean {
  return path.split("/", 1)[0]?.toLowerCase() === ".arc";
}
