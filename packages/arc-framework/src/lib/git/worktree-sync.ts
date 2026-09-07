/**
 * Worktree sync state probe — non-destructive comparison of local HEAD
 * against `origin/<current-branch>`.
 *
 * Pure git plumbing. Branch-scoped, not identity-scoped — distinct from
 * `commands/user/sync-status.ts` which probes user-notes refs.
 *
 * Named passive and materializing adapters select acquisition policy around
 * the shared snapshot analyzer; the legacy fetch-owning entry point remains
 * for session-init until its shared snapshot composition takes over.
 *
 * @module
 */

import {
  boundedFetch,
  checkOriginExists,
  getCurrentBranch,
  type GitExec,
  type GitExecInput,
} from "./exec.js";
import type { HistoryCompletenessResult } from "./history-completeness.js";
import { readHistoryCompleteness } from "./history-completeness.js";
import type { RemoteFailureReason } from "../kernel/index.js";
import type { ObjectAvailabilityResult } from "./object-availability.js";
import { readObjectAvailability } from "./object-availability.js";
import { isGitObjectId } from "./object-id.js";
import { isGitProcessError } from "./process-error.js";
import {
  readRemoteHeadSnapshot,
  type RemoteHeadSnapshotResult,
} from "./remote-ref-reader.js";

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

/** Inputs for one passive exact-ref worktree inspection. */
export interface RunPassiveWorktreeInspectionOptions {
  exec: GitExec;
  execInput: GitExecInput;
  /** Whether automatic remote inspection is enabled for this caller. */
  remoteSyncEnabled: boolean;
  /** Bounded exact-ref timeout in milliseconds. */
  timeoutMs?: number;
  /** Repository root, when ambient process state must not select the repository. */
  cwd?: string;
}

/** Inputs for one explicit materializing worktree inspection. */
export interface RunMaterializingWorktreeInspectionOptions {
  exec: GitExec;
  /** Bounded fetch timeout in milliseconds. */
  fetchTimeoutMs?: number;
  /** Repository root whose tracking refs may be materialized. */
  cwd?: string;
}

/** Supplied remote and local prerequisites for one tracked worktree relation. */
export interface AnalyzeWorktreeSnapshotOptions {
  exec: GitExec;
  /** Whether automatic remote inspection is enabled for this caller. */
  remoteSyncEnabled: boolean;
  /** Whether the configured remote exists locally. */
  originConfigured: boolean;
  /** Current local branch name carried into the result. */
  branch: string | null;
  /** Remote branch selected by the local upstream configuration. */
  upstreamBranch: string | null;
  snapshot: RemoteHeadSnapshotResult;
  objectAvailability: ObjectAvailabilityResult;
  history: HistoryCompletenessResult;
}

/** Worktree relation classified against one immutable advertised snapshot. */
export type WorktreeSnapshotAnalysisResult = Omit<WorktreeSyncStatusResult, "failureReason"> & (
  | { remoteEvidence: "exact" | "pending-fetch" | "not-applicable" }
  | { remoteEvidence: "unreachable"; failureReason: RemoteFailureReason }
);

/** Exact or locally inapplicable result from an explicit materializing inspection. */
export type WorktreeMaterializingInspectionResult = Omit<
  WorktreeSyncStatusResult,
  "failureReason" | "state"
> & {
  state: Exclude<WorktreeSyncState, "skipped" | "remote-unavailable">;
  remoteEvidence: "exact" | "not-applicable";
};

