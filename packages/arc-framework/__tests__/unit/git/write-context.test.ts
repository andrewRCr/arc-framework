import { describe, it, expect } from "vitest";

import { classifyWriteContext, resolveWriteContext } from "../../../src/lib/git/write-context.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/index.js";

/** Keyed mock exec — matches a prefix of the invocation's args (`*` wildcards). */
function buildExec(responses: Record<string, ExecResult>): GitExec {
  return async (cmd, args) => {
    for (const key of Object.keys(responses)) {
      const tokens = key.split(" ");
      if (tokens.every((t, i) => t === "*" || args[i] === t)) {
        return responses[key] as ExecResult;
      }
    }
    throw new Error(`unmatched git invocation: ${cmd} ${args.join(" ")}`);
  };
}

describe("classifyWriteContext", () => {
  it("proceeds on the configured base branch", () => {
    const result = classifyWriteContext({
      currentBranch: "main",
      baseBranch: "main",
      primaryWorktreePath: "/repo",
    });
    expect(result.verdict).toBe("proceed");
  });

  it("relocates when on a work-unit branch (not the base)", () => {
    const result = classifyWriteContext({
      currentBranch: "feat/some-wu",
      baseBranch: "main",
      primaryWorktreePath: "/repo",
    });
    expect(result.verdict).toBe("relocate");
  });

  it("safely refuses on a detached HEAD rather than writing silently", () => {
    const result = classifyWriteContext({
      currentBranch: null,
      baseBranch: "main",
      primaryWorktreePath: "/repo",
    });
    expect(result).toMatchObject({ verdict: "refuse", reason: "detached-head" });
  });

  it("safely refuses when no base branch resolves", () => {
    const result = classifyWriteContext({
      currentBranch: "main",
      baseBranch: null,
      primaryWorktreePath: "/repo",
    });
    expect(result).toMatchObject({ verdict: "refuse", reason: "no-base" });
  });
});

describe("resolveWriteContext", () => {
  it("resolves current branch and primary worktree path from git, then classifies", async () => {
    const exec = buildExec({
      "rev-parse --abbrev-ref HEAD": { stdout: "feat/some-wu\n" },
      "worktree list --porcelain": { stdout: "worktree /repo/primary\nHEAD abc\nbranch refs/heads/main\n" },
    });

    const result = await resolveWriteContext({ exec, baseBranch: "main" });

    expect(result).toMatchObject({
      verdict: "relocate",
      currentBranch: "feat/some-wu",
      primaryWorktreePath: "/repo/primary",
    });
  });
});
