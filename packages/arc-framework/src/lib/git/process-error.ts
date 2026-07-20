/**
 * Stable Git process failures and compatibility normalization.
 *
 * @module
 */

import { ArcError, type ArcErrorCode } from "../kernel/errors.js";

/** Maximum number of characters retained in each diagnostic projection. */
export const GIT_DIAGNOSTIC_MAX_CHARS = 4_096;

const GIT_ERROR_MESSAGE_MAX_CHARS = 1_024;
const INVOCATION_MAX_CHARS = 256;

/** Executor-owned Git process failure categories. */
export type GitProcessErrorKind =
  | "canceled"
  | "timed-out"
  | "output-limit"
  | "nonzero-exit"
  | "spawn-failure"
  | "unexpected";

/** Expected Git outcomes that callers may handle without parsing diagnostics. */
export type GitExpectedOutcome = "absent-remote-ref" | "stale-lease";

/** Immutable input for constructing a {@link GitProcessError}. */
export interface GitProcessErrorInit {
  readonly kind: GitProcessErrorKind;
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode?: number;
  readonly signal?: string;
  readonly isCanceled?: boolean;
  readonly timedOut?: boolean;
  readonly isMaxBuffer?: boolean;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly expectedOutcome?: GitExpectedOutcome;
  readonly cause?: unknown;
}

const CODE_BY_KIND = {
  canceled: "git.canceled",
  "timed-out": "git.timed-out",
  "output-limit": "git.output-limit",
  "nonzero-exit": "git.nonzero-exit",
  "spawn-failure": "git.spawn-failure",
  unexpected: "git.unexpected",
} as const satisfies Record<GitProcessErrorKind, ArcErrorCode>;

/** Stable process failure emitted by Git executor bindings. */
export class GitProcessError extends ArcError {
  readonly kind: GitProcessErrorKind;
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode?: number;
  readonly signal?: string;
  readonly isCanceled: boolean;
  readonly timedOut: boolean;
  readonly isMaxBuffer: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly diagnosticStdout: string;
  readonly diagnosticStderr: string;
  readonly expectedOutcome?: GitExpectedOutcome;

  /**
   * Create a stable Git process failure.
   *
   * @param init - Complete process metadata and captured streams.
   */
  constructor(init: GitProcessErrorInit) {
    if (init.expectedOutcome !== undefined && init.kind !== "nonzero-exit") {
      throw new TypeError("expectedOutcome is valid only for nonzero-exit Git process errors");
    }

    const stdout = init.stdout ?? "";
    const stderr = init.stderr ?? "";
    const diagnosticStdout = truncate(stdout, GIT_DIAGNOSTIC_MAX_CHARS);
    const diagnosticStderr = truncate(stderr, GIT_DIAGNOSTIC_MAX_CHARS);
    const message = buildMessage(init, diagnosticStderr, diagnosticStdout);
    super(message, CODE_BY_KIND[init.kind], init.cause === undefined ? undefined : { cause: init.cause });

    this.name = "GitProcessError";
    this.kind = init.kind;
    this.command = init.command;
    this.args = Object.freeze([...init.args]);
    this.exitCode = init.exitCode;
    this.signal = init.signal;
    this.isCanceled = init.isCanceled ?? false;
    this.timedOut = init.timedOut ?? false;
    this.isMaxBuffer = init.isMaxBuffer ?? false;
    this.stdout = stdout;
    this.stderr = stderr;
    this.diagnosticStdout = diagnosticStdout;
    this.diagnosticStderr = diagnosticStderr;
    this.expectedOutcome = init.expectedOutcome;
  }
}

/**
 * Narrow an unknown value to the executor-owned Git failure contract.
 *
 * @param value - Unknown rejection value.
 * @returns Whether the value is a {@link GitProcessError}.
 */
export function isGitProcessError(value: unknown): value is GitProcessError {
  return value instanceof GitProcessError;
}

/** Invocation supplied when normalizing an executor rejection. */
export interface GitInvocation {
  readonly command: string;
  readonly args: readonly string[];
}

/**
 * Normalize execa, legacy injected, and unknown rejection shapes.
 *
 * @param value - Rejected value from an executor implementation.
 * @param invocation - Command and arguments associated with the rejection.
 * @returns A stable executor-owned failure.
 */
