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
import {
  planBranchBoundedNotesExport,
  pushBranchBoundedNotesExport,
  readStrictLocalRefTip,
  readStrictOptionalNotesCompactionManifest,
  type BranchBoundedNotesExportRefusalReason,
} from "../../lib/user-sync/branch-bounded-notes-export.js";
import { serializeNotesCompactionManifest } from "../../lib/user-sync/compaction-manifest.js";
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

const FETCH_UPDATE_CAS_ATTEMPTS = 3;

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
 * asymmetry — see `lib/git/pushability.ts`). Canonical graph divergence is
 * returned as a structured preflight refusal; the reconcile wrapper may merge
 * ordinary same-lineage histories, while direct callers see the refusal. The
 * paired flow refuses the advisory at its orchestrator boundary instead.
 *
 * Non-force publication always plans and pushes one proof-bearing captured
 * canonical tip. `force: true` remains the explicit planner-free override.
 *
 * @param options - Push options. Provide `access` to enable the pre-check.
 * @returns Discriminated publication, refusal, or no-work outcome.
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

  if (force) {
    const ref = `refs/notes/${notesRef(identity)}`;
    if (await readStrictLocalRefTip(io.exec, ref) === null) return { kind: "no-local-notes" };
    await io.exec("git", ["push", "--force", "origin", ref]);
    if (cwd) await clearPartialPushMarker(cwd, io, identity);
    return { kind: "pushed" };
  }

  const plan = await planBranchBoundedNotesExport({
    exec: io.exec,
    execInput: io.execInput,
    identity,
  });
  if (plan.kind === "skipped") return { kind: "no-local-notes" };
  if (plan.kind === "refused") return plan;
  if (plan.kind === "failed") throw plan.error;

  const pushed = await pushBranchBoundedNotesExport({ exec: io.exec, target: plan.target });
  if (pushed.kind === "failed") throw pushed.error;
  if (pushed.kind === "no-remote") return { kind: "no-remote" };
  if (cwd) await clearPartialPushMarker(cwd, io, identity);
  return pushed;
}

