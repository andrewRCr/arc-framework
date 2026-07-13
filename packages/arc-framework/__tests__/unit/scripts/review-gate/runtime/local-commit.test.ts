import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../../../src/lib/git/exec.js";
import { resolveLocalCommit } from "../../../../../src/scripts/review-gate/runtime/local-commit.js";

const HEAD_SHA = "a".repeat(40);

function resolvingExec(expectedRevision: string, stdout = `${HEAD_SHA}\n`): GitExec {
  return async (command, args) => {
    if (command !== "git" || args.join(" ") !== `rev-parse --verify --end-of-options ${expectedRevision}^{commit}`) {
      throw new Error("unexpected git invocation");
    }
    return { stdout, stderr: "" };
  };
}

describe("local commit resolution", () => {
  it.each(["HEAD", "a1b2c3d", "topic/review-fix"])("canonicalizes the local commit-ish %s", async (revision) => {
    await expect(resolveLocalCommit(resolvingExec(revision), revision)).resolves.toBe(HEAD_SHA);
  });

  it("rejects a commit-ish that git cannot resolve", async () => {
    const exec: GitExec = async () => { throw new Error("unknown revision"); };
    await expect(resolveLocalCommit(exec, "missing-ref"))
      .rejects.toThrow("reviewContext.proposedHead: expected a resolvable local commit-ish");
  });

  it("rejects a resolved object that is not a canonical 40-hex commit SHA", async () => {
    await expect(resolveLocalCommit(resolvingExec("HEAD", "not-a-sha\n"), "HEAD"))
      .rejects.toThrow("reviewContext.proposedHead: expected 40 lowercase hexadecimal characters");
  });
});
