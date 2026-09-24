/** Handler-seam execution with process output, exit-code, and working-directory capture. */

import { vi } from "vitest";

/** Observable result emitted by one in-process CLI handler. */
export interface HandlerRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Process inputs scoped to one in-process handler invocation. */
export interface HandlerRunOptions {
  env?: Readonly<Record<string, string>>;
}

/**
 * Run one CLI handler at an isolated repository locus and capture its process-facing result.
 *
 * @param cwd - Repository directory the handler should resolve as its ambient locus.
 * @param handler - Handler invocation using CLI-parsed inputs.
 * @param options - Optional process environment visible only during this invocation.
 * @returns Captured standard output, standard error, and normalized exit code.
 */
export async function runHandlerAt(
  cwd: string,
  handler: () => Promise<void>,
  options: HandlerRunOptions = {},
): Promise<HandlerRunResult> {
  const originalCwd = process.cwd();
  const originalExitCode = process.exitCode;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    stdout.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    stderr.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  });
  const originalEnvironment = new Map(
    Object.keys(options.env ?? {}).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, options.env);
  process.exitCode = undefined;
  try {
    process.chdir(cwd);
    await handler();
    const exitCode = process.exitCode === undefined || process.exitCode === null
      ? 0
      : Number(process.exitCode);
    if (!Number.isInteger(exitCode)) {
      throw new Error(`Handler assigned an invalid process exit code: ${String(process.exitCode)}`);
    }
    return { stdout: stdout.join(""), stderr: stderr.join(""), exitCode };
  } finally {
    process.chdir(originalCwd);
    process.exitCode = originalExitCode;
    for (const [key, value] of originalEnvironment) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }
}