export function normalizeGitRejection(value: unknown, invocation: GitInvocation): GitProcessError {
  if (isGitProcessError(value)) return value;

  const record = asRecord(value);
  const timedOut = record?.timedOut === true;
  const isMaxBuffer = record?.isMaxBuffer === true;
  const isCanceled = record?.isCanceled === true;
  const exitCode = numericExitCode(record);
  const signal = stringField(record, "signal");
  const stdout = stringField(record, "stdout") ?? "";
  const stderr = stringField(record, "stderr") ?? "";

  let kind: GitProcessErrorKind;
  if (timedOut) kind = "timed-out";
  else if (isMaxBuffer) kind = "output-limit";
  else if (isCanceled) kind = "canceled";
  else if (exitCode !== undefined || signal !== undefined) kind = "nonzero-exit";
  else if (isSpawnFailure(record)) kind = "spawn-failure";
  else kind = "unexpected";

  const expectedOutcome = kind === "nonzero-exit"
    ? classifyExpectedOutcome(invocation, exitCode, stderr)
    : undefined;

  return new GitProcessError({
    kind,
    command: invocation.command,
    args: invocation.args,
    exitCode,
    signal,
    isCanceled,
    timedOut,
    isMaxBuffer,
    stdout,
    stderr,
    expectedOutcome,
    cause: value,
  });
}

/**
 * Read complete compatibility evidence from typed or legacy failures.
 *
 * @param value - Typed or legacy rejection value.
 * @returns Complete stderr first, then a legacy message, or an empty string.
 */
export function gitFailureText(value: unknown): string {
  if (isGitProcessError(value) && value.stderr !== "") return value.stderr;
  const record = asRecord(value);
  return stringField(record, "stderr") ?? stringField(record, "message") ?? "";
}

function classifyExpectedOutcome(
  invocation: GitInvocation,
  exitCode: number | undefined,
  stderr: string,
): GitExpectedOutcome | undefined {
  if (!isGitExecutable(invocation.command)) return undefined;
  const [subcommand] = invocation.args;
  if (subcommand === "fetch" && exitCode === 128 && /(?:could(?:n't| not)|cannot) find remote ref/iu.test(stderr)) {
    return "absent-remote-ref";
  }
  if (subcommand !== "push" || exitCode === undefined || exitCode === 0) return undefined;

  const pushArgs = invocation.args.slice(1);
  const deletion = pushArgs.includes("--delete") || pushArgs.some((arg) => /^:[^:]/u.test(arg));
  if (deletion && /remote ref does not exist/iu.test(stderr)) return "absent-remote-ref";

  const leased = pushArgs.some((arg) => arg === "--force-with-lease" || arg.startsWith("--force-with-lease="));
  if (!leased) return undefined;
  return /stale info|would clobber|fetch first|\[rejected\]/iu.test(stderr) ? "stale-lease" : undefined;
}

function buildMessage(init: GitProcessErrorInit, stderr: string, stdout: string): string {
  const invocation = truncate([init.command, init.args[0]].filter(Boolean).join(" "), INVOCATION_MAX_CHARS);
  const status = init.exitCode !== undefined
    ? `exit ${init.exitCode}`
    : init.signal !== undefined ? `signal ${singleLine(init.signal)}` : undefined;
  const identity = `${invocation || "git"}: ${init.kind}${status === undefined ? "" : ` (${status})`}`;
  const evidence = singleLine(stderr || stdout);
  if (evidence === "") return truncate(identity, GIT_ERROR_MESSAGE_MAX_CHARS);
  const separator = ": ";
  const available = Math.max(0, GIT_ERROR_MESSAGE_MAX_CHARS - identity.length - separator.length);
  return `${identity}${separator}${truncate(evidence, available)}`;
}

function singleLine(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function truncate(value: string, maximum: number): string {
  if (value.length <= maximum) return value;
  if (maximum <= 1) return value.slice(0, maximum);
  return `${value.slice(0, maximum - 1)}…`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return (typeof value === "object" && value !== null) || typeof value === "function"
    ? value as Record<string, unknown>
    : undefined;
}

function stringField(record: Record<string, unknown> | undefined, field: string): string | undefined {
  const value = record?.[field];
  return typeof value === "string" ? value : undefined;
}

function numericExitCode(record: Record<string, unknown> | undefined): number | undefined {
  const exitCode = record?.exitCode;
  if (typeof exitCode === "number") return exitCode;
  const legacyCode = record?.code;
  return typeof legacyCode === "number" ? legacyCode : undefined;
}

function isSpawnFailure(record: Record<string, unknown> | undefined): boolean {
  if (record === undefined) return false;
  if (record.failed === true) return true;
  return typeof record.code === "string" || typeof record.errno === "string";
}

function isGitExecutable(command: string): boolean {
  const executable = command.split(/[\\/]/u).at(-1)?.toLowerCase();
  return executable === "git" || executable === "git.exe";
}
