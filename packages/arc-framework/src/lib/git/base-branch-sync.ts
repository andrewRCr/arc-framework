/**
 * Base-branch-sync probe — non-destructive comparison of the local `<base>`
 * branch ref against `origin/<base>`, where `<base>` is the configured
 * integration base branch.
 *
 * Surfaces a silently-stale local base: how far the local base ref has fallen
 * behind its remote while a sibling clone (or this clone) worked on a feature
 * branch. Distinct from the base-distance probe (HEAD vs `origin/<base>`) —
 * that one measures the current branch's drift from the base; this one measures
 * the *local base ref's own* drift from the remote base, regardless of what is
 * checked out. A returning machine can sit on a feature branch with a local
 * `main` that is days behind `origin/main` and never notice; this probe makes
 * that visible at session-init.
 *
 * Reuses the ref-parameterized distance primitive from worktree-sync rather
 * than re-implementing the `rev-list` body — same primitive, new invocation
 * (`<base>` vs `origin/<base>` instead of `HEAD` vs `origin/<base>`). Advisory
 * only; the recommendation layer (config-gated) decides what a resume does with
 * a stale base.
 *
 * @module
 */

import {
  boundedFetch,
  checkOriginExists,
  type GitExec,
} from "./exec.js";
import {
  countAheadBehindRef,
  DEFAULT_FETCH_TIMEOUT_MS,
  type WorktreeSyncState,
} from "./worktree-sync.js";

export interface BaseBranchSyncStatusResult {
  /**
   * Distance classification reusing {@link WorktreeSyncState}. Healthy arms
   * (`clean` / `local-ahead` / `remote-ahead` / `diverged`) come from the
   * distance primitive; degraded arms (`skipped` / `no-remote` /
   * `remote-unavailable`) are set directly. `remote-ahead` is the
   * silently-behind-base case this probe exists to surface — the local base ref
   * is a strict ancestor of the remote and fast-forwardable; `local-ahead` /
   * `diverged` mean the local base carries unpushed commits (an edge worth
   * surfacing but never auto-resolved). No `detached-head` arm: the comparison
   * targets a named base ref, not HEAD, so a detached checkout is irrelevant.
   */
  state: WorktreeSyncState;
  /** Local `<base>` commits not in `origin/<base>`. Always 0 outside healthy states. */
  ahead: number;
  /** `origin/<base>` commits not in local `<base>` — the behind distance. Always 0 outside healthy states. */
  behind: number;
  /** The base branch compared against (the resolved `branch.base`). */
  base: string;
  /** Distinguishes failure modes when `state` is `remote-unavailable`. Omitted otherwise. */
  failureReason?: "timeout" | "error";
}

export interface RunBaseBranchSyncStatusOptions {
  exec: GitExec;
  /** Resolved `branch.base` — the integration base branch to compare against. */
  baseBranch: string;
  /** Whether `session.remote_sync` is enabled. False short-circuits to `skipped`. */
  remoteSyncEnabled: boolean;
  /** Bounded fetch timeout in milliseconds. Defaults to {@link DEFAULT_FETCH_TIMEOUT_MS}. */
  fetchTimeoutMs?: number;
}

/**
 * Probe the distance from the local `<base>` ref to `origin/<base>`.
 *
 * Non-destructive: at most performs a narrow `git fetch origin <base>` so the
 * base tracking ref is current before the distance read. Degrades gracefully
 * when the comparison cannot be made (no remote, fetch failure, or a local base
 * ref that does not exist — a fresh clone that has never materialized the base
 * locally) rather than throwing.
 */
export async function runBaseBranchSyncStatus(
  options: RunBaseBranchSyncStatusOptions,
): Promise<BaseBranchSyncStatusResult> {
  const { exec, baseBranch, remoteSyncEnabled, fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = options;

  if (!remoteSyncEnabled) {
    return { state: "skipped", ahead: 0, behind: 0, base: baseBranch };
  }

  if (!(await checkOriginExists(exec))) {
    return { state: "no-remote", ahead: 0, behind: 0, base: baseBranch };
  }

  // A non-`ok` outcome is uniformly degraded here: like base-distance, this
  // probe has no branch-gone recovery arm, so a deleted base ref simply reads
  // as remote-unavailable rather than a distinct state.
  const fetch = await boundedFetch(exec, baseBranch, fetchTimeoutMs);
  if (fetch.outcome !== "ok") {
    return {
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      base: baseBranch,
      failureReason: fetch.outcome,
    };
  }

  try {
    // Local `<base>` (not HEAD) against the freshened remote base. A missing
    // local base ref makes `rev-list` throw, caught below as a degraded read.
    const { ahead, behind, state } = await countAheadBehindRef(exec, baseBranch, `origin/${baseBranch}`);
    return { state, ahead, behind, base: baseBranch };
  } catch {
    return {
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      base: baseBranch,
      failureReason: "error",
    };
  }
}
