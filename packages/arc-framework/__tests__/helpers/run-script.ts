/**
 * Subprocess helper for exercising repo-root shell scripts under test.
 *
 * Spawns `bash <script> <args>` via `child_process.spawn` with `stdio: "pipe"`,
 * collects stdout and stderr separately, and returns `{ stdout, stderr,
 * exitCode }` — the same shape as {@link runCli}, but for the `scripts/*.sh`
 * surface (e.g. `classify-change.sh`) rather than the built CLI. Spawning
 * through `bash` explicitly (rather than relying on the shebang + executable
 * bit) keeps invocation deterministic across environments.
 *
 * `args`, `cwd`, and `env` are parameterizable so tree-hash cases can run the
 * script with `cwd` pointed at a temp git repo.
 *
 * @module
 */

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to the repo-root `scripts/` directory. */
export const SCRIPTS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../scripts",
);

/** Absolute path to the canonical code-surface classifier script. */
export const CLASSIFY_SCRIPT = resolve(SCRIPTS_DIR, "classify-change.sh");

/** Default subprocess timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Optional overrides for a {@link runScript} invocation. */
export interface RunScriptOptions {
  /** Working directory for the spawned subprocess. Defaults to the parent's cwd. */
  cwd?: string;
  /**
   * Environment variables for the subprocess. Merged on top of `process.env`,
   * so callers only need to supply the keys they want to override.
   */
  env?: NodeJS.ProcessEnv;
  /** Timeout in milliseconds. Default: {@link DEFAULT_TIMEOUT_MS}. */
  timeout?: number;
  /** Optional bytes supplied to the script's standard input. */
  stdin?: string | Buffer;
}

/** Result of a {@link runScript} invocation. */
export interface RunScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Spawn a shell script as a subprocess and capture its stdout, stderr, and
 * exit code.
 *
 * Rejects (does not resolve) if the subprocess fails to spawn or exceeds the
 * configured timeout — the latter sends `SIGKILL` to terminate the child.
 *
 * @param scriptPath - Absolute path to the script (e.g. {@link CLASSIFY_SCRIPT}).
 * @param args - Arguments passed to the script (e.g. `["classify", "README.md"]`).
 * @param options - Optional overrides for cwd, env, and timeout.
 * @returns Captured stdout, stderr, and exit code.
 */
export function runScript(
  scriptPath: string,
  args: string[] = [],
  options: RunScriptOptions = {},
): Promise<RunScriptResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const env = { ...process.env, ...(options.env ?? {}) };

  return new Promise<RunScriptResult>((resolveResult, rejectResult) => {
    const child = spawn("bash", [scriptPath, ...args], {
      cwd: options.cwd,
      env,
      stdio: "pipe",
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdin?.end(options.stdin);

    child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectResult(new Error(`runScript timed out after ${timeout}ms`));
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
