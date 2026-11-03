/** Where a checkout's projection state lives: `arc-projection/` in its own Git directory, found without Git. */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { readCommonDirectory, readGitDirectories, type GitDirectoryFileAccess } from "../../git/directories.js";
import { resolveCheckoutGitDir, type GitExec } from "../../git/exec.js";

/** The folder in a worktree's Git directory that holds its index, projection lock, and kept copies. */
export const PROJECTION_STATE_FOLDER = "arc-projection";

/** A checkout's Git directories, whether it is the primary, and its projection state folder. */
export interface ProjectionLocation {
  readonly gitDir: string;
  readonly commonDir: string;
  readonly primary: boolean;
  readonly stateDir: string;
}

/**
 * Locate a checkout's projection state from its `.git`.
 * @param checkout - The checkout root.
 * @param input - File access for Git's markers, and the Git process used only where they do not read.
 * @returns Its Git directories, whether it is the primary, and its state folder.
 */
export async function locateProjection(
  checkout: string, input: { fs: GitDirectoryFileAccess; exec: GitExec },
): Promise<ProjectionLocation> {
  const { gitDir, commonDir } = await readGitDirectories(checkout, input.fs).catch(async () => {
    // Neither a folder nor a `gitdir:` marker read, so only here does Git run.
    const fallback = await resolveCheckoutGitDir(input.exec, checkout);
    return { gitDir: fallback, commonDir: await readCommonDirectory(fallback, input.fs) };
  });
  // The primary's Git directory holds no `commondir`, being the common one.
  return { gitDir, commonDir, primary: commonDir === gitDir, stateDir: join(gitDir, PROJECTION_STATE_FOLDER) };
}

/**
 * Create the state folder inside an existing Git directory.
 * @param location - The located checkout.
 * @returns `ready` once the folder exists, or `gone` where the Git directory no longer does.
 */
export async function ensureProjectionStateFolder(location: ProjectionLocation): Promise<"ready" | "gone"> {
  // Non-recursive, so a worktree whose Git directory was removed is never recreated.
  try {
    await mkdir(location.stateDir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return "gone";
    if (code !== "EEXIST") throw error;
  }
  return "ready";
}
