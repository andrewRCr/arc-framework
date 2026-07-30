/** Bounded argument-array executor for native process inspection. */

import { execa } from "execa";
import { whichCommand, type Options as WhichCommandOptions } from "which-command";

export const MAX_PROCESS_OUTPUT_BYTES = 64 * 1024;
export const PROCESS_INSPECTION_TIMEOUT_MS = 5_000;

export interface ProcessExecOptions {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
  readonly maxOutputBytes?: number;
}

export type ProcessExecResult =
  | { kind: "success"; stdout: string; stderr: string; exitCode: 0 }
  | { kind: "nonzero"; stdout: string; stderr: string; exitCode: number }
  | { kind: "canceled" | "missing" | "output-limit" | "failed"; message: string };

export type ProcessExec = (
  command: string,
  args: readonly string[],
  options?: ProcessExecOptions,
) => Promise<ProcessExecResult>;

export interface NativeProcessRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export type NativeProcessRunner = (
  command: string,
  args: readonly string[],
  options: ProcessExecOptions & { readonly maxOutputBytes: number },
) => Promise<NativeProcessRunResult>;

/**
 * Adapt an argument-array runner to the stable inspection result algebra.
 *
 * @param runner - native process boundary to invoke
 * @returns a bounded process executor with normalized outcomes
 */
export function createProcessExec(runner: NativeProcessRunner = runNativeProcess): ProcessExec {
  return async (command, args, options = {}) => {
    const maxOutputBytes = options.maxOutputBytes ?? MAX_PROCESS_OUTPUT_BYTES;
    if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0) {
      return { kind: "failed", message: "Native process output limit is invalid" };
    }
    const timeoutSignal = AbortSignal.timeout(PROCESS_INSPECTION_TIMEOUT_MS);
    const signal = options.signal === undefined
      ? timeoutSignal
      : AbortSignal.any([options.signal, timeoutSignal]);
    try {
      const result = await runner(command, args, { ...options, signal, maxOutputBytes });
      const capturedBytes = Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr);
      if (capturedBytes > maxOutputBytes) {
        return { kind: "output-limit", message: "Native process output exceeded the capture limit" };
      }
      return result.exitCode === 0
        ? { kind: "success", stdout: result.stdout, stderr: result.stderr, exitCode: 0 }
        : { kind: "nonzero", stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
    } catch (error) {
      if (hasTrue(error, "isCanceled") || hasTrue(error, "timedOut") || hasCode(error, "ABORT_ERR")) {
        return { kind: "canceled", message: "Native process invocation was canceled" };
      }
      if (hasCode(error, "ENOENT")) {
        return { kind: "missing", message: "Native process executable is unavailable" };
      }
      if (hasCode(error, "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") || hasTrue(error, "isMaxBuffer")) {
        return { kind: "output-limit", message: "Native process output exceeded the capture limit" };
      }
      return { kind: "failed", message: "Native process invocation failed" };
    }
  };
}

/** Production execa binding with no shell interpolation. */
async function runNativeProcess(
  command: string,
  args: readonly string[],
  options: ProcessExecOptions & { readonly maxOutputBytes: number },
): Promise<NativeProcessRunResult> {
  const executable = process.platform === "win32"
    ? await resolveWindowsExecutable(command, options)
    : command;
  const perStreamMaxOutputBytes = Math.floor(options.maxOutputBytes / 2);
  const result = await execa(executable, [...args], {
    reject: false,
    shell: false,
    cwd: options.cwd,
    env: options.env,
    cancelSignal: options.signal,
    maxBuffer: {
      stdout: perStreamMaxOutputBytes,
      stderr: perStreamMaxOutputBytes,
    },
    encoding: "buffer",
  });
  if (result.exitCode === undefined
    || hasTrue(result, "isCanceled")
    || hasTrue(result, "timedOut")
    || hasTrue(result, "isMaxBuffer")) {
    if (result instanceof Error) throw result;
    throw new Error("Native process failure metadata is malformed");
  }
  return {
    stdout: Buffer.from(result.stdout).toString("utf8"),
    stderr: Buffer.from(result.stderr).toString("utf8"),
    exitCode: result.exitCode,
  };
}

async function resolveWindowsExecutable(
  command: string,
  options: ProcessExecOptions,
): Promise<string> {
  const searchPath = environmentValue(options.env, "PATH");
  const pathExtensions = environmentValue(options.env, "PATHEXT");
  const resolutionOptions = {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(searchPath === undefined ? {} : { path: searchPath }),
    ...(pathExtensions === undefined ? {} : { pathExt: pathExtensions }),
  } satisfies WhichCommandOptions;
  const executable = await whichCommand(command, resolutionOptions);
  if (executable !== undefined) return executable;
  throw Object.assign(new Error(`Native process executable is unavailable: ${command}`), { code: "ENOENT" });
}

function environmentValue(
  environment: Readonly<Record<string, string>> | undefined,
  name: string,
): string | undefined {
  return Object.entries(environment ?? {}).find(([key]) => key.toUpperCase() === name)?.[1];
}

function hasCode(value: unknown, code: string): boolean {
  return typeof value === "object" && value !== null && "code" in value
    && (value as { code?: unknown }).code === code;
}

function hasTrue(value: unknown, key: string): boolean {
  return typeof value === "object" && value !== null && key in value
    && (value as Record<string, unknown>)[key] === true;
}
