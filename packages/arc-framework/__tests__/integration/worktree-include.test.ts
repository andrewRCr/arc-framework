/** Copying `.worktreeinclude` matches from a real primary checkout into linked worktrees. */

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

const PRIMARY_IGNORES = ".env\nsecrets/\n.arc/user/\nlocal.json\ntracked.json\n";

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}

async function writeAt(root: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd })).stdout;
}

function includeContext(exec: GitExec): WorktreeIncludeContext {
  return { exec, fs: { pathExists: exists, copyFileIfAbsent: nodeCopyFileIfAbsent } };
}

describe("copyWorktreeIncludes", () => {
  let primary: string;
  let worktreeParent: string;

  beforeEach(async () => {
    primary = await createTempRepo();
    worktreeParent = await mkdtemp(join(tmpdir(), "arc-worktree-include-"));
    await writeAt(primary, ".gitignore", PRIMARY_IGNORES);
    await writeAt(primary, "tracked.json", "tracked\n");
    await git(primary, "add", ".gitignore");
    await git(primary, "add", "--force", "tracked.json");
    await git(primary, "commit", "-m", "ignore rules");
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
  });

  afterEach(async () => {
    await cleanupTempDir(primary);
    await rm(worktreeParent, { recursive: true, force: true });
  });

  it("copies only matches the new worktree ignores and keeps files already there", async () => {
    const target = join(worktreeParent, "same-rules");
    await git(primary, "worktree", "add", "-b", "same-rules", target, "main");
    await writeAt(target, "config/local.json", "{\"from\":\"worktree\"}\n");

    await copyWorktreeIncludes(includeContext(makeGitExec(primary)), primary, target);

    expect(await readFile(join(target, ".env"), "utf8")).toBe("PRIMARY=1\n");
    expect(await readFile(join(target, "secrets", "deep", "key"), "utf8")).toBe("key\n");
    expect(await readFile(join(target, "config", "local.json"), "utf8")).toBe("{\"from\":\"worktree\"}\n");
    expect(await exists(join(target, ".arc"))).toBe(false);
    expect(await exists(join(target, "notes.txt"))).toBe(false);
    expect(await readFile(join(target, "tracked.json"), "utf8")).toBe("tracked\n");
    expect(await git(target, "status", "--porcelain")).toBe("");
  });

  it("skips a match the new worktree's own ignore rules do not ignore", async () => {
    await git(primary, "checkout", "-q", "-b", "divergent");
    await writeAt(primary, ".gitignore", PRIMARY_IGNORES.replace("local.json\n", ""));
    await git(primary, "commit", "-am", "stop ignoring local.json");
    await git(primary, "checkout", "-q", "main");
    const target = join(worktreeParent, "divergent");
    await git(primary, "worktree", "add", target, "divergent");

    await copyWorktreeIncludes(includeContext(makeGitExec(primary)), primary, target);

    expect(await readFile(join(target, ".env"), "utf8")).toBe("PRIMARY=1\n");
    expect(await exists(join(target, "config", "local.json"))).toBe(false);
    expect(await git(target, "status", "--porcelain")).toBe("");
  });

  it("copies nothing and runs no Git command when the primary has no include file", async () => {
    await rm(join(primary, ".worktreeinclude"));
    const target = join(worktreeParent, "empty");
    await mkdir(target);
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
