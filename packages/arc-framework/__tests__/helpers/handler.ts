/** Handler-seam execution with process output, exit-code, and working-directory capture. */

import { vi } from "vitest";

/** Observable result emitted by one in-process CLI handler. */
export interface HandlerRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run one CLI handler at an isolated repository locus and capture its process-facing result.
 *
 * @param cwd - Repository directory the handler should resolve as its ambient locus.
 * @param handler - Handler invocation using CLI-parsed inputs.
 * @returns Captured standard output, standard error, and normalized exit code.
 */
export async function runHandlerAt(
  cwd: string,
  handler: () => Promise<void>,
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
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }
}
