import { mkdtemp, mkdir, lstat, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readGitDirectories } from "../../../src/lib/git/directories.js";

const roots: string[] = [];
const files = { lstat, readFile: (path: string) => readFile(path, "utf8") };
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function root() {
  const path = await mkdtemp(join(tmpdir(), "arc-git-directories-"));
  roots.push(path);
  return path;
}

describe("filesystem Git directory discovery", () => {
  it("uses the main checkout's .git directory for both metadata scopes", async () => {
    const path = await root();
    const gitDir = join(path, ".git");
    await mkdir(gitDir);
    expect(await readGitDirectories(path, files)).toEqual({ gitDir, commonDir: gitDir });
  });

  it("uses a .git file's directory for both scopes when it has no commondir", async () => {
    const path = await root();
    const gitDir = join(path, "separate.git");
    await mkdir(gitDir);
    await writeFile(join(path, ".git"), `gitdir: ${gitDir}\n`);
    expect(await readGitDirectories(path, files)).toEqual({ gitDir, commonDir: gitDir });
  });


  it("resolves .git and commondir relative to the files that contain them", async () => {
    const path = await root();
    const checkout = join(path, "checkout");
    const commonDir = join(path, "repository", ".git");
    const gitDir = join(commonDir, "worktrees", "child");
    await mkdir(checkout);
    await mkdir(gitDir, { recursive: true });
    await writeFile(join(checkout, ".git"), "gitdir: ../repository/.git/worktrees/child\n");
    await writeFile(join(gitDir, "commondir"), "../..\n");
    expect(await readGitDirectories(checkout, files)).toEqual({ gitDir, commonDir });
  });


  it("refuses a malformed .git marker and succeeds after its path is repaired", async () => {
    const path = await root();
    const gitDir = join(path, "repaired.git");
    await mkdir(gitDir);
    const marker = join(path, ".git");
    await writeFile(marker, "not a Git marker\n");
    await expect(readGitDirectories(path, files)).rejects.toThrow(/repair.*gitdir:/u);
    await writeFile(marker, `gitdir: ${gitDir}\n`);
    expect(await readGitDirectories(path, files)).toEqual({ gitDir, commonDir: gitDir });
  });


  it("preserves an unreadable commondir failure and succeeds once access is repaired", async () => {
    const path = await root();
    const gitDir = join(path, ".git");
    await mkdir(gitDir);
    const original = Object.assign(new Error("EACCES: commondir is unreadable"), { code: "EACCES" });
    const unreadable = { ...files, readFile: async (): Promise<string> => { throw original; } };
    await expect(readGitDirectories(path, unreadable)).rejects.toBe(original);
    expect(await readGitDirectories(path, files)).toEqual({ gitDir, commonDir: gitDir });
  });

});
