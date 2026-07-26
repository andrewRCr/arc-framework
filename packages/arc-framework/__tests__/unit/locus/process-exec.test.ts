/** Native argument-array process execution coverage. */

import { describe, expect, it, vi } from "vitest";

import {
  createProcessExec,
  MAX_PROCESS_OUTPUT_BYTES,
  PROCESS_INSPECTION_TIMEOUT_MS,
  type NativeProcessRunner,
} from "../../../src/lib/locus/process-exec.js";

describe("locus process execution", () => {
  it("preserves success and structured nonzero results", async () => {
    const success = createProcessExec(async () => ({ stdout: "ok", stderr: "", exitCode: 0 }));
    await expect(success("ps", ["-p", "42"])).resolves.toEqual({
      kind: "success", stdout: "ok", stderr: "", exitCode: 0,
    });
    const nonzero = createProcessExec(async () => ({ stdout: "", stderr: "denied", exitCode: 2 }));
    await expect(nonzero("ps", ["-p", "42"])).resolves.toEqual({
      kind: "nonzero", stdout: "", stderr: "denied", exitCode: 2,
    });
  });

  it.each([
    [{ code: "ENOENT" }, "missing"],
    [{ isCanceled: true }, "canceled"],
    [{ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" }, "output-limit"],
  ] as const)("classifies boundary rejection as %s", async (failure, kind) => {
    const runner: NativeProcessRunner = async () => { throw failure; };
    await expect(createProcessExec(runner)("native", [])).resolves.toMatchObject({ kind });
  });

  it("bounds native calls by elapsed time and captured bytes", async () => {
    const runner = vi.fn<NativeProcessRunner>(async () => ({ stdout: "", stderr: "", exitCode: 0 }));

    await expect(createProcessExec(runner)("ps", ["-p", "42"])).resolves.toMatchObject({ kind: "success" });

    const options = vi.mocked(runner).mock.calls[0]?.[2];
    expect(options?.maxOutputBytes).toBe(MAX_PROCESS_OUTPUT_BYTES);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.signal?.aborted).toBe(false);
    expect(PROCESS_INSPECTION_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
