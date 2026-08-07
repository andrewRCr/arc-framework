import { describe, expect, it, vi } from "vitest";

import {
  historyAllowsProof,
  readHistoryCompleteness,
} from "../../../src/lib/git/history-completeness.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/exec.js";

describe("readHistoryCompleteness", () => {
  it("classifies strict false output as complete history", async () => {
    const exec: GitExec = vi.fn(async (): Promise<ExecResult> => ({ stdout: "false", stderr: "" }));

    await expect(readHistoryCompleteness({ exec })).resolves.toEqual({ kind: "complete" });
  });

  it("classifies strict true output as shallow history", async () => {
    const exec: GitExec = vi.fn(async (): Promise<ExecResult> => ({ stdout: "true", stderr: "" }));

    await expect(readHistoryCompleteness({ exec })).resolves.toEqual({ kind: "shallow" });
  });

  it.each(["", "TRUE", "false\n", "unknown"])("rejects malformed output %j", async (stdout) => {
    const exec: GitExec = vi.fn(async (): Promise<ExecResult> => ({ stdout, stderr: "" }));

    await expect(readHistoryCompleteness({ exec })).resolves.toEqual({
      kind: "unavailable",
      reason: "malformed",
    });
  });

  it("keeps execution failure as a local unavailable prerequisite", async () => {
    const exec: GitExec = vi.fn(async () => {
      throw new Error("not a remote-evidence outcome");
    });

    await expect(readHistoryCompleteness({ exec })).resolves.toEqual({
      kind: "unavailable",
      reason: "execution",
    });
  });
});

describe("historyAllowsProof", () => {
  it("preserves facts that do not require graph traversal", () => {
    expect(historyAllowsProof({ kind: "shallow" }, "non-traversal")).toBe(true);
  });

  it("allows graph proof only from complete local history", () => {
    expect(historyAllowsProof({ kind: "complete" }, "graph")).toBe(true);
    expect(historyAllowsProof({ kind: "shallow" }, "graph")).toBe(false);
    expect(historyAllowsProof({ kind: "unavailable", reason: "execution" }, "graph")).toBe(false);
  });
});
