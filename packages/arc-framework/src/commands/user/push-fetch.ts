import { runPushabilityStatus } from "../../lib/git/index.js";
import { notesRef } from "./shared.js";
import { clearPartialPushMarker, runUserLoad } from "./save-load.js";
import {
  UserPushBlockedError,
  type UserFetchOptions,
  type UserIOContext,
  type UserPullOptions,
  type UserPushOptions,
  type UserPushResult,
} from "./types.js";

/**
 * Push user notes to remote origin.
 *
 * Runs the pushability pre-check matrix first when an `access` seam is
 * provided. Block-disposition conditions (rebase in progress, detached HEAD)
 * refuse the push regardless of `force` — these are environmental issues, not
 * divergence; force-push doesn't resolve them. Auto-fixed conditions (missing
 * notes refspec) proceed silently after fix.
 *
 * Advisory disposition is **not** refused at this site (single-leg / paired
 * asymmetry — see `lib/git/pushability.ts`). Divergent pushes pass the
 * pre-check and reach `git push`; rejection is then routed through
 * `handlers/push-recovery.ts`'s `[rejected]` branch, which surfaces the
 * conflict and offers force-push only on explicit user selection. The paired
 * flow refuses the advisory at its orchestrator boundary instead. Both paths
 * keep automatic pushes safe; the difference is where the refusal lands.
 *
 * Idempotent recovery: when `force` is unset, the function probes
 * `git ls-remote origin <ref>` and compares against the local ref hash. If
 * they match, no push fires and the result is `{ kind: "noop" }` — the
 * partial-push marker is still cleared since the recovery condition is
 * resolved. `force: true` skips the probe and pushes unconditionally — see
 * `handleUserPush`'s `--force` escape hatch for the only call path that
 * sets it.
 *
 * @param options - Push options. Provide `access` to enable the pre-check.
 * @returns Discriminated outcome: `pushed` when a push fired, `noop` when the
 *   remote already matched local.
 * @throws {UserPushBlockedError} when a block-disposition condition is detected.
 */
export async function runUserPush(options: UserPushOptions): Promise<UserPushResult> {
  const { cwd, io, identity, force, access, worktreeBranch } = options;

  if (access) {
    const pushability = await runPushabilityStatus({
      exec: io.exec,
      access,
      target: "notes",
      worktreeBranch,
    });
    if (!pushability.allowed) {
      throw new UserPushBlockedError(pushability.conditions);
    }
  }

  const ref = `refs/notes/${notesRef(identity)}`;

  if (!force) {
    const local = await readLocalRefHash(io, ref);
    const remote = await readRemoteRefHash(io, ref);
    if (local !== null && remote !== null && local === remote) {
      if (cwd) {
        await clearPartialPushMarker(cwd, io, identity);
      }
      return { kind: "noop" };
    }
  }

  const args = force ? ["push", "--force", "origin", ref] : ["push", "origin", ref];
  await io.exec("git", args);
  if (cwd) {
    await clearPartialPushMarker(cwd, io, identity);
  }
  return { kind: "pushed" };
}

async function readLocalRefHash(io: UserIOContext, ref: string): Promise<string | null> {
  try {
    const { stdout } = await io.exec("git", ["rev-parse", "--verify", ref]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function readRemoteRefHash(io: UserIOContext, ref: string): Promise<string | null> {
  try {
    const { stdout } = await io.exec("git", ["ls-remote", "origin", ref]);
    const line = stdout
      .split("\n")
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0);
    if (!line) return null;
    const [hash] = line.split(/\s+/u);
    return hash || null;
  } catch {
    return null;
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
 * Fetch user notes from remote origin.
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
  const { cwd, io, identity, force, maxAncestorWalk, currentWuName } = options;
  await runUserFetch({ io, identity, force });
  return runUserLoad({ cwd, io, identity, maxAncestorWalk, currentWuName });
}
