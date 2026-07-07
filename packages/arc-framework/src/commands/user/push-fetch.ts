import { runPushabilityStatus } from "../../lib/git/index.js";
import type { AccessFn, PushabilityCondition } from "../../lib/git/index.js";
import {
  clearPartialPushMarker,
  acquireAdvisoryLock,
  getNotesLockPath,
  incomingFetchRefspec,
  incomingNotesRef,
  isCasRejectionError,
  isNonFastForwardError,
  isRemoteUnavailableError,
  isResolvedNoteValid,
  notesMergeArgs,
  releaseAdvisoryLock,
  type AdvisoryLockHandle,
} from "../../lib/user-sync/index.js";
import { uniqueRefToken } from "../../lib/git/ref-tree.js";
import { notesRef } from "./shared.js";
import { runUserLoad } from "./save-load.js";
import {
  UserPushBlockedError,
  type UserFetchResult,
  type UserFetchOptions,
  type UserIOContext,
  type UserPullOptions,
  type UserPullResult,
  type UserPushOptions,
  type UserPushResult,
} from "./types.js";

/**
 * Push user notes to remote origin.
 *
 * Runs the pushability pre-check matrix first when an `access` seam is
 * provided. Block-disposition conditions (rebase in progress, detached HEAD)
 * refuse the push regardless of `force` — these are environmental issues, not
 * divergence; force-push doesn't resolve them. Auto-fixed conditions proceed
 * silently after fix.
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
export async function runUserFetch(options: UserFetchOptions): Promise<UserFetchResult> {
  const { io, identity } = options;
  const ref = `refs/notes/${notesRef(identity)}`;
  const tempRef = `${ref}__fetch_${uniqueRefToken()}`;
  const localTip = await readLocalRefHash(io, ref);
  try {
    await io.exec("git", ["fetch", "--refmap=", "origin", `+${ref}:${tempRef}`]);
    const remoteTip = await readLocalRefHash(io, tempRef);
    if (remoteTip === null) {
      return {
        kind: "remote-unavailable",
        error: new Error(`Fetched user notes ref did not resolve: ${tempRef}`),
      };
    }

    if (localTip === null) {
      return await createFetchedNotesRef(io, ref, remoteTip);
    }

    if (localTip === remoteTip) {
      return { kind: "fast-forwarded", localTip, remoteTip };
    }

    const remoteContainsLocal = await isAncestor(io, localTip, remoteTip);
    if (remoteContainsLocal) {
      return await fastForwardFetchedNotesRef(io, ref, localTip, remoteTip);
    }

    const localContainsRemote = await isAncestor(io, remoteTip, localTip);
    if (localContainsRemote) {
      return { kind: "refused-local-ahead", localTip, remoteTip };
    }

    return { kind: "refused-diverged", localTip, remoteTip };
  } catch (err) {
    return { kind: "remote-unavailable", error: err instanceof Error ? err : new Error(String(err)) };
  } finally {
    await tryExec(io, ["update-ref", "-d", tempRef]);
  }
}

/**
 * Fetch user notes from remote and restore them to disk.
 *
 * @param options - Pull options
 * @returns Load result, or null if no note was found after fetch
 */
export async function runUserPull(
  options: UserPullOptions,
): Promise<UserPullResult> {
  const { cwd, io, identity, currentWuName } = options;
  const fetch = await runUserFetch({ io, identity });
  if (!isFetchSuccess(fetch)) return fetch;
  return runUserLoad({ cwd, io, identity, currentWuName });
}

async function createFetchedNotesRef(
  io: UserIOContext,
  ref: string,
  remoteTip: string,
): Promise<UserFetchResult> {
  try {
    await io.exec("git", ["update-ref", ref, remoteTip, ""]);
    return { kind: "created", remoteTip };
  } catch (err) {
    return classifyGuardedFetchUpdateFailure(io, ref, null, remoteTip, err);
  }
}

async function fastForwardFetchedNotesRef(
  io: UserIOContext,
  ref: string,
  localTip: string,
  remoteTip: string,
): Promise<UserFetchResult> {
  try {
    await io.exec("git", ["update-ref", ref, remoteTip, localTip]);
    return { kind: "fast-forwarded", localTip, remoteTip };
  } catch (err) {
    return classifyGuardedFetchUpdateFailure(io, ref, localTip, remoteTip, err);
  }
}

