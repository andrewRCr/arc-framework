/**
 * Git utility functions for the ARC CLI.
 *
 * Wraps git operations (availability check, repo detection, config, merge-file)
 * with an injectable executor for testability.
 */

import { normalizeGitRejection } from "./process-error.js";

/** Result from executing a git command. */
export interface ExecResult {
  stdout: string;
  stderr?: string;
}

/** Stable execution controls honored by production and injected Git executors. */
export interface GitExecOptions {
  /**
   * Abort signal for bounded-time invocations. Production cancellation rejects
   * with a `GitProcessError` whose kind is `canceled`.
   */
  signal?: AbortSignal;
  /**
   * Working directory for the process, allowing callers to pin the invocation
   * against a resolved repo root regardless of `process.cwd()`.
   */
  cwd?: string;
  /**
   * Alternate Git index used by index-lock transactions. The production
   * executor maps this to `GIT_INDEX_FILE` after clearing inherited
   * repository-local Git variables.
   */
  indexFile?: string;
}

/** Plain-Promise, argument-array Git execution seam. */
export type GitExec = (
  cmd: string,
  args: string[],
  options?: GitExecOptions,
) => Promise<ExecResult>;

/**
 * A git invocation that pipes `input` to the subprocess stdin and resolves with
 * its stdout. The stdin-fed counterpart to {@link GitExec}, for plumbing that
 * reads its payload from stdin (`hash-object --stdin`, `mktree`) — which
 * captured-output {@link GitExec} cannot provide. Production wires an
 * execa stdin adapter without shell interpolation.
 */
export type GitExecInput = (args: string[], input: string) => Promise<string>;

/**
 * Capture the exact current Git index and return a bounded restore operation.
 *
 * The snapshot is materialized as a tree object before the caller mutates the
 * index. Restoring it replaces only index state; working-tree bytes are owned by
 * the caller's corresponding filesystem rollback.
 *
 * @param exec - Injectable command executor
 * @param cwd - Repository root whose index should be captured
 * @returns A restore operation bound to the captured index tree
 */
export async function captureGitIndexState(
  exec: GitExec,
  cwd: string,
): Promise<() => Promise<void>> {
  const { stdout } = await exec("git", ["write-tree"], { cwd });
  const tree = stdout.trim();
  if (tree === "") throw new Error("git write-tree returned an empty index snapshot");
  return async () => {
    await exec("git", ["read-tree", tree], { cwd });
  };
}

/**
 * Checks whether git is available on PATH.
 *
 * @param exec - Injectable command executor
 * @returns true if git responds to --version
 */
