/** Read existing projection authority for an advisory without creating projection state. */
import { lstat, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { readGitDirectories } from "../git/directories.js";
import { readProjectionIndex, type ProjectionIndexRead } from "../store/projection/index-file.js";
import { PROJECTION_STATE_FOLDER } from "../store/projection/location.js";

/** Missing checkout metadata carries no projection; unreadable authority remains an explicit advisory refusal. */
export async function readOverlapIndex(checkout: string): Promise<ProjectionIndexRead> {
  try {
    const { gitDir, commonDir } = await readGitDirectories(checkout, { lstat, realpath, readFile: path => readFile(path, "utf8") });
    return await readProjectionIndex({ gitDir, commonDir, primary: gitDir === commonDir,
      stateDir: join(gitDir, PROJECTION_STATE_FOLDER) }, false);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? { kind: "no-projection" }
      : { kind: "unusable", cause: "unreadable" };
  }
}
