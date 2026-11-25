/** Unit tests for the repository-shared user-notes lock path policy. */

import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { getNotesLockPath } from "../../src/lib/user-sync/notes-lock.js";

describe("getNotesLockPath", () => {
  it("resolves the notes lockfile under the git common dir", async () => {
    const exec = vi.fn(async () => ({ stdout: "/repo/.git\n", stderr: "" }));

    const path = await getNotesLockPath(exec, "/repo/worktree-a", "andrew");

    expect(exec).toHaveBeenCalledWith("git", ["rev-parse", "--git-common-dir"], { cwd: "/repo/worktree-a" });
    expect(path).toBe(join("/repo", ".git", "arc", "user", "andrew", ".internal", ".notes.lock"));
  });

  it("normalizes a relative git common dir against the worktree cwd", async () => {
    const exec = vi.fn(async () => ({ stdout: ".git\n", stderr: "" }));

    await expect(getNotesLockPath(exec, "/repo", "andrew")).resolves.toBe(
      join(resolve("/repo", ".git"), "arc", "user", "andrew", ".internal", ".notes.lock"),
    );
  });
});
