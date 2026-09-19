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
import { recordCliInvocationForCurrentTest } from "../helpers/test-cost-timeout.js";

const execFileAsync = promisify(execFile);

/** Compose the deterministic environment shared by built-CLI tests. */
function builtCliEnvironment(overrides?: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ARC_DISABLE_UPDATE_CHECKS: "1",
    NO_COLOR: "1",
    ...overrides,
  };
}

interface PseudoTerminalOptions {
  cwd: string;
  timeout: number;
  env: NodeJS.ProcessEnv;
}

/** Run one argv-safe command under the host's native `script` utility. */
async function runInPseudoTerminal(
  command: readonly string[],
  options: PseudoTerminalOptions,
): Promise<{ stdout: string; stderr: string }> {
  if (process.platform === "darwin") return runBsdPseudoTerminal(command, options);
  const args = ["-qec", command.map(shellEscape).join(" "), "/dev/null"];
  return execFileAsync("script", args, { ...options, encoding: "utf8" });
}

/** BSD `script` requires non-socket stdin, which `execFile` cannot provide. */
function runBsdPseudoTerminal(
  command: readonly string[],
  options: PseudoTerminalOptions,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn("script", ["-q", "/dev/null", ...command], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    let settled = false;
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeout);
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectResult(error);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code === 0) {
        resolveResult(result);
        return;
      }
      rejectResult(Object.assign(new Error(`script exited with ${code ?? signal ?? "unknown status"}`), {
        code: timedOut ? "ETIMEDOUT" : (code ?? 1),
        killed: timedOut,
        signal,
        ...result,
      }));
    });
  });
}

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
  | { command: readonly string[] }
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

/** Delivery command paths that print human output unless `--json` opts in. */
const DELIVERY_HUMAN_DEFAULT = [
  "delivery compose",
  "delivery plan abandon",
  "delivery plan from-branch",
  "delivery plan from-tasks",
  "delivery plan inventory schema",
  "delivery transfer export",
  "delivery transfer import",
];

/**
 * Read the command path out of an invocation's leading bare words.
 *
 * Operands and options both end the path, so an operand value that happens to spell a
 * subcommand cannot be mistaken for one.
 *
 * @param args - CLI arguments for the invocation.
 * @returns The space-joined command path.
 */
function commandPath(args: readonly string[]): string {
  const path: string[] = [];
  for (const arg of args) {
    if (!/^[a-z][a-z0-9-]*$/u.test(arg)) break;
    path.push(arg);
  }
  return path.join(" ");
}

/**
 * Report whether an invocation writes a machine-readable payload to stdout.
 *
 * Some commands emit JSON unconditionally and so declare no `--json`; their argv carries
 * nothing else that marks the payload, so the command itself is the signal.
 *
 * @param args - CLI arguments for the invocation.
 * @returns True when stdout carries a machine-readable payload.
 */
function emitsMachineReadablePayload(args: readonly string[]): boolean {
  const path = commandPath(args);
  if (args[0] === "delivery") {
    return !DELIVERY_HUMAN_DEFAULT.some((human) => path === human || path.startsWith(`${human} `));
  }
  if (args[0] === "integrate") return args[1] === "checkpoint" || args[1] === "merge";
  if (args[0] === "base") return args[1] === "merge";
  if (args[0] !== "review") return false;
  return args[1] === "pre-publication"
    || args[1] === "status"
    || (args[1] === "merge-method" && args[2] === "resolve")
    || (args[1] === "checks" && args[2] === "await")
    || (args[1] === "change-request" && args[2] === "resolve");
}

/**
 * Invoke the built CLI as a subprocess.
 *
 * Spawns `node dist/cli.js ...args` in the given working directory. Captures
 * stdout, stderr, and exit code. Disables optional update checks and sets
 * `NO_COLOR=1` so the test contract is offline and free of ANSI escapes.
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
  // pseudo-TTY whose transcript merges stderr into the captured stdout, so an
  // advisory or warn would prefix a JSON payload and break `JSON.parse`. Route
  // machine-readable invocations through the non-TTY helper; keep the TTY path
  // for interactive clack/TUI coverage.
  if (args.includes("--json") || emitsMachineReadablePayload(args)) {
    return runArcNoTty(args, cwd, options);
  }
  const timeout = options?.timeout ?? 30_000;
  recordCliInvocationForCurrentTest(timeout);
  const env = builtCliEnvironment(options?.env);
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
  recordCliInvocationForCurrentTest(timeout);
  const env = builtCliEnvironment({ PS1: "", ...options?.env });
  const command = [process.execPath, CLI_PATH, ...args].map(shellEscape).join(" ");
  const interactiveCommand = `${command}; command_status=$?; exit $command_status`;
  try {
    const { stdout, stderr } = await runInPseudoTerminal(
      ["bash", "--noprofile", "--norc", "-ic", `stty cols 500 rows 40; ${interactiveCommand}`],
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
  for (const entry of argsList) {
    if (!("command" in entry)) recordCliInvocationForCurrentTest(timeout);
  }
  const env = builtCliEnvironment({ PS1: "", ...options?.env });
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
          + "const field=process.argv[1].split('.').reduce((current,key)=>current?.[key],value);"
          + "if(typeof field!=='string')throw new Error(`Expected string JSON field ${process.argv[1]}`);"
          + "process.stdout.write(field);",
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
  const command = `${commands.join(" && ")}; command_status=$?; exit $command_status`;
  try {
    const { stdout, stderr } = await runInPseudoTerminal(
      [anchorShell, "--noprofile", "--norc", "-ic", `stty cols 500 rows 40; ${command}`],
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
  recordCliInvocationForCurrentTest(timeout);
  const env = builtCliEnvironment(options?.env);
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
  recordCliInvocationForCurrentTest(timeout);
  const env = builtCliEnvironment(options?.env);
  try {
    const pipeline = `${buildScriptCommand(args, false)} | cat`;
    const { stdout, stderr } = await runInPseudoTerminal(
      ["bash", "-o", "pipefail", "-c", `stty cols 500 rows 40; ${pipeline}`],
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
  recordCliInvocationForCurrentTest(timeout);
  const env = builtCliEnvironment(options?.env);

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
  const lines = value
    .replaceAll("\r", "")
    .replaceAll("^D\b\b", "")
    .replaceAll("\u0004\b\b", "")
    .split("\n");
  const lastContent = lines.at(-1) === "" ? lines.length - 2 : lines.length - 1;
  if (lines[lastContent] === "exit") lines.splice(lastContent, 1);
  return lines.join("\n");
}

/** Join clack box continuations so assertions inspect logical values independent of terminal width. */
export function unwrapPresentationOutput(value: string): string {
  return value.replace(/\s*│\n│\s*/gu, "");
}

function parseJsonLines(value: string): unknown[] {
  const parsed: unknown[] = [];
  for (const line of value.split("\n")) {
    if (!line.startsWith("{")) continue;
    try {
      parsed.push(JSON.parse(line));
    } catch {
      // Transcript noise that resembles JSON must not discard earlier command results.
    }
  }
  return parsed;
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