export async function checkGitAvailable(exec: GitExec): Promise<boolean> {
  try {
    await exec("git", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether the current directory is inside a git repository.
 *
 * @param exec - Injectable command executor
 * @returns true if inside a git work tree, false otherwise
 */
export async function isGitRepo(exec: GitExec): Promise<boolean> {
  try {
    const { stdout } = await exec("git", [
      "rev-parse",
      "--is-inside-work-tree",
    ]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

/**
 * Resolves the current git branch name via `git rev-parse --abbrev-ref HEAD`.
 *
 * Returns `null` for detached HEAD (`HEAD` literal), empty output, or any
 * exec failure (e.g., not inside a git repo). Callers receive a uniform
 * "no branch resolvable" signal regardless of root cause.
 *
 * @param exec - Injectable command executor
 * @returns The current branch name, or `null` if not resolvable
 */
export async function getCurrentBranch(exec: GitExec): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    const branch = stdout.trim();
    if (branch === "HEAD" || branch === "") return null;
    return branch;
  } catch {
    return null;
  }
}

/** Outcome of a {@link boundedFetch} — `ok`, or a degraded reason. */
export type BoundedFetchOutcome = "ok" | "timeout" | "error";

/** Result of a {@link boundedFetch}: the outcome plus the raw rejection on `error`. */
export interface BoundedFetchResult {
  outcome: BoundedFetchOutcome;
  /**
   * The caught rejection when `outcome` is `error`, so callers can refine it
   * (e.g., classify a deleted upstream branch as branch-gone). Omitted otherwise.
   */
  error?: unknown;
}

/**
 * Bounded `git fetch origin <ref>` — a non-destructive tracking-ref update under
 * an abort-signal timeout so a hung remote cannot stall a probe.
 *
 * Classifies a rejection as `timeout` only when this helper's signal fired and
 * normalization identifies cancellation. Every other rejection resolves to
 * `error` with its typed failure attached for caller-side refinement.
 *
 * @param exec - Injectable command executor
 * @param ref - Remote ref to fetch (a branch name under `origin`)
 * @param timeoutMs - Abort the fetch after this many milliseconds
 * @returns The fetch outcome, carrying the normalized rejection on `error`
 */
export async function boundedFetch(
  exec: GitExec,
  ref: string,
  timeoutMs: number,
): Promise<BoundedFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    await exec("git", ["fetch", "origin", ref], { signal: controller.signal });
    return { outcome: "ok" };
  } catch (err) {
    const error = normalizeGitRejection(err, { command: "git", args: ["fetch", "origin", ref] });
    if (controller.signal.aborted && error.kind === "canceled") return { outcome: "timeout" };
    return { outcome: "error", error };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run an arbitrary argument-array Git invocation under the standard fetch
 * timeout. This is used when a caller must own the complete fetch refspec
 * rather than update a conventional remote-tracking ref.
 */
export async function boundedGitInvocation(
  exec: GitExec,
  args: string[],
  timeoutMs: number,
): Promise<BoundedFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    await exec("git", args, { signal: controller.signal });
    return { outcome: "ok" };
  } catch (err) {
    const error = normalizeGitRejection(err, { command: "git", args });
    if (controller.signal.aborted && error.kind === "canceled") return { outcome: "timeout" };
    return { outcome: "error", error };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether an `origin` remote is configured (`git remote get-url origin`).
 *
 * @param exec - Injectable command executor
 * @returns true when origin resolves, false on any failure
 */
export async function checkOriginExists(exec: GitExec): Promise<boolean> {
  try {
    await exec("git", ["remote", "get-url", "origin"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Retrieves a git config value by key.
 *
 * @param exec - Injectable command executor
 * @param key - Git config key (e.g., "user.name", "arc.identity")
 * @returns The config value, or undefined if the key does not exist
 */
export async function gitConfigGet(
  exec: GitExec,
  key: string,
): Promise<string | undefined> {
  try {
    const { stdout } = await exec("git", ["config", "--get", key]);
    return stdout.trim();
  } catch {
    return undefined;
  }
}

/** Git config scope (`--local` / `--global` / `--system`). */
export type GitConfigScope = "local" | "global" | "system";

/**
 * Sets a git config value. When `scope` is provided, the corresponding
 * `--<scope>` flag is passed to git. When omitted, no scope flag is added —
 * git's effective default (local, when inside a repo) applies.
 *
 * @param exec - Injectable command executor
 * @param key - Git config key
 * @param value - Value to set
 * @param scope - Optional explicit scope (`local` / `global` / `system`)
 */
export async function gitConfigSet(
  exec: GitExec,
  key: string,
  value: string,
  scope?: GitConfigScope,
): Promise<void> {
  const args = ["config"];
  if (scope) args.push(`--${scope}`);
  args.push(key, value);
  await exec("git", args);
}

/**
 * Unsets a git config key. Idempotent — returns no-op success when the key
 * is absent (pre-checked via `gitConfigGet`); real `--unset` failures
 * propagate.
 *
 * @param exec - Injectable command executor
 * @param key - Git config key to clear
 */
export async function gitConfigUnset(
  exec: GitExec,
  key: string,
): Promise<void> {
  const existing = await gitConfigGet(exec, key);
  if (existing === undefined) return;
  await exec("git", ["config", "--unset", key]);
}

/** Result of a three-way merge operation. */
export interface MergeResult {
  content: string;
  hasConflicts: boolean;
}

/**
 * Performs a three-way merge using `git merge-file -p`.
 *
 * @param exec - Injectable command executor
 * @param current - Path to the current (local) version
 * @param base - Path to the common ancestor version
 * @param other - Path to the other (remote) version
 * @returns Merged content and whether conflicts were detected
 */
export async function gitMergeFile(
  exec: GitExec,
  current: string,
  base: string,
  other: string,
): Promise<MergeResult> {
  try {
    const { stdout } = await exec("git", [
      "merge-file",
      "-p",
      current,
      base,
      other,
    ]);
    return { content: stdout, hasConflicts: false };
  } catch (err: unknown) {
    const error = normalizeGitRejection(err, {
      command: "git", args: ["merge-file", "-p", current, base, other],
    });
    if (error.exitCode === 1) return { content: error.stdout, hasConflicts: true };
    throw error;
  }
}
