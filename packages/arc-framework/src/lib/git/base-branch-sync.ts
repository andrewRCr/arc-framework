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

import { z } from "zod";

import {
  boundedFetch,
  checkOriginExists,
  type GitExec,
} from "./exec.js";
import { localPathsEqual } from "../local-path-identity.js";
import {
  countAheadBehindRef,
  DEFAULT_FETCH_TIMEOUT_MS,
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
export const BaseCheckoutLocusSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("not-checked-out") }),
  z.strictObject({
    kind: z.literal("current"),
    path: z.string().refine((value) => value.trim().length > 0, "path must not be empty"),
    primary: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("elsewhere"),
    path: z.string().refine((value) => value.trim().length > 0, "path must not be empty"),
    primary: z.boolean(),
  }),
  z.strictObject({ kind: z.literal("unknown") }),
]);

/** Where the local base branch is checked out relative to this session. */
export type BaseCheckoutLocus = z.infer<typeof BaseCheckoutLocusSchema>;

const BASE_SYNC_COMMON_SHAPE = {
  base: z.string().refine((value) => value.trim().length > 0, "base branch must not be empty"),
  checkout: BaseCheckoutLocusSchema,
};
const ZERO = z.literal(0);
const POSITIVE_DISTANCE = z.number().int().positive();

/** Runtime authority for the base-branch synchronization advisory. */
export const BaseBranchSyncStatusResultSchema = z.discriminatedUnion("state", [
  z.strictObject({ ...BASE_SYNC_COMMON_SHAPE, state: z.literal("clean"), ahead: ZERO, behind: ZERO }),
  z.strictObject({
    ...BASE_SYNC_COMMON_SHAPE,
    state: z.literal("remote-ahead"),
    ahead: ZERO,
    behind: POSITIVE_DISTANCE,
  }),
  z.strictObject({
    ...BASE_SYNC_COMMON_SHAPE,
    state: z.literal("local-ahead"),
    ahead: POSITIVE_DISTANCE,
    behind: ZERO,
  }),
  z.strictObject({
    ...BASE_SYNC_COMMON_SHAPE,
    state: z.literal("diverged"),
    ahead: POSITIVE_DISTANCE,
    behind: POSITIVE_DISTANCE,
  }),
  z.strictObject({ ...BASE_SYNC_COMMON_SHAPE, state: z.literal("skipped"), ahead: ZERO, behind: ZERO }),
  z.strictObject({ ...BASE_SYNC_COMMON_SHAPE, state: z.literal("no-remote"), ahead: ZERO, behind: ZERO }),
  z.strictObject({
    ...BASE_SYNC_COMMON_SHAPE,
    state: z.literal("remote-unavailable"),
    ahead: ZERO,
    behind: ZERO,
    failureReason: z.enum(["timeout", "error"]),
  }),
]);

/** Base-branch synchronization status and checkout locus. */
export type BaseBranchSyncStatusResult = z.infer<typeof BaseBranchSyncStatusResultSchema>;

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

  let distance: Awaited<ReturnType<typeof countAheadBehindRef>>;
  try {
    // Local `<base>` (not HEAD) against the freshened remote base. A missing
    // local base ref makes `rev-list` throw, caught below as a degraded read.
    distance = await countAheadBehindRef(exec, baseBranch, `origin/${baseBranch}`);
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

  const result = {
    state: distance.state,
    ahead: distance.ahead,
    behind: distance.behind,
    base: baseBranch,
    checkout,
  };
  // Validate for effect so schema defects propagate without letting Zod's
  // schema-key order change the established session-envelope wire bytes.
  BaseBranchSyncStatusResultSchema.parse(result);
  return result as BaseBranchSyncStatusResult;
}