async function classifyGuardedFetchUpdateFailure(
  io: UserIOContext,
  ref: string,
  expectedLocalTip: string | null,
  remoteTip: string,
  err: unknown,
): Promise<UserFetchResult> {
  const error = err instanceof Error ? err : new Error(String(err));
  if (!isCasRejectionError(error.message)) return { kind: "remote-unavailable", error };

  const currentLocalTip = await readLocalRefHash(io, ref);
  if (currentLocalTip === null) return { kind: "remote-unavailable", error };
  if (currentLocalTip === remoteTip) {
    if (expectedLocalTip === null) {
      return { kind: "created", remoteTip };
    }
    return { kind: "fast-forwarded", localTip: expectedLocalTip, remoteTip };
  }

  const localContainsRemote = await isAncestor(io, remoteTip, currentLocalTip);
  if (localContainsRemote) {
    return { kind: "refused-local-ahead", localTip: currentLocalTip, remoteTip };
  }
  return { kind: "refused-diverged", localTip: currentLocalTip, remoteTip };
}

type SuccessfulUserFetchResult = Extract<UserFetchResult, { kind: "fast-forwarded" | "created" }>;

function isFetchSuccess(fetch: UserFetchResult): fetch is SuccessfulUserFetchResult {
  return fetch.kind === "fast-forwarded" || fetch.kind === "created";
}

