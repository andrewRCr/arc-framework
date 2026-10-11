/** Real Git staging semantics for check-request snapshots. */
import { afterEach, expect, it } from "vitest";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { readTreeChange, stagedWorktreeTree } from "../../src/lib/checks/tree.js";

const git = createExecaGitExec();
const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

async function fixture(): Promise<string> {
  const cwd = await createTempRepoCore({ prefix: "arc-check-tree-" });
  repositories.push(cwd);
  await writeFile(join(cwd, ".gitignore"), "ignored.txt\n");
  await writeFile(join(cwd, "staged.txt"), "base\n");
  await writeFile(join(cwd, "unstaged.txt"), "base\n");
  await git("git", ["add", "-A"], { cwd });
  await git("git", ["commit", "-m", "base"], { cwd });
  return cwd;
}

it("includes staged, unstaged, and admitted untracked content, excluding ignored files", async () => {
  const cwd = await fixture();
  await writeFile(join(cwd, "staged.txt"), "staged\n");
  await git("git", ["add", "staged.txt"], { cwd });
  await writeFile(join(cwd, "unstaged.txt"), "unstaged\n");
  await writeFile(join(cwd, "new.txt"), "new\n");
  await writeFile(join(cwd, "ignored.txt"), "ignored\n");
  const tree = await stagedWorktreeTree(git, cwd);
  const names = (await git("git", ["ls-tree", "--name-only", "-z", tree], { cwd, preserveOutput: true })).stdout;
  expect(names.split("\0").filter(Boolean)).toEqual([".gitignore", "new.txt", "staged.txt", "unstaged.txt"]);
  expect((await git("git", ["show", `${tree}:staged.txt`], { cwd })).stdout).toBe("staged");
  expect((await git("git", ["show", `${tree}:unstaged.txt`], { cwd })).stdout).toBe("unstaged");
  expect(await readFile(join(cwd, "new.txt"), "utf8")).toBe("new\n");
});

it("snapshots a new repository before its first index exists", async () => {
  const cwd = await createTempRepoCore({ prefix: "arc-check-unborn-" });
  repositories.push(cwd);
  await writeFile(join(cwd, "first.txt"), "first\n");
  const tree = await stagedWorktreeTree(git, cwd);
  expect((await git("git", ["ls-tree", "--name-only", tree], { cwd })).stdout).toBe("first.txt");
  await expect(readFile(join(cwd, ".git", "index"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("distinguishes an unchanged worktree from an unavailable base", async () => {
  const cwd = await fixture();
  const tree = await stagedWorktreeTree(git, cwd);
  expect(await readTreeChange(git, cwd, "HEAD", tree)).toEqual({ status: "known", paths: [] });
  expect(await readTreeChange(git, cwd, "absent-base", tree)).toEqual({ status: "unresolved" });
});

it("represents a rename as deletion and addition with complete blob identities", async () => {
  const cwd = await fixture();
  const originalBlob = (await git("git", ["rev-parse", "HEAD:unstaged.txt"], { cwd })).stdout;
  await rename(join(cwd, "unstaged.txt"), join(cwd, "renamed.txt"));
  const tree = await stagedWorktreeTree(git, cwd);
  expect(await readTreeChange(git, cwd, "HEAD", tree)).toEqual({ status: "known", paths: [
    { path: "renamed.txt", status: "A", oldMode: "000000", newMode: "100644", oldBlob: "0".repeat(originalBlob.length), newBlob: originalBlob },
    { path: "unstaged.txt", status: "D", oldMode: "100644", newMode: "000000", oldBlob: originalBlob, newBlob: "0".repeat(originalBlob.length) },
  ] });
  const names = (await git("git", ["ls-tree", "--name-only", "-z", tree], { cwd, preserveOutput: true })).stdout;
  expect(names.split("\0")).not.toContain("unstaged.txt");
});

it("leaves the real index and worktree bytes unchanged", async () => {
  const cwd = await fixture();
  await writeFile(join(cwd, "unstaged.txt"), "worktree\n");
  await writeFile(join(cwd, "new.txt"), "untracked\n");
  const indexBefore = await readFile(join(cwd, ".git", "index"));
  await stagedWorktreeTree(git, cwd);
  expect(await readFile(join(cwd, ".git", "index"))).toEqual(indexBefore);
  expect(await readFile(join(cwd, "unstaged.txt"), "utf8")).toBe("worktree\n");
  expect(await readFile(join(cwd, "new.txt"), "utf8")).toBe("untracked\n");
});
