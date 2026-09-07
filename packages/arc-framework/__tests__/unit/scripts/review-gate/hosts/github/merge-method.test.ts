/** GitHub merge-policy adapter boundary behavior. */

import { describe, expect, it, vi } from "vitest";

import type { HostedProcessRunner } from "../../../../../../src/scripts/review-gate/hosted/gh-process.js";
import { createGhMergeMethodPolicyPort } from "../../../../../../src/scripts/review-gate/hosts/github/merge-method.js";

describe("GitHub merge-method policy port", () => {
  it("uses exact gh argv and maps repository policy booleans", async () => {
    const run = vi.fn(async (args: string[]) => {
      if (args[0] === "repo") return { stdout: JSON.stringify({ nameWithOwner: "owner/repo" }), stderr: "" };
      return {
        stdout: JSON.stringify({
          allow_merge_commit: false,
          allow_rebase_merge: true,
          allow_squash_merge: true,
        }),
        stderr: "",
      };
    });
    const port = createGhMergeMethodPolicyPort({ run } satisfies HostedProcessRunner);

    await expect(port.resolveRepository()).resolves.toBe("owner/repo");
    await expect(port.readPolicy("owner/repo")).resolves.toEqual({ merge: false, rebase: true, squash: true });
    expect(run.mock.calls).toEqual([
      [["repo", "view", "--json", "nameWithOwner"]],
      [["api", "repos/owner/repo"]],
    ]);
  });

  it("rejects malformed JSON, missing repository identity, and non-boolean policy fields", async () => {
    const outputs = [
      "not json",
      JSON.stringify({}),
      JSON.stringify({ allow_merge_commit: true, allow_rebase_merge: false }),
    ];
    const run = vi.fn(async () => ({ stdout: outputs.shift() ?? "", stderr: "" }));
    const port = createGhMergeMethodPolicyPort({ run } satisfies HostedProcessRunner);

    await expect(port.resolveRepository()).rejects.toThrow("repository: malformed JSON");
    await expect(port.resolveRepository()).rejects.toThrow("repository.nameWithOwner");
    await expect(port.readPolicy("owner/repo")).rejects.toThrow("repository-policy.allow_squash_merge");
  });
});
