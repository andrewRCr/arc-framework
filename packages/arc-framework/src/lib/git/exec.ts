/**
 * Git utility functions for the ARC CLI.
 *
 * Wraps git operations (availability check, repo detection, config, merge-file)
 * with an injectable executor for testability.
 */

/** Result from executing a git command. */
export interface ExecResult {
  stdout: string;
  stderr?: string;
}

/** Optional execution controls forwarded to the underlying child_process. */
export interface GitExecOptions {
  /**
   * Abort signal for bounded-time invocations. When the signal fires, the
   * subprocess is killed and the promise rejects with an `AbortError`.
   */
  signal?: AbortSignal;
  /**
   * Working directory for the spawned process. Forwarded to
   * `child_process.execFile` so callers can pin the invocation against a
   * resolved repo root regardless of `process.cwd()`.
   */
  cwd?: string;
}

/** Executable function signature matching child_process.execFile patterns. */
export type GitExec = (
  cmd: string,
  args: string[],
  options?: GitExecOptions,
) => Promise<ExecResult>;

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

/**
 * Configure the git notes fetch refspec for ARC user directory portability.
 *
 * Adds `+refs/notes/arc/user/*:refs/notes/arc/user/*` to `remote.origin.fetch`
 * so that `git fetch` automatically pulls ARC user notes. Idempotent — skips
 * if the refspec is already present. Skips silently if no remote origin exists
 * (fresh repos without a remote yet).
 *
 * @param exec - Injectable command executor
 * @returns true if refspec was configured (or already present), false if no remote
 */
export async function configureNotesRefspec(exec: GitExec): Promise<boolean> {
  const url = await gitConfigGet(exec, "remote.origin.url");
  if (!url) return false;

  const refspec = "+refs/notes/arc/user/*:refs/notes/arc/user/*";

  // Check if already configured
  try {
    const { stdout } = await exec("git", [
      "config",
      "--get-all",
      "remote.origin.fetch",
    ]);
    if (stdout.includes(refspec)) return true;
  } catch {
    // No fetch entries exist yet — proceed to add
  }

  await exec("git", [
    "config",
    "--add",
    "remote.origin.fetch",
    refspec,
  ]);
  return true;
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
    const stdout = (err as { stdout?: string }).stdout;
    if (typeof stdout === "string") {
      return { content: stdout, hasConflicts: true };
    }
    throw err;
  }
}
