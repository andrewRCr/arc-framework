/**
 * Worktree sync state probe — non-destructive comparison of local HEAD
 * against `origin/<current-branch>`.
 *
 * Pure git plumbing. Branch-scoped, not identity-scoped — distinct from
 * `commands/user/sync-status.ts` which probes user-notes refs.
 *
 * Consumed by the session-init composite envelope and by the `arc user
 * status` qualifier path.
 *
 * @module
 */

import type { GitExec } from "./exec.js";

/**
 * Worktree sync state.
 *
 * Healthy states (`ahead`/`behind` populated):
 * - `clean` — local HEAD matches `origin/<branch>`.
 * - `remote-ahead` — local is strict ancestor of remote.
 * - `local-ahead` — remote is strict ancestor of local.
 * - `diverged` — neither is ancestor of the other.
 *
 * Degraded states (`ahead`/`behind` are 0):
 * - `skipped` — `session.remote_sync: disabled`; no git invocation.
 * - `no-upstream` — current branch has no `@{upstream}` mapping.
 * - `detached-head` — HEAD is detached; no current branch.
 * - `no-remote` — repository has no `origin` remote configured.
 * - `remote-unavailable` — fetch failed (timeout, network, auth).
 */
export type WorktreeSyncState =
  | "skipped"
  | "clean"
  | "remote-ahead"
  | "local-ahead"
  | "diverged"
  | "no-upstream"
  | "detached-head"
  | "no-remote"
  | "remote-unavailable";

export interface WorktreeSyncStatusResult {
  state: WorktreeSyncState;
  /** Local commits not in remote. Always 0 outside healthy states. */
  ahead: number;
  /** Remote commits not in local. Always 0 outside healthy states. */
  behind: number;
  /**
   * Distinguishes failure modes when `state` is `remote-unavailable`.
   * Omitted for all other states.
   */
  failureReason?: "timeout" | "error";
}

export interface RunWorktreeSyncStatusOptions {
  exec: GitExec;
  /** Whether `session.remote_sync` is enabled. False short-circuits to `skipped`. */
  remoteSyncEnabled: boolean;
  /** Bounded fetch timeout in milliseconds. Defaults to {@link DEFAULT_FETCH_TIMEOUT_MS}. */
  fetchTimeoutMs?: number;
}

/** Default bounded timeout for the worktree-sync fetch. */
export const DEFAULT_FETCH_TIMEOUT_MS = 3000;

/**
 * Probe the worktree sync state relative to `origin/<current-branch>`.
 *
 * Non-destructive: at most performs a narrow `git fetch origin <branch>`
 * which updates the standard tracking ref but does not mutate HEAD or any
 * local branch ref.
 */
export async function runWorktreeSyncStatus(
  options: RunWorktreeSyncStatusOptions,
): Promise<WorktreeSyncStatusResult> {
  const { exec, remoteSyncEnabled, fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = options;

  if (!remoteSyncEnabled) {
    return { state: "skipped", ahead: 0, behind: 0 };
  }

  const branch = await getCurrentBranch(exec);
  if (branch === null) {
    return { state: "detached-head", ahead: 0, behind: 0 };
  }

  const upstream = await getUpstream(exec);
  if (upstream === null) {
    const hasOrigin = await checkOriginExists(exec);
    return {
      state: hasOrigin ? "no-upstream" : "no-remote",
      ahead: 0,
      behind: 0,
    };
  }

  const fetchOutcome = await boundedFetch(exec, branch, fetchTimeoutMs);
  if (fetchOutcome !== "ok") {
    return {
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      failureReason: fetchOutcome,
    };
  }

  const counts = await countAheadBehind(exec, branch);
  return { state: classifyState(counts), ...counts };
}

async function boundedFetch(
  exec: GitExec,
  branch: string,
  timeoutMs: number,
): Promise<"ok" | "timeout" | "error"> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    await exec("git", ["fetch", "origin", branch], { signal: controller.signal });
    return "ok";
  } catch {
    return controller.signal.aborted ? "timeout" : "error";
  } finally {
    clearTimeout(timer);
  }
}

async function getCurrentBranch(exec: GitExec): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    const branch = stdout.trim();
    if (branch === "HEAD" || branch === "") return null;
    return branch;
  } catch {
    return null;
  }
}

async function getUpstream(exec: GitExec): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--abbrev-ref", "@{upstream}"]);
    const upstream = stdout.trim();
    return upstream || null;
  } catch {
    return null;
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

interface AheadBehind {
  ahead: number;
  behind: number;
}

async function countAheadBehind(
  exec: GitExec,
  branch: string,
): Promise<AheadBehind> {
  const { stdout } = await exec("git", [
    "rev-list",
    "--left-right",
    "--count",
    `HEAD...origin/${branch}`,
  ]);
  const [aheadStr = "0", behindStr = "0"] = stdout.trim().split(/\s+/u);
  return {
    ahead: Number.parseInt(aheadStr, 10) || 0,
    behind: Number.parseInt(behindStr, 10) || 0,
  };
}

function classifyState(counts: AheadBehind): WorktreeSyncState {
  if (counts.ahead === 0 && counts.behind === 0) return "clean";
  if (counts.behind === 0) return "local-ahead";
  if (counts.ahead === 0) return "remote-ahead";
  return "diverged";
}
