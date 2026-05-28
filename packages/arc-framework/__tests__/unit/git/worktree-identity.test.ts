import { describe, it, expect } from "vitest";

import { resolveWorktreeIdentity } from "../../../src/lib/git/worktree-identity.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/index.js";

/**
 * Build a GitExec mock keyed on the `rev-parse` flag (`args[1]`). A `string`
 * response is returned as stdout; an `Error` is thrown to model a failing
 * invocation. Records calls so tests can assert the invocation set never
 * includes a network operation.
 */
function buildExec(
  responses: Record<string, string | Error>,
): { exec: GitExec; calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const exec: GitExec = async (cmd, args) => {
    calls.push({ cmd, args });
    const flag = args[1] ?? "";
    const response = responses[flag];
    if (response === undefined) {
      throw new Error(`unmatched git invocation: ${cmd} ${args.join(" ")}`);
    }
    if (response instanceof Error) throw response;
    return { stdout: `${response}\n`, stderr: "" } satisfies ExecResult;
  };
  return { exec, calls };
}

describe("resolveWorktreeIdentity", () => {
  it("reports the primary worktree when --git-dir equals --git-common-dir", async () => {
    const { exec, calls } = buildExec({
      "--git-common-dir": ".git",
      "--git-dir": ".git",
    });

    const identity = await resolveWorktreeIdentity(exec);

    expect(identity).toEqual({ kind: "primary" });
    // No path lookup needed once primary is established.
    expect(calls.some((c) => c.args.includes("--show-toplevel"))).toBe(false);
  });

  it("reports a linked worktree with its working-tree path when the git dirs differ", async () => {
    const { exec } = buildExec({
      "--git-common-dir": "/Users/dev/repo/.git",
      "--git-dir": "/Users/dev/repo/.git/worktrees/arc-wu-b",
      "--show-toplevel": "/Users/dev/arc-wu-b",
    });

    const identity = await resolveWorktreeIdentity(exec);

    expect(identity).toEqual({ kind: "linked", path: "/Users/dev/arc-wu-b" });
  });

  it("performs no fetch/network call — detection is local rev-parse only", async () => {
    const { exec, calls } = buildExec({
      "--git-common-dir": "/Users/dev/repo/.git",
      "--git-dir": "/Users/dev/repo/.git/worktrees/arc-wu-b",
      "--show-toplevel": "/Users/dev/arc-wu-b",
    });

    await resolveWorktreeIdentity(exec);

    expect(calls).not.toHaveLength(0);
    expect(calls.every((c) => c.cmd === "git" && c.args[0] === "rev-parse")).toBe(true);
  });

  it("falls back to primary (no surface) when rev-parse fails", async () => {
    const { exec } = buildExec({
      "--git-common-dir": new Error("not a git repository"),
      "--git-dir": new Error("not a git repository"),
    });

    const identity = await resolveWorktreeIdentity(exec);

    expect(identity).toEqual({ kind: "primary" });
  });
});
