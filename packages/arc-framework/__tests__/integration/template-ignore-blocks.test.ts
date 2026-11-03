/** ARC's managed `.ignore` block re-includes the personal root for search tools only; Git never reads `.ignore`. */
import { link, mkdir, readFile, symlink, unlink, writeFile } from "node:fs/promises";
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
    expect(stdout.split("\n").filter((line) => line.length > 0).sort()).toEqual([".arc/user/.npmignore", ".gitignore", ".ignore"]);
  } finally {
    await snapshot.remove();
  }
});

it.each(["search-link", "git-link", "hardlink", "external-link"])("refuses %s before changing any ignore member and allows a repaired retry", async (shape) => {
  const cwd = await createTempRepoCore({ prefix: "arc-ignore-alias-" });
  repositories.push(cwd);
  const gitignore = join(cwd, ".gitignore");
  const search = join(cwd, ".ignore");
  const external = join(cwd, "outside.json");
  const original = shape === "external-link" ? '{"keep":true}\n' : ".arc/user/*/\n";
  await writeFile(external, original);
  if (shape === "git-link") {
    await writeFile(search, original);
    await symlink(search, gitignore);
  } else {
    await writeFile(gitignore, original);
    if (shape === "hardlink") await link(gitignore, search);
    else await symlink(shape === "external-link" ? external : gitignore, search);
  }
  const write = () => writeArcIgnoreBlocks(cwd, [], (path) => readFile(path, "utf8"), (path, text) => writeFile(path, text));
  await expect(write()).rejects.toMatchObject({ code: "ignore.unsafe-output", whatToDo: expect.stringMatching(/replace.*retry/i) });
  expect(await readFile(gitignore, "utf8")).toBe(original);
  expect(await readFile(search, "utf8")).toBe(original);
  expect(await readFile(external, "utf8")).toBe(original);
  await unlink(shape === "git-link" ? gitignore : search);
  await write();
  expect(await readFile(gitignore, "utf8")).toContain("\n.arc/user/*/\n");
  expect(await readFile(search, "utf8")).toContain("!.arc/user/*/");
});
