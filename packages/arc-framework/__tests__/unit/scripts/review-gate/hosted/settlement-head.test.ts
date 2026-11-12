import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../../../src/lib/git/exec.js";
import { createHostedSettlementHeadRegistration } from "../../../../../src/scripts/review-gate/hosted/settlement-head.js";
import { makeGitProcessError } from "../../../../helpers/git-exec-fake.js";

describe("local settlement ancestry failures", () => {
  it.each(["rev-parse", "merge-base"])("preserves an operational failure from %s", async boundary => {
    const failure = makeGitProcessError({ command: "git", args: [boundary], exitCode: 128,
      stderr: "fatal: unable to read repository object database" });
    const exec: GitExec = async (command, args) => {
      if (command !== "git") throw new Error("expected Git execution");
      if (args[0] === boundary) throw failure;
      return { stdout: "a".repeat(40) };
    };
    const registration = createHostedSettlementHeadRegistration(exec, "/repository");
    await expect(registration.isAncestor("a".repeat(40), "b".repeat(40), new AbortController().signal))
      .rejects.toBe(failure);
  });
});
