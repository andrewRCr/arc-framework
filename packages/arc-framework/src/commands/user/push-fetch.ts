import { notesRef } from "./shared.js";
import { clearPartialPushMarker, runUserLoad } from "./save-load.js";
import type {
  UserFetchOptions,
  UserIOContext,
  UserPullOptions,
  UserPushOptions,
} from "./types.js";

/**
 * Push user notes ref to remote origin.
 *
 * @param options - Push options
 */
export async function runUserPush(options: UserPushOptions): Promise<void> {
  const { cwd, io, identity, force } = options;
  const ref = `refs/notes/${notesRef(identity)}`;
  const args = force ? ["push", "--force", "origin", ref] : ["push", "origin", ref];
  await io.exec("git", args);
  if (cwd) {
    await clearPartialPushMarker(cwd, io, identity);
  }
}

/**
 * Check whether the remote has the notes ref for a given identity.
 * Returns true if remote ref exists, false otherwise.
 */
export async function hasRemoteNotes(
  io: UserIOContext,
  identity: string,
): Promise<boolean> {
  try {
    const ref = `refs/notes/${notesRef(identity)}`;
    const { stdout } = await io.exec("git", ["ls-remote", "origin", ref]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Check whether local notes ref exists for a given identity.
 * Returns true if the local ref has at least one note.
 */
export async function hasLocalNotes(
  io: UserIOContext,
  identity: string,
): Promise<boolean> {
  try {
    const { stdout } = await io.exec("git", ["notes", "--ref", notesRef(identity), "list"]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Fetch user notes ref from remote origin.
 *
 * @param options - Fetch options
 */
export async function runUserFetch(options: UserFetchOptions): Promise<void> {
  const { io, identity, force } = options;
  const ref = `refs/notes/${notesRef(identity)}`;
  const refspec = force ? `+${ref}:${ref}` : `${ref}:${ref}`;
  await io.exec("git", ["fetch", "origin", refspec]);
}

/**
 * Fetch user notes from remote and restore them to disk.
 *
 * @param options - Pull options
 * @returns Load result, or null if no note was found after fetch
 */
export async function runUserPull(
  options: UserPullOptions,
) {
  const { cwd, io, identity, force, maxAncestorWalk } = options;
  await runUserFetch({ io, identity, force });
  return runUserLoad({ cwd, io, identity, maxAncestorWalk });
}
