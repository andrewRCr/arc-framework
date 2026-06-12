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

import {
  boundedFetch,
  checkOriginExists,
  getCurrentBranch,
  type GitExec,
} from "./exec.js";

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
 * - `branch-gone` — upstream branch was deleted on the remote; the bounded
 *   fetch reports the ref no longer exists. Split out from `remote-unavailable`
 *   so recovery can key on a recoverable, non-network failure.
 * - `remote-unavailable` — fetch failed for a transient reason (timeout, network, auth).
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
  | "branch-gone"
  | "remote-unavailable";

export interface WorktreeSyncStatusResult {
  state: WorktreeSyncState;
  /** Local commits not in remote. Always 0 outside healthy states. */
  ahead: number;
  /** Remote commits not in local. Always 0 outside healthy states. */
  behind: number;
  /**
   * Current branch name resolved via `getCurrentBranch`. `null` for detached
   * HEAD or any failure to resolve. Populated on every return arm including
   * `skipped` so callers don't need their own branch-resolution helper.
   */
  branch: string | null;
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

  // Resolve branch up-front so every return arm — including the disabled-sync
  // short-circuit — can carry it. Callers consolidate on this single source of
  // truth instead of running parallel `git rev-parse` helpers.
  const branch = await getCurrentBranch(exec);

  if (!remoteSyncEnabled) {
    return { state: "skipped", ahead: 0, behind: 0, branch };
  }

  if (branch === null) {
    return { state: "detached-head", ahead: 0, behind: 0, branch: null };
  }

  const upstream = await getUpstream(exec);
  if (upstream === null) {
    const hasOrigin = await checkOriginExists(exec);
    return {
      state: hasOrigin ? "no-upstream" : "no-remote",
      ahead: 0,
      behind: 0,
      branch,
    };
  }

  const fetch = await boundedFetch(exec, branch, fetchTimeoutMs);
  if (fetch.outcome === "error" && isBranchGoneError(fetch.error)) {
    // Recoverable, non-network failure: the remote branch was deleted. Carries
    // no failureReason — that field flags transient remote-unavailable causes.
    return { state: "branch-gone", ahead: 0, behind: 0, branch };
  }
  if (fetch.outcome !== "ok") {
    return {
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      branch,
      failureReason: fetch.outcome,
    };
  }

  try {
    const { ahead, behind, state } = await countAheadBehindRef(exec, "HEAD", `origin/${branch}`);
    return { state, ahead, behind, branch };
  } catch {
    return {
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      branch,
      failureReason: "error",
    };
  }
}

/**
 * Duck-type a fetch rejection as a deleted-upstream-branch failure. Git exits
 * 128 with a "couldn't find remote ref" stderr when the targeted remote branch
 * no longer exists. `GitExec` types only the resolved `ExecResult`, so the
 * rejection's `code`/`stderr` are read defensively off `unknown`.
 */
function isBranchGoneError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  const stderr = (err as { stderr?: unknown }).stderr;
  const stderrText = typeof stderr === "string" ? stderr : "";
  return code === 128 && /find remote ref/iu.test(stderrText);
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

interface AheadBehind {
  ahead: number;
  behind: number;
}

/**
 * Count ahead/behind commits between two arbitrary refs and classify the
 * relationship. Runs `git rev-list --left-right --count <localRef>...<remoteRef>`,
 * so `ahead` is commits reachable from `localRef` but not `remoteRef`, and
 * `behind` the reverse.
 *
 * Ref-parameterized so any caller comparing a local ref against a tracking ref
 * (HEAD vs `origin/<branch>`, a branch vs `origin/<base>`) shares one
 * implementation. The returned `state` is always one of the healthy distance
 * classifications (`clean` / `local-ahead` / `remote-ahead` / `diverged`);
 * degraded states are the orchestrating caller's concern, not the distance's.
 *
 * @param exec - Git executor.
 * @param localRef - Left side of the symmetric difference (the `ahead` side).
 * @param remoteRef - Right side of the symmetric difference (the `behind` side).
 * @returns Ahead/behind counts plus the classified distance state.
 */
export async function countAheadBehindRef(
  exec: GitExec,
  localRef: string,
  remoteRef: string,
): Promise<{ ahead: number; behind: number; state: WorktreeSyncState }> {
  const { stdout } = await exec("git", [
    "rev-list",
    "--left-right",
    "--count",
    `${localRef}...${remoteRef}`,
  ]);
  const [aheadStr = "0", behindStr = "0"] = stdout.trim().split(/\s+/u);
  const ahead = Number.parseInt(aheadStr, 10) || 0;
  const behind = Number.parseInt(behindStr, 10) || 0;
  return { ahead, behind, state: classifyState({ ahead, behind }) };
}

function classifyState(counts: AheadBehind): WorktreeSyncState {
  if (counts.ahead === 0 && counts.behind === 0) return "clean";
  if (counts.behind === 0) return "local-ahead";
  if (counts.ahead === 0) return "remote-ahead";
  return "diverged";
}
