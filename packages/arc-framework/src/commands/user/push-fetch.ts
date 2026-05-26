import { runPushabilityStatus } from "../../lib/git/index.js";
import type { AccessFn, PushabilityCondition } from "../../lib/git/index.js";
import {
  incomingFetchRefspec,
  incomingNotesRef,
  isNonFastForwardError,
  isRemoteUnavailableError,
  notesMergeArgs,
} from "../../lib/user-sync/index.js";
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

/** Discriminated outcome of {@link reconcileNotesPush}. */
export type NotesPushOutcome =
  | { kind: "pushed" }
  | { kind: "noop" }
  | { kind: "reconciled" }
  | { kind: "no-remote" }
  | { kind: "blocked"; conditions: PushabilityCondition[] }
  | { kind: "failed"; error: Error };

/** Options for {@link reconcileNotesPush}. */
export interface ReconcileNotesPushOptions {
  io: UserIOContext;
  identity: string;
  /** Repository root, threaded to the partial-push marker clear inside the push. */
  cwd?: string;
  /** Path-existence check enabling the pushability pre-check matrix. */
  access?: AccessFn;
  /** Current worktree branch — threaded into the pushability matrix. */
  worktreeBranch?: string;
}

/**
 * Push user notes, auto-reconciling a concurrent-worktree non-fast-forward.
 *
 * On the shared user-notes ref, a non-ff rejection means another worktree
 * pushed between this worktree's save and push. Recovery is automatic and
 * lossless: fetch the remote ref into a temp tracking ref, union-merge it with
 * `git notes merge -s cat_sort_uniq`, and re-push. No prompt — unlike the
 * generic interactive recovery, whose "merge" re-saves only this worktree's
 * directory and drops the other side. A clean push needs no merge; force-push
 * stays an explicit opt-in on the single-leg `--force` path.
 *
 * @param options - See {@link ReconcileNotesPushOptions}.
 * @returns `pushed` / `noop` on a clean push, `reconciled` after a merge,
 *   `blocked` on a pushability block, `failed` on any other error.
 */
export async function reconcileNotesPush(
  options: ReconcileNotesPushOptions,
): Promise<NotesPushOutcome> {
  const { io, identity, cwd, access, worktreeBranch } = options;
  try {
    const result = await runUserPush({ cwd, io, identity, access, worktreeBranch });
    return result.kind === "noop" ? { kind: "noop" } : { kind: "pushed" };
  } catch (err) {
    if (err instanceof UserPushBlockedError) {
      return { kind: "blocked", conditions: err.conditions };
    }
    const error = err instanceof Error ? err : new Error(String(err));
    if (isRemoteUnavailableError(error.message)) return { kind: "no-remote" };
    if (!isNonFastForwardError(error.message)) {
      return { kind: "failed", error };
    }
    return reconcileAndRepush(options);
  }
}

/**
 * Fetch the remote notes ref into a temp tracking ref, union-merge it into the
 * local ref, re-push, and clean up the temp ref.
 */
async function reconcileAndRepush(
  options: ReconcileNotesPushOptions,
): Promise<NotesPushOutcome> {
  const { io, identity, cwd, access, worktreeBranch } = options;
  const shortRef = notesRef(identity);
  const fullRef = `refs/notes/${shortRef}`;
  const incoming = incomingNotesRef(fullRef);

  await io.exec("git", ["fetch", "origin", incomingFetchRefspec(fullRef)]);
  await io.exec("git", notesMergeArgs(shortRef, incoming));
  await runUserPush({ cwd, io, identity, access, worktreeBranch });
  await io.exec("git", ["update-ref", "-d", incoming]);
  return { kind: "reconciled" };
}
