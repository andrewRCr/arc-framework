import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ExecResult, GitExec } from "../../src/lib/git/exec.js";
import {
  createUserSurfaceResolver,
  resolveUserSurfaceResolver,
} from "../../src/lib/user-surfaces.js";

function execReturningWorktrees(primary: string, linked: string): GitExec {
  return vi.fn(async (_cmd, args): Promise<ExecResult> => {
    expect(args).toEqual(["worktree", "list", "--porcelain"]);
    return {
      stderr: "",
      stdout: [
        `worktree ${primary}`,
        "HEAD 1111111111111111111111111111111111111111",
        "branch refs/heads/main",
        "",
        `worktree ${linked}`,
        "HEAD 2222222222222222222222222222222222222222",
        "branch refs/heads/feat/demo",
        "",
      ].join("\n"),
    };
  });
}

describe("createUserSurfaceResolver", () => {
  it("keeps identity-global files under the canonical root", () => {
    const resolver = createUserSurfaceResolver({
      cwd: "/repo-linked",
      identity: "andrew",
      identityGlobalRoot: join("/repo", ".arc", "user", "andrew"),
    });

    expect(resolver.identityGlobalPath("USER-INBOX.md"))
      .toBe(join("/repo", ".arc", "user", "andrew", "USER-INBOX.md"));
    expect(resolver.identityGlobalPath("WORKING-MEMORY.md"))
      .toBe(join("/repo", ".arc", "user", "andrew", "WORKING-MEMORY.md"));
    expect(resolver.identityGlobalPath("STATUS.USER.md"))
      .toBe(join("/repo", ".arc", "user", "andrew", "STATUS.USER.md"));
    expect(resolver.identityGlobalPath(".internal", "errand-reminder-last-nudge.txt"))
      .toBe(join("/repo", ".arc", "user", "andrew", ".internal", "errand-reminder-last-nudge.txt"));
  });

  it("keeps SESSION-NOTES scoped to the active worktree", () => {
    const resolver = createUserSurfaceResolver({
      cwd: "/repo-linked",
      identity: "andrew",
      identityGlobalRoot: join("/repo", ".arc", "user", "andrew"),
    });

    expect(resolver.sessionNotesPath("feature-demo"))
      .toBe(join("/repo-linked", ".arc", "user", "andrew", "feature-demo", "SESSION-NOTES.md"));
  });

  it("renders repo-relative display paths only when the path is under the active checkout", () => {
    const primaryResolver = createUserSurfaceResolver({
      cwd: "/repo",
      identity: "andrew",
      identityGlobalRoot: join("/repo", ".arc", "user", "andrew"),
    });
    const linkedResolver = createUserSurfaceResolver({
      cwd: "/repo-linked",
      identity: "andrew",
      identityGlobalRoot: join("/repo", ".arc", "user", "andrew"),
    });

    expect(primaryResolver.identityGlobalDisplayPath("WORKING-MEMORY.md"))
      .toBe(".arc/user/andrew/WORKING-MEMORY.md");
    expect(linkedResolver.identityGlobalDisplayPath("WORKING-MEMORY.md"))
      .toBe(join("/repo", ".arc", "user", "andrew", "WORKING-MEMORY.md"));
  });
});

describe("resolveUserSurfaceResolver", () => {
  it("uses the primary worktree as the identity-global root from a linked worktree", async () => {
    const resolver = await resolveUserSurfaceResolver({
      cwd: "/repo-linked",
      identity: "andrew",
      exec: execReturningWorktrees("/repo", "/repo-linked"),
    });

    expect(resolver.identityGlobalRoot).toBe(join("/repo", ".arc", "user", "andrew"));
    expect(resolver.sessionNotesPath("feature-demo"))
      .toBe(join("/repo-linked", ".arc", "user", "andrew", "feature-demo", "SESSION-NOTES.md"));
  });

  it("falls back to the active checkout when git topology is unavailable", async () => {
    const resolver = await resolveUserSurfaceResolver({
      cwd: "/repo",
      identity: "andrew",
      exec: vi.fn(async () => {
        throw new Error("not a git repo");
      }),
    });

    expect(resolver.identityGlobalRoot).toBe(join("/repo", ".arc", "user", "andrew"));
  });
});
