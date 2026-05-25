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

import { getCurrentBranch, type GitExec } from "./exec.js";

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

  const fetchOutcome = await boundedFetch(exec, branch, fetchTimeoutMs);
  if (fetchOutcome === "branch-gone") {
    // Recoverable, non-network failure: the remote branch was deleted. Carries
    // no failureReason — that field flags transient remote-unavailable causes.
    return { state: "branch-gone", ahead: 0, behind: 0, branch };
  }
  if (fetchOutcome !== "ok") {
    return {
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      branch,
      failureReason: fetchOutcome,
    };
  }

  const counts = await countAheadBehind(exec, branch);
  return { state: classifyState(counts), ...counts, branch };
}

type FetchOutcome = "ok" | "timeout" | "branch-gone" | "error";

async function boundedFetch(
  exec: GitExec,
  branch: string,
  timeoutMs: number,
): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    await exec("git", ["fetch", "origin", branch], { signal: controller.signal });
    return "ok";
  } catch (err) {
    // Classify on AbortError name, not signal.aborted — a non-abort fetch
    // error coincident with the timer firing would otherwise misclassify.
    if (err instanceof Error && err.name === "AbortError") return "timeout";
    if (isBranchGoneError(err)) return "branch-gone";
    return "error";
  } finally {
    clearTimeout(timer);
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
