/**
 * E2E test helpers.
 *
 * Provides CLI invocation and temp repo setup for end-to-end tests. These
 * helpers are intentionally standalone — they import only from node builtins,
 * not from the CLI source. E2E tests exercise the built artifact (`dist/cli.js`),
 * not source modules.
 */

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import { CLI_PATH, assertCliBuilt } from "../helpers/cli-spawn.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);

/** Result of a CLI invocation. */
export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run Git in an E2E fixture repository with project hooks disabled.
 *
 * @param cwd - Fixture repository root
 * @param args - Git arguments after the executable name
 * @returns Trimmed standard output
 */
export async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["-c", "core.hooksPath=/dev/null", ...args],
    { cwd },
  );
  return stdout.trim();
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
  assertCliBuilt();
  const timeout = options?.timeout ?? 30_000;
  const env = { ...process.env, NO_COLOR: "1", ...options?.env };
  try {
    const { stdout, stderr } = process.platform === "linux"
      ? await execFileAsync(
        "script",
        ["-qec", buildScriptCommand(args), "/dev/null"],
        { cwd, timeout, env },
      )
      : await execFileAsync(
        process.execPath,
        [CLI_PATH, ...args],
        { cwd, timeout, env },
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
 * Like {@link runArc}, but always invokes the CLI directly via `node` — never
 * through `script` — so stdin and stdout are real pipes, not a pseudo-TTY. Use
 * for regression tests that must exercise the genuine non-TTY path, where
 * `runArc`'s Linux `script` wrapper would otherwise allocate a TTY and mask it.
 *
 * @param args - CLI arguments
 * @param cwd - Working directory for the CLI process
 * @param options - Optional timeout and env overrides
 * @returns Captured stdout, stderr, and exit code
 */
export async function runArcNoTty(
  args: string[],
  cwd: string,
  options?: { timeout?: number; env?: Record<string, string> },
): Promise<RunResult> {
  assertCliBuilt();
  const timeout = options?.timeout ?? 30_000;
  const env = { ...process.env, NO_COLOR: "1", ...options?.env };
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI_PATH, ...args], { cwd, timeout, env });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number | string };
    const exitCode = typeof e.code === "number" ? e.code : 1;
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", exitCode };
  }
}

/**
 * Invoke the built CLI with caller-provided stdin and real pipes.
 *
 * @param args - CLI arguments.
 * @param cwd - Working directory for the CLI process.
 * @param stdin - UTF-8 content supplied to standard input.
 * @param options - Optional timeout and environment overrides.
 * @returns Captured stdout, stderr, and exit code.
 */
export function runArcWithStdin(
  args: string[],
  cwd: string,
  stdin: string,
  options?: { timeout?: number; env?: Record<string, string> },
): Promise<RunResult> {
  assertCliBuilt();
  const timeout = options?.timeout ?? 30_000;
  const env = { ...process.env, NO_COLOR: "1", ...options?.env };

  return new Promise<RunResult>((resolveResult, rejectResult) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], { cwd, env, stdio: "pipe" });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    // The command may exit before buffered input drains; consume only the expected EPIPE.
    child.stdin.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code !== "EPIPE") rejectResult(err);
    });
    child.stdin.end(stdin);

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectResult(new Error(`CLI invocation timed out after ${timeout}ms`));
    }, timeout);
    child.on("error", (err) => {
      clearTimeout(timer);
      rejectResult(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveResult({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        exitCode: code ?? 1,
      });
    });
  });
}

function buildScriptCommand(args: string[]): string {
  const nodeCommand = [process.execPath, CLI_PATH, ...args].map(shellEscape).join(" ");
  return `stty cols 120 rows 40; exec ${nodeCommand}`;
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

/**
 * Create a temporary git repo for E2E testing.
 *
 * Layers e2e personality — the `arc-e2e-` prefix and a pre-set `arc.identity`
 * (so `arc init --yes` skips the interactive identity prompt) — over the shared
 * factory core.
 *
 * @param prefix - Temp directory name prefix (default: `"arc-e2e-"`)
 * @returns Absolute path to the temp repo
 */
export function createTempRepo(prefix = "arc-e2e-"): Promise<string> {
  return createTempRepoCore({ prefix, identity: "test-user" });
}

/**
 * Remove a temporary directory via the shared retry-safe removal primitive.
 *
 * @param dir - Absolute path to the directory to remove
 */
export function cleanupTempDir(dir: string): Promise<void> {
  return removeGitBackedDir(dir);
}

// Re-export so e2e tests route inline git-backed teardowns through the same
// retry-safe primitive without reaching past the tier helper.
export { removeGitBackedDir };
