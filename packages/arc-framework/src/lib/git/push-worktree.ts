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
 * - **Inherit-stdio mode** (`inheritStdio: true`): switches to
 *   `child_process.spawn` with `stdio: ['inherit', 'inherit', 'pipe']` —
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

import { spawn } from "node:child_process";

import type { GitExec } from "./exec.js";

export interface PushWorktreeSpawnArgs {
  branch: string;
  args: readonly string[];
}

export interface PushWorktreeSpawnResult {
  exitCode: number;
  stderr: string;
}

/**
 * Spawn-based wrapped invocation used under `inheritStdio: true`. Production
 * callers omit it (the default real impl uses `node:child_process.spawn`);
 * tests inject a mock to avoid spawning real `git`.
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
   * When `true`, switch from `exec`-based capture to `child_process.spawn`
   * with `stdio: ['inherit', 'inherit', 'pipe']`: stdout streams to the
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
  const { exec, branch, args = [], inheritStdio = false } = options;

  if (inheritStdio) {
    const spawnPush = options.spawnPush ?? defaultSpawnPush;
    const result = await spawnPush({ branch, args });
    if (result.exitCode === 0) {
      return { status: "success", stdout: "", stderr: result.stderr };
    }
    return {
      status: "failed",
      error: new Error(`git push exited with code ${result.exitCode}`),
      stdout: "",
      stderr: result.stderr,
    };
  }

  try {
    const { stdout, stderr } = await exec("git", ["push", "origin", branch, ...args]);
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

const defaultSpawnPush: PushWorktreeSpawn = ({ branch, args }) =>
  new Promise((resolve, reject) => {
    const proc = spawn("git", ["push", "origin", branch, ...args], {
      stdio: ["inherit", "inherit", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stderr });
    });
  });
