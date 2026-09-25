import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../../../../src/lib/git/exec.js";
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

describe("local correction target dirt authorization", () => {
  it("checks both destination and source of a porcelain rename", async () => {
    const exec: GitExec = (_command, args) => Promise.resolve({
      stdout: args[0] === "rev-parse"
        ? headSha
        : "R  expected.ts\0unrelated.ts\0",
    });

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
  });

  it("refuses a rename status with no source path", async () => {
    const exec: GitExec = (_command, args) => Promise.resolve({
      stdout: args[0] === "rev-parse" ? headSha : "R  expected.ts\0",
    });

    await expect(confirmLocalReviewCorrectionTarget({
      exec,
      cwd: "/repo",
      attemptedTarget: target,
      expectedFixPaths: ["expected.ts"],
    })).rejects.toThrow("rename/copy status lacks its source path");
  });
});
