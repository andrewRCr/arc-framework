import { describe, expect, it } from "vitest";

import { scriptGitExec, type GitExecCall } from "../../../../../helpers/git-exec-fake.js";
import { createReviewTarget } from "../../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { confirmLocalReviewCorrectionTarget } from
  "../../../../../../src/scripts/review-gate/hosts/local/repository-target.js";

const headSha = "c".repeat(40);
const target = createReviewTarget({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "change-set",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: "a".repeat(40),
  diffBaseTree: "b".repeat(40),
  headSha,
  headTree: "d".repeat(40),
});

function gitWithStatus(stdout: string) {
  return scriptGitExec([
    { match: ["rev-parse", "--verify", "HEAD"], responses: [{ stdout: headSha }] },
    { match: ["status", "--porcelain=v1", "-z", "--untracked-files=all"], responses: [{ stdout }] },
  ]);
}

function expectExactReads(calls: GitExecCall[]): void {
  expect(calls.map(({ command, args, options }) => [command, args, options])).toEqual([
    ["git", ["rev-parse", "--verify", "HEAD"], { cwd: "/repo" }],
    ["git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: "/repo" }],
  ]);
}

describe("local correction target dirt authorization", () => {
  it("preserves the leading status column for an authorized unstaged edit", async () => {
    const { exec, calls } = gitWithStatus(" M src/index.ts\0");

    await expect(confirmLocalReviewCorrectionTarget({
      exec,
      cwd: "/repo",
      attemptedTarget: target,
      expectedFixPaths: ["src/index.ts"],
    })).resolves.toEqual({ state: "current", target, dirtyPaths: ["src/index.ts"] });
    expectExactReads(calls);
  });

  it("refuses an unrelated unstaged edit even when its suffix is authorized", async () => {
    const { exec, calls } = gitWithStatus(" M src/index.ts\0");

    await expect(confirmLocalReviewCorrectionTarget({
      exec,
      cwd: "/repo",
      attemptedTarget: target,
      expectedFixPaths: ["rc/index.ts"],
    })).resolves.toEqual({
      state: "unexpected-dirty-paths", target, unexpectedPaths: ["src/index.ts"],
    });
    expectExactReads(calls);
  });

  it("checks both destination and source of a porcelain rename", async () => {
    const { exec, calls } = gitWithStatus("R  expected.ts\0unrelated.ts\0");

    await expect(confirmLocalReviewCorrectionTarget({
      exec,
      cwd: "/repo",
      attemptedTarget: target,
      expectedFixPaths: ["expected.ts"],
    })).resolves.toEqual({
      state: "unexpected-dirty-paths",
      target,
      unexpectedPaths: ["unrelated.ts"],
    });
    expectExactReads(calls);
  });

  it("refuses a rename status with no source path", async () => {
    const { exec, calls } = gitWithStatus("R  expected.ts\0");

    await expect(confirmLocalReviewCorrectionTarget({
      exec,
      cwd: "/repo",
      attemptedTarget: target,
      expectedFixPaths: ["expected.ts"],
    })).rejects.toThrow("rename/copy status lacks its source path");
    expectExactReads(calls);
  });
});