/** Analyze a tracked worktree against supplied remote evidence without acquiring it. */
export async function analyzeWorktreeSnapshot(
  options: AnalyzeWorktreeSnapshotOptions,
): Promise<WorktreeSnapshotAnalysisResult> {
  // Detachment outranks the disabled-sync shortcut. Returning `skipped` first would
  // emit a null branch under a state whose envelope invariant requires a named one,
  // so a detached HEAD with remote sync off made the composite reject its own result.
  if (options.branch === null) {
    return {
      state: "detached-head",
      ahead: 0,
      behind: 0,
      branch: null,
      remoteEvidence: "not-applicable",
    };
  }
  if (!options.remoteSyncEnabled) {
    return {
      state: "skipped",
      ahead: 0,
      behind: 0,
      branch: options.branch,
      remoteEvidence: "not-applicable",
    };
  }
  if (!options.originConfigured) {
    return {
      state: "no-remote",
      ahead: 0,
      behind: 0,
      branch: options.branch,
      remoteEvidence: "not-applicable",
    };
  }
  if (options.upstreamBranch === null) {
    return {
      state: "no-upstream",
      ahead: 0,
      behind: 0,
      branch: options.branch,
      remoteEvidence: "not-applicable",
    };
  }
  if (options.snapshot.kind === "unreachable") {
    return {
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      branch: options.branch,
      remoteEvidence: "unreachable",
      failureReason: options.snapshot.failureReason,
    };
  }
  const advertisedOid = options.snapshot.tips[options.upstreamBranch];
  if (advertisedOid === undefined) {
    return {
      state: "branch-gone",
      ahead: 0,
      behind: 0,
      branch: options.branch,
      remoteEvidence: "exact",
    };
  }
  if (options.objectAvailability.kind !== "complete") {
    throw new Error(options.objectAvailability.reason === "execution"
      ? "Local worktree object-availability inspection failed."
      : "Local worktree object-availability inspection returned malformed output.");
  }
  const advertisedCommitIsLocal = options.objectAvailability.commits[advertisedOid];
  if (advertisedCommitIsLocal === false) {
    return {
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      branch: options.branch,
      remoteEvidence: "pending-fetch",
    };
  }
  if (advertisedCommitIsLocal === undefined) {
    throw new Error("The advertised worktree commit has no local availability fact.");
  }
  const localOnlyExec: GitExec = (command, args, execOptions) => options.exec(command, args, {
    ...execOptions,
    objectAccess: "local-only",
  });
  const localOid = (await localOnlyExec("git", ["rev-parse", "HEAD"])).stdout.trim();
  if (!isGitObjectId(localOid)) {
    throw new Error("Cannot resolve the local worktree commit.");
  }
  if (localOid === advertisedOid) {
    return {
      state: "clean",
      ahead: 0,
      behind: 0,
      branch: options.branch,
      remoteEvidence: "exact",
    };
  }
  if (options.history.kind !== "complete") {
    throw new Error(options.history.kind === "shallow"
      ? "Complete local history is required for worktree distance analysis."
      : options.history.reason === "execution"
        ? "Local worktree history inspection failed."
        : "Local worktree history inspection returned malformed output.");
  }
  const relation = await countAheadBehindRef(localOnlyExec, localOid, advertisedOid);
  return { ...relation, branch: options.branch, remoteEvidence: "exact" };
}

/** Default bounded timeout for the worktree-sync fetch. */
export const DEFAULT_FETCH_TIMEOUT_MS = 3000;
/**
 * Inspect one tracked worktree through a bounded exact-ref read without materializing objects.
 *
 * @param options - Local Git boundaries, automatic-inspection policy, and timeout.
 * @returns The evidence-qualified worktree relation.
 */
