/** Bounded argument-array executor for native process inspection. */

import { execa } from "execa";

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
    const signal = options.signal ?? AbortSignal.timeout(PROCESS_INSPECTION_TIMEOUT_MS);
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
  const result = await execa(command, [...args], {
    reject: false,
    shell: false,
    cwd: options.cwd,
    env: options.env,
    cancelSignal: options.signal,
    maxBuffer: options.maxOutputBytes,
    encoding: "utf8",
  });
  if (result.exitCode === undefined
    || hasTrue(result, "isCanceled")
    || hasTrue(result, "timedOut")
    || hasTrue(result, "isMaxBuffer")) {
    if (result instanceof Error) throw result;
    throw new Error("Native process failure metadata is malformed");
  }
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}

function hasCode(value: unknown, code: string): boolean {
  return typeof value === "object" && value !== null && "code" in value
    && (value as { code?: unknown }).code === code;
}

function hasTrue(value: unknown, key: string): boolean {
  return typeof value === "object" && value !== null && key in value
    && (value as Record<string, unknown>)[key] === true;
}
