/** ARC's managed `.ignore` block re-includes the personal root for search tools only; Git never reads `.ignore`. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { createWorktreeSnapshot } from "../../src/lib/checks/tree.js";
import { writeArcIgnoreBlocks } from "../../src/lib/template/index.js";

const git = createExecaGitExec();
const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

it("leaves a check's worktree capture staging nothing under a personal root once the .ignore block is written", async () => {
  const cwd = await createTempRepoCore({ prefix: "arc-ignore-blocks-" });
  repositories.push(cwd);
  const personal = ".arc/user/andrew/SESSION-NOTES.md";
  await mkdir(dirname(join(cwd, personal)), { recursive: true });
  await writeFile(join(cwd, personal), "notes\n");
  await writeArcIgnoreBlocks(cwd, [], (path) => readFile(path, "utf8"), (path, content) => writeFile(path, content));
  const snapshot = await createWorktreeSnapshot(git, cwd);
  try {
    const { stdout } = await git("git", ["ls-tree", "-r", "--name-only", snapshot.tree], { cwd });
    expect(stdout.split("\n").filter((line) => line.length > 0).sort()).toEqual([".gitignore", ".ignore"]);
  } finally {
    await snapshot.remove();
  }
});
