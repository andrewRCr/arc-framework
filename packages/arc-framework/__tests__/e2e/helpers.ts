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
  timedOut?: true;
}

/** Result from several built-CLI invocations sharing one interactive process anchor. */
export interface AnchoredSequenceResult extends RunResult {
  results: unknown[];
}

type AnchoredSequenceLocation =
  | { cwd: string }
  | { cwdFromPreviousJson: string }
  | { reuseResolvedCwd: true };

type AnchoredSequenceEntry =
  | readonly string[]
  | ({ args: readonly string[] } & AnchoredSequenceLocation)
  | ({ command: readonly string[] } & AnchoredSequenceLocation);

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
  // JSON contracts need a clean stdout channel. On Linux, `script` allocates a
  // pseudo-TTY whose transcript merges stderr into the captured stdout, so a
  // self-hosting stale-build warn would prefix `--json` payloads and break
  // `JSON.parse`. Route JSON invocations through the non-TTY helper; keep the
  // TTY path for interactive clack/TUI coverage.
  if (args.includes("--json")) {
    return runArcNoTty(args, cwd, options);
  }
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
      killed?: boolean;
    };
    // Non-zero exit: code is the exit code number.
    // System errors (ENOENT, ETIMEDOUT): code is a string — map to 1.
    const exitCode = typeof e.code === "number" ? e.code : 1;
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode,
      ...(e.code === "ETIMEDOUT" || e.killed === true ? { timedOut: true as const } : {}),
    };
  }
}

/** Invoke ARC beneath one real interactive-shell anchor for locus-aware commands. */
export async function runArcAnchored(
  args: string[],
  cwd: string,
  options?: { timeout?: number; env?: Record<string, string> },
): Promise<RunResult> {
  assertCliBuilt();
  const timeout = options?.timeout ?? 30_000;
  const env = { ...process.env, NO_COLOR: "1", PS1: "", ...options?.env };
  const command = [process.execPath, CLI_PATH, ...args].map(shellEscape).join(" ");
  const interactiveCommand = `${command}; command_status=$?; exit $command_status`;
  try {
    const { stdout, stderr } = await execFileAsync(
      "script",
      ["-qec", `bash --noprofile --norc -ic ${shellEscape(interactiveCommand)}`, "/dev/null"],
      { cwd, timeout, env },
    );
    return { stdout: normalizeAnchoredOutput(stdout), stderr, exitCode: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number | string };
    return {
      stdout: normalizeAnchoredOutput(failure.stdout ?? ""),
      stderr: failure.stderr ?? "",
      exitCode: typeof failure.code === "number" ? failure.code : 1,
    };
  }
}

/** Invoke several ARC commands beneath one persistent interactive-shell anchor. */
export async function runArcAnchoredSequence(
  argsList: readonly AnchoredSequenceEntry[],
  cwd: string,
  options?: { timeout?: number; env?: Record<string, string>; anchorShellPath?: string },
): Promise<AnchoredSequenceResult> {
  assertCliBuilt();
  const timeout = options?.timeout ?? 30_000;
  const env = { ...process.env, NO_COLOR: "1", PS1: "", ...options?.env };
  const anchorShell = options?.anchorShellPath ?? "bash";
  const commands = argsList.map((entry) => {
    const commandArgs = "command" in entry
      ? entry.command
      : [process.execPath, CLI_PATH, ...("args" in entry ? entry.args : entry)];
    const command = commandArgs.map(shellEscape).join(" ");
    let prefix = "";
    let located = command;
    if ("cwd" in entry) {
      located = `cd ${shellEscape(entry.cwd)} && ${command}`;
    } else if ("cwdFromPreviousJson" in entry) {
      const readField = [
        process.execPath,
        "-e",
        "const fs=require('node:fs');const value=JSON.parse(fs.readFileSync(0,'utf8'));"
          + "process.stdout.write(String(value[process.argv[1]]));",
        entry.cwdFromPreviousJson,
      ].map(shellEscape).join(" ");
      prefix = `arc_sequence_cwd=$(printf '%s' "$arc_sequence_result" | ${readField}); `;
      located = `cd "$arc_sequence_cwd" && ${command}`;
    } else if ("reuseResolvedCwd" in entry) {
      located = `cd "$arc_sequence_cwd" && ${command}`;
    }
    return `${prefix}arc_sequence_result=$(${located}); arc_sequence_status=$?; `
      + `printf '%s\n' "$arc_sequence_result"; (exit $arc_sequence_status)`;
  });
  const command = `${commands.join("; ")}; command_status=$?; exit $command_status`;
  try {
    const { stdout, stderr } = await execFileAsync(
      "script",
      ["-qec", `${shellEscape(anchorShell)} --noprofile --norc -ic ${shellEscape(command)}`, "/dev/null"],
      { cwd, timeout, env },
    );
    const normalized = normalizeAnchoredOutput(stdout);
    return { stdout: normalized, stderr, exitCode: 0, results: parseJsonLines(normalized) };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number | string };
    const normalized = normalizeAnchoredOutput(failure.stdout ?? "");
    return {
      stdout: normalized,
      stderr: failure.stderr ?? "",
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      results: parseJsonLines(normalized),
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
    const e = err as { stdout?: string; stderr?: string; code?: number | string; killed?: boolean };
    const exitCode = typeof e.code === "number" ? e.code : 1;
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode,
      ...(e.code === "ETIMEDOUT" || e.killed === true ? { timedOut: true as const } : {}),
    };
  }
}

/**
 * Invoke the built CLI with a TTY stdin and piped stdout.
 *
 * @param args - CLI arguments.
 * @param cwd - Working directory for the CLI process.
 * @param options - Optional timeout and environment overrides.
 * @returns Captured stdout, stderr, and exit code.
 */
export async function runArcWithStdoutPipe(
  args: string[],
  cwd: string,
  options?: { timeout?: number; env?: Record<string, string> },
): Promise<RunResult> {
  assertCliBuilt();
  const timeout = options?.timeout ?? 30_000;
  const env = { ...process.env, NO_COLOR: "1", ...options?.env };
  try {
    const pipeline = `${buildScriptCommand(args, false)} | cat`;
    const { stdout, stderr } = await execFileAsync(
      "script",
      ["-qec", `bash -o pipefail -c ${shellEscape(pipeline)}`, "/dev/null"],
      { cwd, timeout, env },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number | string; killed?: boolean };
    const exitCode = typeof e.code === "number" ? e.code : 1;
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode,
      ...(e.code === "ETIMEDOUT" || e.killed === true ? { timedOut: true as const } : {}),
    };
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

function buildScriptCommand(args: string[], useExec = true): string {
  const nodeCommand = [process.execPath, CLI_PATH, ...args].map(shellEscape).join(" ");
  return `stty cols 120 rows 40; ${useExec ? "exec " : ""}${nodeCommand}`;
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function normalizeAnchoredOutput(value: string): string {
  return value.replaceAll("\r", "").split("\n").filter((line) => line !== "exit").join("\n");
}

function parseJsonLines(value: string): unknown[] {
  return value.split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
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
