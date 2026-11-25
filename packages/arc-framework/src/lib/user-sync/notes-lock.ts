/** Repository-shared path policy for the per-identity user-notes lock. */

import { join } from "node:path";

import type { GitExec } from "../git/exec.js";

import { getRepoSharedUserInternalDir } from "./repo-shared-paths.js";

/** Notes write lockfile name under the repo-shared git common dir. */
const NOTES_LOCK_FILENAME = ".notes.lock";

/**
 * Resolve the repo-shared notes-write lockfile for an identity.
 *
 * @param exec - Git executor used to locate the repository common directory.
 * @param cwd - Checkout whose repository owns the lock.
 * @param identity - User identity serialized by the lock.
 * @returns Absolute path to the identity's notes lockfile.
 */
export async function getNotesLockPath(exec: GitExec, cwd: string, identity: string): Promise<string> {
  return join(await getRepoSharedUserInternalDir(exec, cwd, identity), NOTES_LOCK_FILENAME);
}
