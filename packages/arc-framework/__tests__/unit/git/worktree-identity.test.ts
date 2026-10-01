import { describe, it, expect } from "vitest";
import { assertSchemaAccepts } from "../../helpers/schema-assertion.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

import { WorktreeIdentitySchema, resolveWorktreeIdentity } from "../../../src/lib/git/worktree-identity.js";

/**
 * Script each `rev-parse` flag and retain the fake's invocation recorder.
 */
function buildExec(
  responses: Record<string, string | Error>,
): ReturnType<typeof scriptGitExec> {
  return scriptGitExec(Object.entries(responses).map(([flag, response]) => ({
    match: { predicate: (args: readonly string[]) => args[0] === "rev-parse" && args[1] === flag },
    responses: [response instanceof Error
      ? { failure: { exitCode: 128, stderr: response.message } }
      : { stdout: `${response}\n`, stderr: "" }],
  })));
}

describe("resolveWorktreeIdentity", () => {
  it("reports the primary worktree when --git-dir equals --git-common-dir", async () => {
    const { exec, calls } = buildExec({
      "--git-common-dir": ".git",
      "--git-dir": ".git",
    });

    const identity = await resolveWorktreeIdentity(exec);

    expect(identity).toEqual({ kind: "primary" });
    assertSchemaAccepts(WorktreeIdentitySchema, identity);
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
    assertSchemaAccepts(WorktreeIdentitySchema, identity);
  });

  it("performs no fetch/network call — detection is local rev-parse only", async () => {
    const { exec, calls } = buildExec({
      "--git-common-dir": "/Users/dev/repo/.git",
      "--git-dir": "/Users/dev/repo/.git/worktrees/arc-wu-b",
      "--show-toplevel": "/Users/dev/arc-wu-b",
    });

    await resolveWorktreeIdentity(exec);

    expect(calls).not.toHaveLength(0);
    expect(calls.every((c) => c.command === "git" && c.args[0] === "rev-parse")).toBe(true);
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
