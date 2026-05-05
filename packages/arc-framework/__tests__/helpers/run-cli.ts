/**
 * Subprocess CLI invocation helper for end-to-end purity tests.
 *
 * Spawns `node dist/cli.js <args>` via `child_process.spawn` with `stdio: "pipe"`,
 * collects stdout and stderr buffers separately, and returns
 * `{ stdout, stderr, exitCode }`. Pipe stdio (not a PTY) is the point —
 * subprocess tests assert the CLI's stdout contract under the same non-TTY
 * conditions a downstream consumer (CI, shell pipeline, harness) would see.
 *
 * Forward-compat: `args`, `cwd`, and `env` are parameterizable so future
 * subprocess tests beyond `arc sync` can reuse the helper without modification.
 *
 * @module
 */

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to the built CLI entry point. */
const CLI_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../dist/cli.js",
);

/** Default subprocess timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Optional overrides for a `runCli` invocation. */
export interface RunCliOptions {
  /** Working directory for the spawned subprocess. Defaults to the parent's cwd. */
  cwd?: string;
  /**
   * Environment variables for the subprocess. Merged on top of `process.env`,
   * so callers only need to supply the keys they want to override.
   */
  env?: NodeJS.ProcessEnv;
  /** Timeout in milliseconds. Default: {@link DEFAULT_TIMEOUT_MS}. */
  timeout?: number;
}

/** Result of a `runCli` invocation. */
export interface RunCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Spawn the built CLI as a subprocess and capture its stdout, stderr, and
 * exit code.
 *
 * Rejects (does not resolve) if the subprocess fails to spawn or exceeds the
 * configured timeout — the latter sends `SIGKILL` to terminate the child.
 *
 * @param args - CLI arguments (e.g., `["sync", "--json"]`).
 * @param options - Optional overrides for cwd, env, and timeout.
 * @returns Captured stdout, stderr, and exit code.
 */
export function runCli(
  args: string[],
  options: RunCliOptions = {},
): Promise<RunCliResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const env = { ...process.env, ...(options.env ?? {}) };

  return new Promise<RunCliResult>((resolveResult, rejectResult) => {
    const child = spawn("node", [CLI_PATH, ...args], {
      cwd: options.cwd,
      env,
      stdio: "pipe",
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectResult(new Error(`runCli timed out after ${timeout}ms`));
    }, timeout);

    child.on("error", (err) => {
      clearTimeout(timer);
      rejectResult(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolveResult({
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        exitCode: code ?? 1,
      });
    });
  });
}
