import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  makeCommit,
  makeGitExec,
} from "../helpers/integration.js";
import {
  reconcileWorkUnitWorktree,
  resolveRenameWorktreeMove,
  type ReconcileWorkUnitWorktreeContext,
} from "../../src/lib/work-unit/mutators/reconcile-work-unit-worktree.js";

describe("reconcileWorkUnitWorktree move with real Git", () => {
  let repo: string;
  let oldPath: string;
  let newPath: string;

  beforeEach(async () => {
    repo = await createTempRepo("arc-worktree-move-");
    await makeCommit(repo, "initial");
    oldPath = `${repo}.old-name`;
    newPath = `${repo}.new-name`;
    await execFileAsync("git", ["worktree", "add", "-b", "feat/new-name", oldPath], { cwd: repo });
  });

  afterEach(async () => {
    try {
      await execFileAsync("git", ["worktree", "remove", "--force", newPath], { cwd: repo });
    } catch {
      try {
        await execFileAsync("git", ["worktree", "remove", "--force", oldPath], { cwd: repo });
      } catch {
        // The assertion path may have removed the repository first.
      }
    }
    await cleanupTempDir(repo);
  });

  it("moves the registered worktree to its derived sibling path", async () => {
    const exec = makeGitExec(repo);
    const plan = await resolveRenameWorktreeMove(exec, {
      branch: "feat/new-name",
      oldSlug: "old-name",
      newSlug: "new-name",
      currentLocus: repo,
    });
    expect(plan).toEqual({ status: "move", from: oldPath, to: newPath });
    if (plan.status !== "move") throw new Error("expected a worktree move plan");

    const ctx: ReconcileWorkUnitWorktreeContext = {
      exec,
      chdir: () => {
        throw new Error("a non-self move must not change the test process locus");
      },
    fs: {
      pathExists: async () => false,
      directoryExists: async () => false,
        copyDirectory: async () => {},
        copyFileIfAbsent: async () => {},
        readFile: async () => "",
        writeFile: async () => {},
        mkdir: async () => {},
        readDir: async () => [],
      },
    };

    await expect(reconcileWorkUnitWorktree(ctx, {
      mutation: "move",
      ...plan,
      currentLocus: repo,
    })).resolves.toEqual({
      mutation: "move",
      from: oldPath,
      to: newPath,
      locusHopped: false,
    });

    const { stdout } = await execFileAsync("git", ["worktree", "list", "--porcelain"], { cwd: repo });
    expect(stdout).toContain(`worktree ${newPath}`);
    expect(stdout).not.toContain(`worktree ${oldPath}\n`);
  });

  it("preserves an old-slug occurrence in the repository prefix", async () => {
    await execFileAsync("git", ["worktree", "remove", "--force", oldPath], { cwd: repo });
    oldPath = `${repo}.old-name-tools.old-name`;
    newPath = `${repo}.old-name-tools.new-name`;
    await execFileAsync("git", ["worktree", "add", oldPath, "feat/new-name"], { cwd: repo });
    const exec = makeGitExec(repo);
    const move = await resolveRenameWorktreeMove(exec, {
      branch: "feat/new-name",
      oldSlug: "old-name",
      newSlug: "new-name",
      currentLocus: repo,
    });
    expect(move).toEqual({ status: "move", from: oldPath, to: newPath });
    if (move.status !== "move") throw new Error("expected move resolution");

    const ctx: ReconcileWorkUnitWorktreeContext = {
      exec,
      chdir: () => {
        throw new Error("a non-self move must not change the test process locus");
      },
    fs: {
      pathExists: async () => false,
      directoryExists: async () => false,
        copyDirectory: async () => {},
        copyFileIfAbsent: async () => {},
        readFile: async () => "",
        writeFile: async () => {},
        mkdir: async () => {},
        readDir: async () => [],
      },
    };
    await reconcileWorkUnitWorktree(ctx, {
      mutation: "move",
      from: move.from,
      to: move.to,
      currentLocus: repo,
    });

    const { stdout } = await execFileAsync("git", ["worktree", "list", "--porcelain"], { cwd: repo });
    expect(stdout).toContain(`worktree ${newPath}`);
    expect(stdout).not.toContain(`worktree ${oldPath}\n`);
  });
});
