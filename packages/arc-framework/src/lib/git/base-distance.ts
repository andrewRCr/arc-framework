/**
 * Base-distance sync probe — non-destructive comparison of local HEAD against
 * `origin/<base>`, where `<base>` is the configured integration base branch.
 *
 * Surfaces behind-base drift: how far the current branch has fallen behind the
 * base it forked from while work proceeded. Distinct from the worktree-sync
 * probe (HEAD vs the branch's own upstream `origin/<branch>`) — this one always
 * targets the base branch, regardless of the current branch's own upstream.
 *
 * Reuses the ref-parameterized distance primitive from worktree-sync rather
 * than re-implementing the `rev-list` body. Advisory only: the recommendation
 * layer decides whether a resume surfaces a reconcile offer.
 *
 * @module
 */

import {
  boundedFetch,
  checkOriginExists,
  getCurrentBranch,
  type GitExec,
} from "./exec.js";
import {
  countAheadBehindRef,
  DEFAULT_FETCH_TIMEOUT_MS,
  type WorktreeSyncState,
} from "./worktree-sync.js";

export interface BaseDistanceStatusResult {
  /**
   * Distance classification reusing {@link WorktreeSyncState}. Healthy arms
   * (`clean` / `local-ahead` / `remote-ahead` / `diverged`) come from the
   * distance primitive; degraded arms (`skipped` / `detached-head` /
   * `no-remote` / `remote-unavailable`) are set directly. `local-ahead` is the
   * common healthy case — the branch carries commits the base does not;
   * `remote-ahead` is the behind-base drift this probe exists to surface.
   */
  state: WorktreeSyncState;
  /** HEAD commits not in `origin/<base>`. Always 0 outside healthy states. */
  ahead: number;
  /** `origin/<base>` commits not in HEAD — the behind-base distance. Always 0 outside healthy states. */
  behind: number;
  /**
   * The base branch compared against (the resolved `branch.base`). `null` only
   * on `detached-head`, where there is no current branch for the drift advisory
   * to apply to.
   */
  base: string | null;
  /** Distinguishes failure modes when `state` is `remote-unavailable`. Omitted otherwise. */
  failureReason?: "timeout" | "error";
}

export interface RunBaseDistanceStatusOptions {
  exec: GitExec;
  /** Resolved `branch.base` — the integration base branch to compare against. */
  baseBranch: string;
  /** Whether `session.remote_sync` is enabled. False short-circuits to `skipped`. */
  remoteSyncEnabled: boolean;
  /** Bounded fetch timeout in milliseconds. Defaults to {@link DEFAULT_FETCH_TIMEOUT_MS}. */
  fetchTimeoutMs?: number;
}

/**
 * Probe the distance from local HEAD to `origin/<base>`.
 *
 * Non-destructive: at most performs a narrow `git fetch origin <base>` so the
 * base tracking ref is current before the distance read. Degrades gracefully
 * when the base ref cannot be obtained (no remote, fetch failure) rather than
 * throwing — a fresh clone that has never fetched the base still resolves to a
 * typed degraded state.
 */
export async function runBaseDistanceStatus(
  options: RunBaseDistanceStatusOptions,
): Promise<BaseDistanceStatusResult> {
  const { exec, baseBranch, remoteSyncEnabled, fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = options;

  if (!remoteSyncEnabled) {
    return { state: "skipped", ahead: 0, behind: 0, base: baseBranch };
  }

  // Behind-base drift is a branch-relative advisory; a detached HEAD has no
  // branch for it to apply to, so degrade rather than report a bare distance.
  const branch = await getCurrentBranch(exec);
  if (branch === null) {
    return { state: "detached-head", ahead: 0, behind: 0, base: null };
  }

  if (!(await checkOriginExists(exec))) {
    return { state: "no-remote", ahead: 0, behind: 0, base: baseBranch };
  }

  // A non-`ok` outcome is uniformly degraded here: unlike the worktree probe,
  // base-distance has no branch-gone recovery arm, so a deleted base ref simply
  // reads as remote-unavailable rather than a distinct state.
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

  const { ahead, behind, state } = await countAheadBehindRef(exec, "HEAD", `origin/${baseBranch}`);
  return { state, ahead, behind, base: baseBranch };
}
