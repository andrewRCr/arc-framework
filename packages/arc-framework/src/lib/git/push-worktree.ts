/**
 * Worktree branch push helper — wrapper over `git push origin <branch>`.
 *
 * Internal seam shared by `handlers/sync.ts:executeSingleLeg` and
 * `commands/user/paired-push.ts:runPairedPush`. Centralizes the worktree-leg
 * push call site so push wrappers can swap the implementation without
 * re-extracting from raw `git push` call sites.
 *
 * Two execution modes:
 *
 * - **Capture mode** (default): runs `git push` through the injected
 *   `GitExec`, fully capturing stdout/stderr. Used by `arc sync` and
 *   `arc user push`.
 * - **Inherit-stdio mode** (`inheritStdio: true`): switches to an execa
 *   adapter with inherited stdin/stdout and captured-and-teed stderr —
 *   stdout streams to the user's terminal, stderr is captured (and teed
 *   back to `process.stderr`) so callers can parse `refStatus` while the
 *   user sees verbatim push output. Used by the upcoming `arc release
 *   push` wrapper.
 *
 * Pushability gating is the caller's responsibility — this helper does not
 * run the pushability matrix. Callers route through `runPushabilityStatus`
 * (with their target) before invocation when needed; advisory dispositions
 * (`force-push-required`) require the caller to refuse explicitly.
 *
 * Not re-exported from `lib/git/index.ts` — kept at internal scope until a
 * downstream consumer commits to the public surface.
 *
 * @module
 */

import { execa } from "execa";

import type { GitExec } from "./exec.js";
import { MAX_GIT_OUTPUT_BYTES } from "./process-executor.js";
import { type GitProcessError, normalizeGitRejection } from "./process-error.js";

export interface PushWorktreeSpawnArgs {
  branch: string;
  args: readonly string[];
  /**
   * Working directory for the spawned `git push`. When undefined the spawn
   * inherits the parent process's cwd; when provided the spawn runs against
   * that directory so callers can pin the wrapper to a resolved repo root
   * regardless of `process.cwd()` drift.
   */
  cwd?: string;
}

export interface PushWorktreeSpawnResult {
  exitCode: number;
  stderr: string;
  /** Normalized evidence for a non-zero Git exit. Omitted by legacy injected fakes. */
  error?: GitProcessError;
}

/**
 * Wrapped invocation used under `inheritStdio: true`. Production callers omit
 * it; tests inject a mock to avoid running a real push.
 */
export type PushWorktreeSpawn = (
  args: PushWorktreeSpawnArgs,
) => Promise<PushWorktreeSpawnResult>;

export interface PushWorktreeBranchOptions {
  exec: GitExec;
  branch: string;
  /** Args appended after `origin <branch>`. Default: `[]`. */
  args?: readonly string[];
  /**
   * Working directory for the wrapped `git push`. Forwarded to the
   * underlying `exec` (capture mode) or `spawn` (inherit-stdio mode). When
   * undefined the underlying call inherits the parent process's cwd.
   */
  cwd?: string;
  /**
   * When `true`, switch from `exec`-based capture to an execa adapter: stdout streams to the
   * user's terminal, stderr is captured and teed to `process.stderr` so
   * callers can parse `refStatus` without suppressing the verbatim push
   * output the user expects. Defaults to `false` (capture mode).
   */
  inheritStdio?: boolean;
  /** Test-injectable override for the `inheritStdio: true` spawn impl. */
  spawnPush?: PushWorktreeSpawn;
}

/**
 * Discriminated outcome of a worktree branch push attempt. `stdout` and
 * `stderr` carry whatever was captured: under capture mode, both come from
 * the executor; under `inheritStdio: true`, stdout is empty (inherited)
 * and stderr holds the captured stream.
 */
export type PushWorktreeBranchResult =
  | { status: "success"; stdout: string; stderr: string }
  | { status: "failed"; error: Error; stdout: string; stderr: string };

/**
 * Push the named worktree branch to `origin`. Returns `{ status: "success",
 * stdout, stderr }` on a successful push, `{ status: "failed", error,
 * stdout, stderr }` when git rejects or the executor throws. Errors are
 * normalized to `Error` so callers don't need a separate type-narrowing
 * branch.
 */
export async function pushWorktreeBranch(
  options: PushWorktreeBranchOptions,
): Promise<PushWorktreeBranchResult> {
  const { exec, branch, args = [], cwd, inheritStdio = false } = options;

  if (inheritStdio) {
    const spawnPush = options.spawnPush ?? defaultSpawnPush;
    const result = await spawnPush({ branch, args, cwd });
    if (result.exitCode === 0) {
      return { status: "success", stdout: "", stderr: result.stderr };
    }
    return {
      status: "failed",
      error: result.error ?? new Error(`git push exited with code ${result.exitCode}`),
      stdout: "",
      stderr: result.stderr,
    };
  }

  try {
    const { stdout, stderr } = cwd === undefined
      ? await exec("git", ["push", "origin", branch, ...args])
      : await exec("git", ["push", "origin", branch, ...args], { cwd });
    return { status: "success", stdout, stderr: stderr ?? "" };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const errStdout = (err as { stdout?: unknown }).stdout;
    const errStderr = (err as { stderr?: unknown }).stderr;
    return {
      status: "failed",
      error,
      stdout: typeof errStdout === "string" ? errStdout : "",
      stderr: typeof errStderr === "string" ? errStderr : "",
    };
  }
}

const defaultSpawnPush: PushWorktreeSpawn = async ({ branch, args, cwd }) => {
  const invocation = ["push", "origin", branch, ...args];
  const result = await execa("git", invocation, {
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: ["inherit", "pipe"],
    reject: false,
    stripFinalNewline: false,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
  const stderr = result.stderr;
  if (!result.failed) return { exitCode: 0, stderr };

  const error = normalizeGitRejection(result, { command: "git", args: invocation });
  if (error.kind !== "nonzero-exit" || error.exitCode === undefined) throw error;
  return { exitCode: error.exitCode, stderr, error };
};