async function isAncestor(
  io: UserIOContext,
  ancestor: string,
  descendant: string,
): Promise<boolean> {
  try {
    await io.exec("git", ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

/** Discriminated outcome of {@link reconcileNotesPush}. */
export type NotesPushOutcome =
  | { kind: "pushed" }
  | { kind: "noop" }
  | { kind: "reconciled" }
  | { kind: "no-remote" }
  | { kind: "blocked"; conditions: PushabilityCondition[] }
  /**
   * The non-ff merge could not be auto-resolved losslessly — either the
   * `git notes merge` command failed, or `cat_sort_uniq` exited 0 but produced
   * an unparseable note (a same-commit collision). The local ref is left intact
   * and nothing is pushed; `message` is a user-facing surface.
   */
  | { kind: "conflict"; message: string }
  | { kind: "failed"; error: Error };

/** Options for {@link reconcileNotesPush}. */
export interface ReconcileNotesPushOptions {
  io: UserIOContext;
  identity: string;
  /** Repository root, threaded to the notes lock and partial-push marker clear. */
  cwd: string;
  /** Path-existence check enabling the pushability pre-check matrix. */
  access?: AccessFn;
  /** Current worktree branch — threaded into the pushability matrix. */
  worktreeBranch?: string;
  /** Injectable lock seam for deterministic tests. Defaults to the repo-shared notes lock. */
  lock?: ReconcileNotesLock;
}

/** Lock seam used by the reconcile critical section. */
export interface ReconcileNotesLock {
  acquire: (input: {
    io: UserIOContext;
    cwd: string;
    identity: string;
  }) => Promise<AdvisoryLockHandle>;
  release: (handle: AdvisoryLockHandle) => Promise<void>;
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
 * local ref, validate the result, and (only if clean) re-push.
 *
 * `cat_sort_uniq` exits 0 even when two worktrees annotated the same commit and
 * their single-line JSON manifests concatenate into an unparseable note, so the
 * non-trivial-conflict check is a post-merge manifest-validity scan rather than
 * git's exit signal. On corruption the local ref is rolled back to its
 * pre-merge tip (nothing corrupt persists or is pushed) and the conflict is
 * surfaced; a failed merge command is aborted and surfaced the same way.
 */
async function reconcileAndRepush(
  options: ReconcileNotesPushOptions,
): Promise<NotesPushOutcome> {
  const { io, identity, cwd, access, worktreeBranch } = options;
  const shortRef = notesRef(identity);
  const fullRef = `refs/notes/${shortRef}`;
  const incoming = incomingNotesRef(fullRef);
  const lock = await (options.lock ?? DEFAULT_RECONCILE_LOCK).acquire({ io, cwd, identity });
  try {
    const preMergeTip = await readRefTip(io, fullRef);
    await io.exec("git", ["fetch", "--refmap=", "origin", incomingFetchRefspec(fullRef)]);

    try {
      await io.exec("git", notesMergeArgs(shortRef, incoming));
    } catch (err) {
      await tryExec(io, ["notes", "--ref", shortRef, "merge", "--abort"]);
      const detail = err instanceof Error ? err.message : String(err);
      return {
        kind: "conflict",
        message: `Concurrent notes could not be merged (git notes merge failed): ${detail}`,
      };
    }

    const postMergeTip = await readRefTip(io, fullRef);
    const corruptCommit = await findCorruptMergedNote(io, shortRef);
    if (corruptCommit !== null) {
      const rollback = await rollbackCorruptMerge({ io, fullRef, preMergeTip, postMergeTip });
      if (rollback.kind === "failed") {
        return {
          kind: "conflict",
          message:
            `Concurrent notes on commit ${corruptCommit.slice(0, 8)} produced an unparseable note, `
            + "and the rollback could not be applied safely. Nothing was pushed; inspect the local "
            + "notes ref and retry after resolving the conflict.",
        };
      }
      return {
        kind: "conflict",
        message:
          `Concurrent notes on commit ${corruptCommit.slice(0, 8)} could not be auto-merged `
          + "(the union produced an unparseable note). Your local notes are preserved; resolve the "
          + "conflicting saves and retry, or `arc user push --force` to overwrite the remote.",
      };
    }

  } finally {
    await tryExec(io, ["update-ref", "-d", incoming]);
    await (options.lock ?? DEFAULT_RECONCILE_LOCK).release(lock);
  }

  try {
    await runUserPush({ cwd, io, identity, access, worktreeBranch });
  } catch (err) {
    return reconcileRepushFailureOutcome(err);
  }
  return { kind: "reconciled" };
}

const DEFAULT_RECONCILE_LOCK: ReconcileNotesLock = {
  acquire: async ({ io, cwd, identity }) =>
    acquireAdvisoryLock(await getNotesLockPath(io.exec, cwd, identity)),
  release: (handle) => releaseAdvisoryLock(handle),
};

async function rollbackCorruptMerge(input: {
  io: UserIOContext;
  fullRef: string;
  preMergeTip: string | null;
  postMergeTip: string | null;
}): Promise<{ kind: "rolled-back" | "no-ref" } | { kind: "failed"; error: Error }> {
  const { io, fullRef, preMergeTip, postMergeTip } = input;
  if (postMergeTip === null) return { kind: "no-ref" };

  const args = preMergeTip === null
    ? ["update-ref", "-d", fullRef, postMergeTip]
    : ["update-ref", fullRef, preMergeTip, postMergeTip];
  try {
    await io.exec("git", args);
    return { kind: "rolled-back" };
  } catch (err) {
    return { kind: "failed", error: err instanceof Error ? err : new Error(String(err)) };
  }
}

function reconcileRepushFailureOutcome(err: unknown): NotesPushOutcome {
  if (err instanceof UserPushBlockedError) {
    return { kind: "blocked", conditions: err.conditions };
  }
  const error = err instanceof Error ? err : new Error(String(err));
  if (isRemoteUnavailableError(error.message)) return { kind: "no-remote" };
  if (isNonFastForwardError(error.message)) {
    return {
      kind: "conflict",
      message:
        "Concurrent notes changed again during reconcile re-push. The merged local notes are preserved; "
        + "retry `arc user push` or `arc sync` after the other writer lands.",
    };
  }
  return { kind: "failed", error };
}

/** Current tip of a ref, or `null` when it does not resolve. */
async function readRefTip(io: UserIOContext, ref: string): Promise<string | null> {
  try {
    const { stdout } = await io.exec("git", ["rev-parse", "--verify", ref]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** Best-effort git invocation for cleanup steps; swallows failures. */
async function tryExec(io: UserIOContext, args: string[]): Promise<void> {
  try {
    await io.exec("git", args);
  } catch {
    // Cleanup is best-effort — a failed rollback/abort must not mask the outcome.
  }
}

/**
 * First annotated commit whose merged note no longer parses as one manifest, or
 * `null` when every note is valid. Scans the post-merge ref since `cat_sort_uniq`
 * corrupts silently (exit 0) on a same-commit collision.
 */
async function findCorruptMergedNote(
  io: UserIOContext,
  shortRef: string,
): Promise<string | null> {
  let listOut: string;
  try {
    ({ stdout: listOut } = await io.exec("git", ["notes", "--ref", shortRef, "list"]));
  } catch {
    return null;
  }
  const commits = listOut
    .split("\n")
    .map((line) => line.trim().split(/\s+/u)[1])
    .filter((commit): commit is string => Boolean(commit));

  for (const commit of commits) {
    let content: string;
    try {
      ({ stdout: content } = await io.exec("git", ["notes", "--ref", shortRef, "show", commit]));
    } catch {
      continue;
    }
    if (!isResolvedNoteValid(content)) return commit;
  }
  return null;
}