export async function runPassiveWorktreeInspection(
  options: RunPassiveWorktreeInspectionOptions,
): Promise<WorktreeSnapshotAnalysisResult> {
  const exec: GitExec = (command, args, execOptions) => options.exec(command, args, {
    ...execOptions,
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  });
  const branch = await readCurrentBranch(exec);
  const unavailableSnapshot = { kind: "unreachable", failureReason: "error" } as const;
  const unavailableObjects = { kind: "unavailable", reason: "execution" } as const;
  const unavailableHistory = { kind: "unavailable", reason: "execution" } as const;
  if (!options.remoteSyncEnabled || branch === null) {
    return analyzeWorktreeSnapshot({
      exec,
      remoteSyncEnabled: options.remoteSyncEnabled,
      originConfigured: false,
      branch,
      upstreamBranch: null,
      snapshot: unavailableSnapshot,
      objectAvailability: unavailableObjects,
      history: unavailableHistory,
    });
  }

  const originConfigured = await readOriginConfiguration(exec);
  if (!originConfigured) {
    return analyzeWorktreeSnapshot({
      exec,
      remoteSyncEnabled: true,
      originConfigured: false,
      branch,
      upstreamBranch: null,
      snapshot: unavailableSnapshot,
      objectAvailability: unavailableObjects,
      history: unavailableHistory,
    });
  }

  const upstreamBranch = await readConfiguredUpstreamBranch(exec, branch);
  if (upstreamBranch === null) {
    return analyzeWorktreeSnapshot({
      exec,
      remoteSyncEnabled: true,
      originConfigured: true,
      branch,
      upstreamBranch: null,
      snapshot: unavailableSnapshot,
      objectAvailability: unavailableObjects,
      history: unavailableHistory,
    });
  }

  const snapshot = await readRemoteHeadSnapshot({
    exec,
    scope: { kind: "exact", branch: upstreamBranch },
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  let objectAvailability: ObjectAvailabilityResult = unavailableObjects;
  let history: HistoryCompletenessResult = unavailableHistory;
  if (snapshot.kind === "available") {
    const advertisedOid = snapshot.tips[upstreamBranch];
    if (advertisedOid !== undefined) {
      objectAvailability = await readObjectAvailability({
        execInput: options.execInput,
        oids: [advertisedOid],
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      });
      if (objectAvailability.kind !== "complete") {
        throw new Error("Cannot inspect advertised worktree object availability.");
      }
      if (objectAvailability.commits[advertisedOid] === true) {
        history = await readHistoryCompleteness({
          exec,
          ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
        });
      }
    }
  }
  return analyzeWorktreeSnapshot({
    exec,
    remoteSyncEnabled: true,
    originConfigured: true,
    branch,
    upstreamBranch,
    snapshot,
    objectAvailability,
    history,
  });
}

/**
 * Inspect one tracked worktree after explicitly materializing its remote tip.
 *
 * @param options - Git boundary and bounded fetch timeout.
 * @returns An exact relation or a locally inapplicable result.
 */
export async function runMaterializingWorktreeInspection(
  options: RunMaterializingWorktreeInspectionOptions,
): Promise<WorktreeMaterializingInspectionResult> {
  const exec = bindGitExecToCwd(options.exec, options.cwd);
  const branch = await readCurrentBranch(exec);
  if (branch === null) {
    return {
      state: "detached-head",
      ahead: 0,
      behind: 0,
      branch: null,
      remoteEvidence: "not-applicable",
    };
  }

  const upstreamBranch = await readConfiguredUpstreamBranch(exec, branch);
  if (upstreamBranch === null) {
    const hasOrigin = await checkOriginExists(exec);
    return {
      state: hasOrigin ? "no-upstream" : "no-remote",
      ahead: 0,
      behind: 0,
      branch,
      remoteEvidence: "not-applicable",
    };
  }

  const fetch = await boundedFetch(
    exec,
    upstreamBranch,
    options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS,
  );
  if (fetch.outcome === "error"
    && isGitProcessError(fetch.error)
    && fetch.error.expectedOutcome === "absent-remote-ref") {
    return analyzeExactMaterializedWorktree({
      exec,
      branch,
      upstreamBranch,
      snapshot: { kind: "available", scope: "exact", tips: {} },
      objectAvailability: { kind: "complete", commits: {} },
      history: { kind: "complete" },
    });
  }
  if (fetch.outcome === "timeout") {
    throw new Error("Materializing the worktree remote tip timed out.");
  }
  if (fetch.outcome === "error") {
    if (fetch.error instanceof Error) throw fetch.error;
    throw new Error("Materializing the worktree remote tip failed.", { cause: fetch.error });
  }

  const advertisedOid = (await exec(
    "git",
    ["rev-parse", `origin/${upstreamBranch}`],
    { objectAccess: "local-only" },
  )).stdout.trim();
  if (!isGitObjectId(advertisedOid)) {
    throw new Error("Cannot resolve the materialized worktree commit.");
  }
  let verifiedCommitOid: string;
  try {
    verifiedCommitOid = (await exec(
      "git",
      ["rev-parse", "--verify", `${advertisedOid}^{commit}`],
      { objectAccess: "local-only" },
    )).stdout.trim();
  } catch (error) {
    throw new Error("The materialized worktree commit is not available locally.", { cause: error });
  }
  if (verifiedCommitOid !== advertisedOid) {
    throw new Error("The materialized worktree commit is not available locally.");
  }
  const history = await readHistoryCompleteness({ exec });
  return analyzeExactMaterializedWorktree({
    exec,
    branch,
    upstreamBranch,
    snapshot: { kind: "available", scope: "exact", tips: { [upstreamBranch]: advertisedOid } },
    objectAvailability: { kind: "complete", commits: { [advertisedOid]: true } },
    history,
  });
}

function bindGitExecToCwd(exec: GitExec, cwd: string | undefined): GitExec {
  if (cwd === undefined) return exec;
  return (command, args, options) => exec(command, args, { ...options, cwd });
}

async function analyzeExactMaterializedWorktree(options: {
  exec: GitExec;
  branch: string;
  upstreamBranch: string;
  snapshot: RemoteHeadSnapshotResult;
  objectAvailability: ObjectAvailabilityResult;
  history: HistoryCompletenessResult;
}): Promise<WorktreeMaterializingInspectionResult> {
  const result = await analyzeWorktreeSnapshot({
    ...options,
    remoteSyncEnabled: true,
    originConfigured: true,
    upstreamBranch: options.upstreamBranch,
  });
  if (
    result.remoteEvidence === "pending-fetch"
    || result.remoteEvidence === "unreachable"
    || result.state === "skipped"
    || result.state === "remote-unavailable"
  ) {
    throw new Error("Materialized worktree inspection did not establish exact evidence.");
  }
  return {
    state: result.state,
    ahead: result.ahead,
    behind: result.behind,
    branch: result.branch,
    remoteEvidence: result.remoteEvidence,
  };
}

async function readCurrentBranch(exec: GitExec): Promise<string | null> {
  const branch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim();
  return branch === "" || branch === "HEAD" ? null : branch;
}

async function readOriginConfiguration(exec: GitExec): Promise<boolean> {
  const remotes = (await exec("git", ["remote"])).stdout
    .split(/\r?\n/u)
    .filter((remote) => remote !== "");
  return remotes.includes("origin");
}

/**
 * Resolve the configured branch name on `origin`, preserving renamed tracking branches.
 *
 * @param exec - Git execution boundary.
 * @param branch - Local branch whose upstream is inspected.
 * @param cwd - Repository root the read runs against. The executor carries no root, so a
 * caller composing one request's evidence must name its own; otherwise this resolves
 * against the process directory and can describe a different repository than the
 * snapshot it is compared with.
 * @returns The upstream branch name without the `origin/` prefix, or null when untracked.
 */
export async function readConfiguredUpstreamBranch(
  exec: GitExec,
  branch: string,
  cwd?: string,
): Promise<string | null> {
  const stdout = (await exec(
    "git",
    ["for-each-ref", "--format=%(upstream:short)", `refs/heads/${branch}`],
    cwd === undefined ? {} : { cwd },
  )).stdout;
  const records = stdout.split(/\r?\n/u).filter((record) => record !== "");
  if (records.length > 1) throw new Error("Cannot resolve a unique worktree upstream.");
  if (records.length === 0) return null;
  const upstream = records[0] ?? "";
  if (!upstream.startsWith("origin/")) return null;
  if (upstream.length === "origin/".length) throw new Error("Cannot resolve the origin branch name.");
  return upstream.slice("origin/".length);
}

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
  if (fetch.outcome === "error"
    && isGitProcessError(fetch.error)
    && fetch.error.expectedOutcome === "absent-remote-ref") {
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
  const match = /^(0|[1-9]\d*)[\t ]+(0|[1-9]\d*)\r?\n?$/u.exec(stdout);
  if (match === null) {
    throw new Error("Malformed git rev-list --count output.");
  }
  const ahead = Number(match[1]);
  const behind = Number(match[2]);
  if (!Number.isSafeInteger(ahead) || !Number.isSafeInteger(behind)) {
    throw new Error("Git rev-list --count output exceeds the safe integer range.");
  }
  return { ahead, behind, state: classifyState({ ahead, behind }) };
}

function classifyState(counts: AheadBehind): WorktreeSyncState {
  if (counts.ahead === 0 && counts.behind === 0) return "clean";
  if (counts.behind === 0) return "local-ahead";
  if (counts.ahead === 0) return "remote-ahead";
  return "diverged";
}
