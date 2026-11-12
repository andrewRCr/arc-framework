/** Unavailable comparisons refuse safely and remain retryable. */
import { expect, it } from "vitest";
import { readCheckDivergence } from "../../../../src/lib/checks/divergence.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";

it.each(["failed", "malformed"])("refuses a %s comparison and succeeds after repair", async failure => {
  const git = scriptGitExec([{ match: { prefix: ["diff"] }, responses: [
    failure === "failed" ? { failure: { exitCode: 1, stderr: "unavailable" } } : { stdout: "incomplete diff" },
    { stdout: "" },
  ] }]).exec;
  await expect(readCheckDivergence(git, "/repository", "a".repeat(40), "b".repeat(40), ["src/**"]))
    .rejects.toThrow("Could not compare checked content with the worktree; retry the check request.");
  await expect(readCheckDivergence(git, "/repository", "a".repeat(40), "b".repeat(40), ["src/**"]))
    .resolves.toEqual([]);
});
