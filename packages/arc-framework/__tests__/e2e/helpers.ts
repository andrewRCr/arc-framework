/**
 * E2E test helpers.
 *
 * Provides CLI invocation and temp repo setup for end-to-end tests. These
 * helpers are intentionally standalone — they import only from node builtins,
 * not from the CLI source. E2E tests exercise the built artifact (`dist/cli.js`),
 * not source modules.
 */

import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Absolute path to the built CLI entry point. */
const CLI_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../dist/cli.js",
);

/** Result of a CLI invocation. */
export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Invoke the built CLI as a subprocess.
 *
 * Spawns `node dist/cli.js ...args` in the given working directory. Captures
 * stdout, stderr, and exit code. Sets `NO_COLOR=1` to strip ANSI escapes
 * from clack output.
 *
 * @param args - CLI arguments (e.g., `["init", "--yes", "--name", "test"]`)
 * @param cwd - Working directory for the CLI process
 * @param options - Optional timeout and env overrides
 * @returns Captured stdout, stderr, and exit code
 */
export async function runArc(
  args: string[],
  cwd: string,
  options?: { timeout?: number; env?: Record<string, string> },
): Promise<RunResult> {
  const timeout = options?.timeout ?? 30_000;
  try {
    const { stdout, stderr } = await execFileAsync(
      "node",
      [CLI_PATH, ...args],
      {
        cwd,
        timeout,
        env: { ...process.env, NO_COLOR: "1", ...options?.env },
      },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
    };
    // Non-zero exit: code is the exit code number.
    // System errors (ENOENT, ETIMEDOUT): code is a string — map to 1.
    const exitCode = typeof e.code === "number" ? e.code : 1;
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode,
    };
  }
}

/**
 * Create a temporary git repo for E2E testing.
 *
 * Initialises a temp directory with `git init`, configures a test user,
 * and pre-sets `arc.identity` to avoid interactive prompts when running
 * `arc init --yes`.
 *
 * @param prefix - Temp directory name prefix (default: `"arc-e2e-"`)
 * @returns Absolute path to the temp repo
 */
export async function createTempRepo(
  prefix = "arc-e2e-",
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  await execFileAsync("git", ["init", dir]);
  await execFileAsync("git", ["config", "user.email", "test@test.com"], {
    cwd: dir,
  });
  await execFileAsync("git", ["config", "user.name", "Test User"], {
    cwd: dir,
  });
  // Pre-set identity so `arc init --yes` skips the interactive identity prompt
  await execFileAsync("git", ["config", "arc.identity", "test-user"], {
    cwd: dir,
  });
  return dir;
}

/**
 * Remove a temporary directory.
 *
 * @param dir - Absolute path to the directory to remove
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