async function readLocalRefHash(io: UserIOContext, ref: string): Promise<string | null> {
  try {
    const { stdout } = await io.exec("git", ["rev-parse", "--verify", ref]);
    return stdout.trim() || null;
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
  attempt = 1,
): Promise<UserFetchResult> {
  try {
    await io.exec("git", ["update-ref", ref, remoteTip, ""]);
    return { kind: "created", remoteTip };
  } catch (err) {
    return classifyGuardedFetchUpdateFailure(io, ref, null, remoteTip, err, attempt);
  }
}

async function fastForwardFetchedNotesRef(
  io: UserIOContext,
  ref: string,
  localTip: string,
  remoteTip: string,
  attempt = 1,
): Promise<UserFetchResult> {
  try {
    await io.exec("git", ["update-ref", ref, remoteTip, localTip]);
    return { kind: "fast-forwarded", localTip, remoteTip };
  } catch (err) {
    return classifyGuardedFetchUpdateFailure(io, ref, localTip, remoteTip, err, attempt);
  }
}

async function classifyGuardedFetchUpdateFailure(
  io: UserIOContext,
  ref: string,
  expectedLocalTip: string | null,
  remoteTip: string,
  err: unknown,
  attempt: number,
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

  const remoteStillAhead = await isAncestor(io, currentLocalTip, remoteTip);
  if (remoteStillAhead) {
    if (attempt >= FETCH_UPDATE_CAS_ATTEMPTS) {
      return {
        kind: "remote-unavailable",
        error: new Error(`fetch CAS update exceeded retry attempts for ${ref}`, { cause: error }),
      };
    }
    return fastForwardFetchedNotesRef(io, ref, currentLocalTip, remoteTip, attempt + 1);
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
  | { kind: "no-local-notes" }
  | { kind: "no-remote" }
  | { kind: "refused"; reason: BranchBoundedNotesExportRefusalReason; message: string }
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
 * Push user notes, auto-reconciling ordinary same-lineage graph divergence.
 *
 * An ordinary `history-diverged` preflight triggers a fresh fetch under the
 * notes lock, exact compaction-lineage validation, and a lossless
 * `git notes merge -s cat_sort_uniq`. After validation the lock is released,
 * the merged canonical tip is recaptured and re-proven, then transported. A
 * clean push needs no merge; force-push stays an explicit single-leg opt-in.
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
    if (result.kind === "refused" && result.reason === "history-diverged") {
      return await reconcileAndRepush(options);
    }
    return result;
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
 * Fetch the remote notes ref into a temp tracking ref, validate compaction
 * lineage, union-merge it into the local ref, then recapture and prove outside
 * the lock before publication.
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
  const lockProvider = options.lock ?? DEFAULT_RECONCILE_LOCK;
  let lock: AdvisoryLockHandle;
  try {
    lock = await lockProvider.acquire({ io, cwd, identity });
  } catch (err) {
    return { kind: "failed", error: err instanceof Error ? err : new Error(String(err)) };
  }
  try {
    const preMergeTip = await readRefTip(io, fullRef);
    await io.exec("git", ["fetch", "--refmap=", "origin", incomingFetchRefspec(fullRef, incoming)]);

    const boundary = await validateReconcileCompactionLineage({ io, fullRef, incoming });
    if (boundary.kind === "refused") return boundary;
    if (boundary.kind === "failed") return { kind: "failed", error: boundary.error };

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
    const scan = await findCorruptMergedNote(io, shortRef);
    if (scan.kind === "corrupt") {
      const rollback = await rollbackCorruptMerge({ io, fullRef, preMergeTip, postMergeTip });
      if (rollback.kind === "failed") {
        return {
          kind: "conflict",
          message:
            `Concurrent notes on commit ${scan.commit.slice(0, 8)} produced an unparseable note, `
            + "and the rollback could not be applied safely. Nothing was pushed; inspect the local "
            + "notes ref and retry after resolving the conflict.",
        };
      }
      return {
        kind: "conflict",
        message:
          `Concurrent notes on commit ${scan.commit.slice(0, 8)} could not be auto-merged `
          + "(the union produced an unparseable note). Your local notes are preserved; resolve the "
          + "conflicting saves and retry, or `arc user push --force` to overwrite the remote.",
      };
    }
    if (scan.kind === "failed") {
      const rollback = await rollbackCorruptMerge({ io, fullRef, preMergeTip, postMergeTip });
      const scope = scan.commit === undefined
        ? "Concurrent notes merge"
        : `Concurrent notes on commit ${scan.commit.slice(0, 8)}`;
      if (rollback.kind === "failed") {
        return {
          kind: "conflict",
          message:
            `${scope} could not be verified after merge (${scan.error.message}), and the rollback could not `
            + "be applied safely. Nothing was pushed; inspect the local notes ref and retry after resolving "
            + "the conflict.",
        };
      }
      return {
        kind: "conflict",
        message:
          `${scope} could not be verified after merge (${scan.error.message}). Your local notes are `
          + "preserved; resolve the notes-ref read failure and retry.",
      };
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return isRemoteUnavailableError(error.message)
      ? { kind: "no-remote" }
      : { kind: "failed", error };
  } finally {
    await tryExec(io, ["update-ref", "-d", incoming]);
    await lockProvider.release(lock);
  }

  let repush: UserPushResult;
  try {
    repush = await runUserPush({ cwd, io, identity, access, worktreeBranch });
  } catch (err) {
    return reconcileRepushFailureOutcome(err);
  }
  switch (repush.kind) {
    case "pushed":
    case "noop":
      return { kind: "reconciled" };
    case "no-local-notes":
    case "no-remote":
    case "refused":
      return repush;
  }
}

async function validateReconcileCompactionLineage(input: {
  io: UserIOContext;
  fullRef: string;
  incoming: string;
}): Promise<
  | { kind: "compatible" }
  | { kind: "refused"; reason: "compaction-lineage"; message: string }
  | { kind: "failed"; error: Error }
> {
  try {
    const [localManifest, remoteManifest] = await Promise.all([
      readStrictOptionalNotesCompactionManifest(input.io.exec, input.fullRef),
      readStrictOptionalNotesCompactionManifest(input.io.exec, input.incoming),
    ]);
    const same = localManifest === null || remoteManifest === null
      ? localManifest === remoteManifest
      : serializeNotesCompactionManifest(localManifest) === serializeNotesCompactionManifest(remoteManifest);
    if (same) return { kind: "compatible" };
    return {
      kind: "refused",
      reason: "compaction-lineage",
      message:
        "Local and origin user notes cross an incompatible compaction boundary. Automatic adoption and merge "
        + "are disabled; inspect both refs with `arc user status --verbose`. Then either accept the remote "
        + "snapshot, or verify the materialized user state and establish a fresh authoritative save after manual "
        + "canonical-ref repair.",
    };
  } catch (err) {
    return { kind: "failed", error: err instanceof Error ? err : new Error(String(err)) };
  }
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

type MergedNoteScanResult =
  | { kind: "clean" }
  | { kind: "corrupt"; commit: string }
  | { kind: "failed"; commit?: string; error: Error };

/**
 * First annotated commit whose merged note no longer parses as one manifest.
 * Empty output is clean — the ref may be absent or carry no notes — but read
 * failures fail closed so a possibly-corrupt merge is never re-pushed.
 */
async function findCorruptMergedNote(
  io: UserIOContext,
  shortRef: string,
): Promise<MergedNoteScanResult> {
  let listOut: string;
  try {
    ({ stdout: listOut } = await io.exec("git", ["notes", "--ref", shortRef, "list"]));
  } catch (err) {
    return { kind: "failed", error: err instanceof Error ? err : new Error(String(err)) };
  }
  const commits = listOut
    .split("\n")
    .map((line) => line.trim().split(/\s+/u)[1])
    .filter((commit): commit is string => Boolean(commit));

  for (const commit of commits) {
    let content: string;
    try {
      ({ stdout: content } = await io.exec("git", ["notes", "--ref", shortRef, "show", commit]));
    } catch (err) {
      return {
        kind: "failed",
        commit,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
    if (!isResolvedNoteValid(content)) return { kind: "corrupt", commit };
  }
  return { kind: "clean" };
}
