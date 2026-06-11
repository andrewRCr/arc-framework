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

import { getCurrentBranch, type GitExec } from "./exec.js";
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

  const fetchOutcome = await boundedFetch(exec, baseBranch, fetchTimeoutMs);
  if (fetchOutcome !== "ok") {
    return {
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      base: baseBranch,
      failureReason: fetchOutcome,
    };
  }

  const { ahead, behind, state } = await countAheadBehindRef(exec, "HEAD", `origin/${baseBranch}`);
  return { state, ahead, behind, base: baseBranch };
}

type FetchOutcome = "ok" | "timeout" | "error";

/**
 * Bounded `git fetch origin <base>`. A missing remote ref (deleted base, exit
 * 128) collapses into `error` — unlike the worktree probe, base-distance has no
 * branch-gone recovery arm, so a non-`ok` outcome is uniformly degraded.
 */
async function boundedFetch(
  exec: GitExec,
  baseBranch: string,
  timeoutMs: number,
): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    await exec("git", ["fetch", "origin", baseBranch], { signal: controller.signal });
    return "ok";
  } catch (err) {
    // Classify on AbortError name, not signal.aborted — a non-abort fetch error
    // coincident with the timer firing would otherwise misclassify as timeout.
    if (err instanceof Error && err.name === "AbortError") return "timeout";
    return "error";
  } finally {
    clearTimeout(timer);
  }
}

async function checkOriginExists(exec: GitExec): Promise<boolean> {
  try {
    await exec("git", ["remote", "get-url", "origin"]);
    return true;
  } catch {
    return false;
  }
}
