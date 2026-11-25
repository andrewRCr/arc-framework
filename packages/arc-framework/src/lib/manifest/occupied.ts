/**
 * Files already present at the paths an install writes for the first time — refused so nothing ARC never installed is
 * overwritten.
 *
 * `arc init` and an update's additions write paths ARC has not installed before. A file already there belongs to the
 * project or to an earlier tree, committed or ignored, and writing over it would replace it without notice; an ignored
 * one could not be restored. A file that already holds exactly what would be written is not a conflict, so a retry
 * after a partly applied run continues. A symbolic link on the path is refused before this check runs.
 *
 * @module
 */

import { join } from "node:path";

import { UserFacingError } from "../errors.js";
import type { ReadFileFn } from "../template/index.js";

/** A file an install would write for the first time, and the content it would write. */
export interface FirstWrite {
  /** Repository-relative path, `/`-separated */
  path: string;
  content: string;
}

/** Read errors meaning something other than a readable file already sits at or above the path. */
const OCCUPIED_READ_ERRORS = new Set(["EISDIR", "ENOTDIR"]);

/**
 * Find the writes that would replace something already at their path with different content.
 *
 * @param root - Repository root the paths are relative to
 * @param writes - The files an install would write for the first time
 * @param readFile - Reads a file's current content
 * @returns The occupied writes' paths, in input order
 */
export async function findOccupiedPaths(
  root: string,
  writes: readonly FirstWrite[],
  readFile: ReadFileFn,
): Promise<string[]> {
  const occupied: string[] = [];
  for (const write of writes) {
    const path = join(root, write.path);
    let current: string;
    try {
      current = await readFile(path);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") continue;
      if (code !== undefined && OCCUPIED_READ_ERRORS.has(code)) {
        occupied.push(write.path);
        continue;
      }
      throw err;
    }
    if (current !== write.content) occupied.push(write.path);
  }
  return occupied;
}

/** How many occupied paths the refusal names before counting the rest. */
const NAMED_PATH_LIMIT = 10;

/**
 * Build the refusal for an install that would overwrite files already at the paths it writes for the first time.
 *
 * @param paths - Repository-relative paths that already hold other content
 * @param command - The refusing command
 * @returns The user-facing refusal, naming the files and the remedy
 */
export function occupiedPathsError(
  paths: readonly string[],
  command: "init" | "update" | "reconfigure",
): UserFacingError {
  const named = paths.slice(0, NAMED_PATH_LIMIT).join(", ");
  const files = paths.length > NAMED_PATH_LIMIT ? `${named}, and ${paths.length - NAMED_PATH_LIMIT} more` : named;
  const retry = command === "update" ? "arc update" : "arc init --reconfigure";
  return new UserFacingError({
    code: "manifest.install-paths-occupied",
    whatHappened: `${command} would overwrite files ARC did not install`,
    why: `These paths already hold other content: ${files}. ${command === "init" ? "Installing" : "Adding"} ARC's `
      + "files there would replace them, and a file Git ignores could not be restored.",
    whatToDo: command === "init"
      ? "Move these files aside, or the existing .arc/ directory if they belong to an earlier installation, then retry "
        + "`arc init`."
      : `Move or rename these files, then retry \`${retry}\`; it installs ARC's version at each path.`,
  });
}
