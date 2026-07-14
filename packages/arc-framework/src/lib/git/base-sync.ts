/**
 * Safe local-base synchronization from any worktree.
 *
 * Fetches the configured base from `origin`, proves the local base is
 * fast-forwardable, then updates it through its checked-out worktree when one
 * exists. A non-checked-out base advances through a temporary worktree that
 * claims Git's cross-worktree checkout exclusion before revalidating the
 * expected ref. Dirty, locally-ahead, diverged, or concurrently-moved bases
 * are refused.
 *
 * @module
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { boundedFetch, checkOriginExists } from "./exec.js";
import { countAheadBehindRef, DEFAULT_FETCH_TIMEOUT_MS } from "./worktree-sync.js";
import { resolveWorktreePathsByBranchResult } from "./worktree-roster.js";

import type { GitExec } from "./exec.js";

/** Successful synchronization method. */
export type BaseSyncMethod = "checked-out" | "managed-worktree";

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
      status: "cleanup-required";
      base: string;
      baseUpdated: boolean;
      to: string;
      worktreePath: string;
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

/** Temporary-directory boundary used by the managed-worktree update path. */
export interface TemporaryDirectoryOps {
  /** Create and return an empty temporary directory. */
  create(): Promise<string>;
  /** Recursively remove a temporary directory that Git did not register. */
  remove(path: string): Promise<void>;
}

/** Dependencies and inputs for {@link syncLocalBase}. */
export interface SyncLocalBaseOptions {
  exec: GitExec;
  /** Configured local integration branch. */
  baseBranch: string;
  /** Fetch timeout; defaults to the standard bounded-fetch timeout. */
  fetchTimeoutMs?: number;
  /** Injectable temporary-directory boundary. */
  tempDirectories?: TemporaryDirectoryOps;
}

const DEFAULT_TEMP_DIRECTORIES: TemporaryDirectoryOps = {
  create: async () => mkdtemp(join(tmpdir(), "arc-base-sync-")),
  remove: async (path) => rm(path, { recursive: true, force: true }),
};

async function resolveRef(exec: GitExec, ref: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--verify", ref]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function resolveSymbolicHead(exec: GitExec, cwd: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["symbolic-ref", "HEAD"], { cwd });
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
  const {
    exec,
    baseBranch,
    fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    tempDirectories = DEFAULT_TEMP_DIRECTORIES,
  } = options;

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

  let managedPath: string;
  try {
    managedPath = await tempDirectories.create();
  } catch {
    return { status: "refused", reason: "update-failed", base: baseBranch };
  }

  let registered = false;
  let cleanupFailed = false;
  let outcome: BaseSyncResult = { status: "refused", reason: "update-failed", base: baseBranch };
  try {
    try {
      const addArgs = localOid === null
        ? ["worktree", "add", "-b", baseBranch, "--", managedPath, remoteOid]
        : ["worktree", "add", "--", managedPath, baseBranch];
      await exec("git", addArgs);
      registered = true;
    } catch {
      outcome = await resolveRef(exec, localRef) !== localOid
        ? { status: "refused", reason: "base-moved", base: baseBranch }
        : { status: "refused", reason: "update-failed", base: baseBranch };
    }

    if (registered) {
      const claimedBranch = await resolveSymbolicHead(exec, managedPath);
      const claimedOid = await resolveRef(exec, localRef);
      const expectedClaimedOid = localOid ?? remoteOid;
      if (claimedBranch !== localRef) {
        outcome = { status: "refused", reason: "update-failed", base: baseBranch };
      } else if (claimedOid !== expectedClaimedOid) {
        outcome = { status: "refused", reason: "base-moved", base: baseBranch };
      } else if (localOid === null) {
        outcome = {
          status: "updated",
          method: "managed-worktree",
          base: baseBranch,
          from: null,
          to: remoteOid,
          worktreePath: null,
        };
      } else {
        try {
          await exec("git", ["merge", "--ff-only", remoteOid], { cwd: managedPath });
          outcome = {
            status: "updated",
            method: "managed-worktree",
            base: baseBranch,
            from: localOid,
            to: remoteOid,
            worktreePath: null,
          };
        } catch {
          outcome = {
            status: "refused",
            reason: "update-failed",
            base: baseBranch,
          };
        }
      }
    }
  } finally {
    try {
      if (registered) {
        await exec("git", ["worktree", "remove", "--force", "--force", managedPath]);
      } else {
        await tempDirectories.remove(managedPath);
      }
    } catch {
      cleanupFailed = true;
    }
  }

  if (cleanupFailed) {
    return {
      status: "cleanup-required",
      base: baseBranch,
      baseUpdated: outcome.status === "updated",
      to: remoteOid,
      worktreePath: managedPath,
    };
  }

  return outcome;
}
