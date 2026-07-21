/** Native argument-array process execution coverage. */

import { describe, expect, it } from "vitest";

import {
  createProcessExec,
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
});
