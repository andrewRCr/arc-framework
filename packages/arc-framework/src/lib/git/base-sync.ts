/**
 * Safe local-base synchronization from any worktree.
 *
 * Fetches the configured base from `origin`, proves the local base is
 * fast-forwardable, then updates it through its checked-out worktree when one
 * exists. A non-checked-out base advances after a fresh ref check, using Git's
 * cross-worktree checkout guard. Dirty, locally-ahead, diverged, or
 * concurrently-moved bases are refused.
 *
 * @module
 */

import { boundedFetch, checkOriginExists } from "./exec.js";
import { countAheadBehindRef, DEFAULT_FETCH_TIMEOUT_MS } from "./worktree-sync.js";
import { resolveWorktreePathsByBranchResult } from "./worktree-roster.js";

import type { GitExec } from "./exec.js";

/** Successful synchronization method. */
export type BaseSyncMethod = "checked-out" | "direct-ref";

/** A safe local-base synchronization outcome. */
export type BaseSyncResult =
  | {
      status: "updated";
      method: BaseSyncMethod;
      base: string;
      from: string | null;
      to: string;
      worktreePath: string | null;
    }
  | {
      status: "unchanged";
      base: string;
      at: string;
    }
  | {
      status: "refused";
      reason:
        | "no-remote"
        | "fetch-timeout"
        | "fetch-failed"
        | "remote-base-missing"
        | "distance-unavailable"
        | "local-ahead"
        | "diverged"
        | "worktree-list-failed"
        | "dirty-base-worktree"
        | "base-moved"
        | "update-failed";
      base: string;
      worktreePath?: string;
    };

/** Dependencies and inputs for {@link syncLocalBase}. */
export interface SyncLocalBaseOptions {
  exec: GitExec;
  /** Configured local integration branch. */
  baseBranch: string;
  /** Fetch timeout; defaults to the standard bounded-fetch timeout. */
  fetchTimeoutMs?: number;
}

async function resolveRef(exec: GitExec, ref: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--verify", ref]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Fast-forward the configured local base to `origin/<base>` without requiring
 * the caller to know which worktree holds the base checkout.
 *
 * @param options - Injected git boundary and configured base branch.
 * @returns The update, no-op, or typed refusal outcome.
 */
export async function syncLocalBase(options: SyncLocalBaseOptions): Promise<BaseSyncResult> {
  const { exec, baseBranch, fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = options;

  if (!(await checkOriginExists(exec))) {
    return { status: "refused", reason: "no-remote", base: baseBranch };
  }

  const fetch = await boundedFetch(exec, baseBranch, fetchTimeoutMs);
  if (fetch.outcome !== "ok") {
    return {
      status: "refused",
      reason: fetch.outcome === "timeout" ? "fetch-timeout" : "fetch-failed",
      base: baseBranch,
    };
  }

  const remoteRef = `refs/remotes/origin/${baseBranch}`;
  const localRef = `refs/heads/${baseBranch}`;
  const remoteOid = await resolveRef(exec, remoteRef);
  if (remoteOid === null) {
    return { status: "refused", reason: "remote-base-missing", base: baseBranch };
  }

  const localOid = await resolveRef(exec, localRef);
  if (localOid === remoteOid) {
    return { status: "unchanged", base: baseBranch, at: remoteOid };
  }

  if (localOid !== null) {
    try {
      const distance = await countAheadBehindRef(exec, localOid, remoteOid);
      if (distance.state === "local-ahead") {
        return { status: "refused", reason: "local-ahead", base: baseBranch };
      }
      if (distance.state !== "remote-ahead") {
        return { status: "refused", reason: "diverged", base: baseBranch };
      }
    } catch {
      return { status: "refused", reason: "distance-unavailable", base: baseBranch };
    }
  }

  const worktrees = await resolveWorktreePathsByBranchResult(exec);
  if (!worktrees.ok) {
    return { status: "refused", reason: "worktree-list-failed", base: baseBranch };
  }

  const baseWorktree = worktrees.paths.get(baseBranch);
  if (baseWorktree !== undefined) {
    try {
      const { stdout } = await exec("git", ["status", "--porcelain=v1", "-z"], { cwd: baseWorktree });
      if (stdout !== "") {
        return {
          status: "refused",
          reason: "dirty-base-worktree",
          base: baseBranch,
          worktreePath: baseWorktree,
        };
      }
      if (await resolveRef(exec, localRef) !== localOid) {
        return { status: "refused", reason: "base-moved", base: baseBranch };
      }
      await exec("git", ["merge", "--ff-only", remoteOid], { cwd: baseWorktree });
      return {
        status: "updated",
        method: "checked-out",
        base: baseBranch,
        from: localOid,
        to: remoteOid,
        worktreePath: baseWorktree,
      };
    } catch {
      return {
        status: "refused",
        reason: "update-failed",
        base: baseBranch,
        worktreePath: baseWorktree,
      };
    }
  }

  try {
    if (await resolveRef(exec, localRef) !== localOid) {
      return { status: "refused", reason: "base-moved", base: baseBranch };
    }
    // `branch --force` retains Git's cross-worktree checkout guard. If another
    // session checks out the base after the roster read, Git refuses rather
    // than moving the branch underneath that worktree's files.
    await exec("git", ["branch", "--force", baseBranch, remoteOid]);
    return {
      status: "updated",
      method: "direct-ref",
      base: baseBranch,
      from: localOid,
      to: remoteOid,
      worktreePath: null,
    };
  } catch {
    return { status: "refused", reason: "update-failed", base: baseBranch };
  }
}
