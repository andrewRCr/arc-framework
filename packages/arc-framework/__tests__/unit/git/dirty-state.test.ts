/**
 * Unit tests for the dirty-state probe.
 *
 * Covers porcelain-output parsing — clean state on empty output, dirty
 * state with file count from non-empty output, and mixed staged /
 * unstaged / untracked entries collapsing to a single integer count.
 */

import { describe, it, expect } from "vitest";
import { assertSchemaAccepts } from "../../helpers/schema-assertion.js";

import { DirtyStateResultSchema, runDirtyStateStatus } from "../../../src/lib/git/dirty-state.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import type { GitExec } from "../../../src/lib/git/index.js";

function execWithPorcelain(stdout: string): GitExec {
  return scriptGitExec([{ match: ["status", "--porcelain"], responses: [{ stdout }] }]).exec;
}

describe("runDirtyStateStatus", () => {
  it.each([
    ["", "clean"],
    [" M src/foo.ts\n", "dirty"],
  ] as const)("parses producer output in the %s case", async (porcelain, state) => {
    const result = await runDirtyStateStatus({ exec: execWithPorcelain(porcelain) });
    expect(result.state).toBe(state);
    assertSchemaAccepts(DirtyStateResultSchema, result);
  });

  it("names an undeclared dirty-state field", async () => {
    const result = await runDirtyStateStatus({ exec: execWithPorcelain(" M src/foo.ts\n") });
    expect(() => DirtyStateResultSchema.parse({ ...result, unexpected: true })).toThrow(/unexpected/);
  });

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
