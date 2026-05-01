/**
 * Unit tests for the dirty-state probe.
 *
 * Covers porcelain-output parsing — clean state on empty output, dirty
 * state with file count from non-empty output, and mixed staged /
 * unstaged / untracked entries collapsing to a single integer count.
 */

import { describe, it, expect } from "vitest";

import { runDirtyStateStatus } from "../../../src/lib/git/dirty-state.js";
import type { GitExec } from "../../../src/lib/git/index.js";

function execWithPorcelain(stdout: string): GitExec {
  return async (cmd, args) => {
    if (cmd !== "git" || args[0] !== "status" || args[1] !== "--porcelain") {
      throw new Error(`unexpected git invocation: ${cmd} ${args.join(" ")}`);
    }
    return { stdout, stderr: "" };
  };
}

describe("runDirtyStateStatus", () => {
  it("returns clean state when porcelain output is empty", async () => {
    const result = await runDirtyStateStatus({ exec: execWithPorcelain("") });
    expect(result).toEqual({ state: "clean", fileCount: 0 });
  });

  it("treats whitespace-only output as clean", async () => {
    const result = await runDirtyStateStatus({ exec: execWithPorcelain("\n\n") });
    expect(result).toEqual({ state: "clean", fileCount: 0 });
  });

  it("returns dirty state with file count for a single modified entry", async () => {
    const result = await runDirtyStateStatus({
      exec: execWithPorcelain(" M src/foo.ts\n"),
    });
    expect(result).toEqual({ state: "dirty", fileCount: 1 });
  });

  it("counts mixed staged, unstaged, and untracked entries", async () => {
    const porcelain = [
      "M  staged.ts",
      " M unstaged.ts",
      "?? untracked.ts",
      "A  added.ts",
    ].join("\n") + "\n";
    const result = await runDirtyStateStatus({ exec: execWithPorcelain(porcelain) });
    expect(result).toEqual({ state: "dirty", fileCount: 4 });
  });
});
