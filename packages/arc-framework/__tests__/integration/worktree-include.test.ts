/** Copying `.worktreeinclude` matches out of a real primary checkout. */

import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  makeGitExec,
  type GitExec,
} from "../helpers/integration.js";
import {
  copyWorktreeIncludes,
  nodeCopyFileIfAbsent,
  type WorktreeIncludeContext,
} from "../../src/lib/git/worktree-include.js";

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}

async function writeAt(root: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

function includeContext(exec: GitExec): WorktreeIncludeContext {
  return { exec, fs: { pathExists: exists, copyFileIfAbsent: nodeCopyFileIfAbsent } };
}

describe("copyWorktreeIncludes", () => {
  let primary: string;
  let target: string;

  beforeEach(async () => {
    primary = await createTempRepo();
    target = await mkdtemp(join(tmpdir(), "arc-worktree-include-"));
  });

  afterEach(async () => {
    await cleanupTempDir(primary);
    await rm(target, { recursive: true, force: true });
  });

  it("copies only untracked, ignored matches and keeps files already in the worktree", async () => {
    await writeAt(primary, ".gitignore", ".env\nsecrets/\n.arc/user/\nlocal.json\ntracked.json\n");
    await writeAt(primary, "tracked.json", "tracked\n");
    await execFileAsync("git", ["add", ".gitignore"], { cwd: primary });
    await execFileAsync("git", ["add", "--force", "tracked.json"], { cwd: primary });
    await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "ignore rules"], { cwd: primary });
    await writeAt(
      primary,
      ".worktreeinclude",
      ".env\nsecrets/\n.arc/user/\nconfig/local.json\nnotes.txt\ntracked.json\n",
    );
    await writeAt(primary, ".env", "PRIMARY=1\n");
    await writeAt(primary, "secrets/deep/key", "key\n");
    await writeAt(primary, ".arc/user/notes.md", "notes\n");
    await writeAt(primary, "config/local.json", "{\"from\":\"primary\"}\n");
    await writeAt(primary, "notes.txt", "untracked but not ignored\n");
    await writeAt(target, "config/local.json", "{\"from\":\"worktree\"}\n");

    await copyWorktreeIncludes(includeContext(makeGitExec(primary)), primary, target);

    expect(await readFile(join(target, ".env"), "utf8")).toBe("PRIMARY=1\n");
    expect(await readFile(join(target, "secrets", "deep", "key"), "utf8")).toBe("key\n");
    expect(await readFile(join(target, "config", "local.json"), "utf8")).toBe("{\"from\":\"worktree\"}\n");
    expect(await exists(join(target, ".arc"))).toBe(false);
    expect(await exists(join(target, "notes.txt"))).toBe(false);
    expect(await exists(join(target, "tracked.json"))).toBe(false);
  });

  it("copies nothing and runs no Git command when the primary has no include file", async () => {
    await writeAt(primary, ".gitignore", ".env\n");
    await writeAt(primary, ".env", "PRIMARY=1\n");
    const calls: string[][] = [];
    const exec: GitExec = async (_command, args) => {
      calls.push(args);
      return { stdout: "" };
    };

    await copyWorktreeIncludes(includeContext(exec), primary, target);

    expect(calls).toEqual([]);
    expect(await readdir(target)).toEqual([]);
  });
});
