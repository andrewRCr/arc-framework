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
 * Also reports where the local base is checked out (if anywhere) so the
 * recommendation layer can refuse fetch-into-ref when the base is held in a
 * worktree — Git rejects `fetch origin <base>:<base>` against a checked-out
 * branch.
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
import { localPathsEqual } from "../local-path-identity.js";
import {
  countAheadBehindRef,
  DEFAULT_FETCH_TIMEOUT_MS,
  type WorktreeSyncState,
} from "./worktree-sync.js";
import { scanRegisteredWorktrees } from "./worktree-roster.js";

/**
 * Where the local base branch is checked out relative to this session.
 *
 * - `not-checked-out` — no worktree holds `<base>`; fetch-into-ref is viable.
 * - `current` — this worktree holds `<base>`; the worktree channel owns pull.
 * - `elsewhere` — another worktree holds `<base>`; auto fetch-into-ref is unsafe.
 * - `unknown` — worktree topology could not be read; treat as not auto-safe.
 */
export type BaseCheckoutLocus =
  | { kind: "not-checked-out" }
  | { kind: "current"; path: string; primary: boolean }
  | { kind: "elsewhere"; path: string; primary: boolean }
  | { kind: "unknown" };

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
  /**
   * Checkout locus for the local base branch. Always populated so the
   * recommendation layer can degrade auto-pull when fetch-into-ref would fail.
   */
  checkout: BaseCheckoutLocus;
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
 * Resolve where the local base branch is checked out relative to this worktree.
 *
 * @param exec - Injectable git executor.
 * @param baseBranch - Configured integration base branch name.
 * @returns Checkout locus for recommendation-layer safety decisions.
 */
export async function resolveBaseCheckoutLocus(
  exec: GitExec,
  baseBranch: string,
): Promise<BaseCheckoutLocus> {
  const scan = await scanRegisteredWorktrees(exec);
  if (!scan.ok) return { kind: "unknown" };

  const baseWorktree = scan.worktrees.find((wt) => wt.branch === baseBranch);
  if (baseWorktree === undefined) return { kind: "not-checked-out" };

  let currentPath: string | null;
  try {
    const { stdout } = await exec("git", ["rev-parse", "--show-toplevel"]);
    const trimmed = stdout.trim();
    currentPath = trimmed === "" ? null : trimmed;
  } catch {
    currentPath = null;
  }

  // Topology known, current worktree not — treat as held elsewhere so auto
  // fetch-into-ref degrades rather than racing an unknown checkout.
  if (currentPath === null) {
    return { kind: "elsewhere", path: baseWorktree.path, primary: baseWorktree.primary };
  }

  const same = await localPathsEqual(baseWorktree.path, currentPath);
  return {
    kind: same ? "current" : "elsewhere",
    path: baseWorktree.path,
    primary: baseWorktree.primary,
  };
}

/**
 * Probe the distance from the local `<base>` ref to `origin/<base>`.
 *
 * Non-destructive: at most performs a narrow `git fetch origin <base>` so the
 * base tracking ref is current before the distance read. Degrades gracefully
 * when the comparison cannot be made (no remote, fetch failure, or a local base
 * ref that does not exist — a fresh clone that has never materialized the base
 * locally) rather than throwing. Always attaches the base checkout locus so
 * session-init can refuse a doomed fetch-into-ref.
 */
export async function runBaseBranchSyncStatus(
  options: RunBaseBranchSyncStatusOptions,
): Promise<BaseBranchSyncStatusResult> {
  const { exec, baseBranch, remoteSyncEnabled, fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = options;

  if (!remoteSyncEnabled) {
    return {
      state: "skipped",
      ahead: 0,
      behind: 0,
      base: baseBranch,
      checkout: { kind: "not-checked-out" },
    };
  }

  const checkout = await resolveBaseCheckoutLocus(exec, baseBranch);

  if (!(await checkOriginExists(exec))) {
    return { state: "no-remote", ahead: 0, behind: 0, base: baseBranch, checkout };
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
      checkout,
      failureReason: fetch.outcome,
    };
  }

  try {
    // Local `<base>` (not HEAD) against the freshened remote base. A missing
    // local base ref makes `rev-list` throw, caught below as a degraded read.
    const { ahead, behind, state } = await countAheadBehindRef(exec, baseBranch, `origin/${baseBranch}`);
    return { state, ahead, behind, base: baseBranch, checkout };
  } catch {
    return {
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      base: baseBranch,
      checkout,
      failureReason: "error",
    };
  }
}
