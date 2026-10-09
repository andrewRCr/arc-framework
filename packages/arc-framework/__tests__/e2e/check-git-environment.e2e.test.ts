/** Checks receive a clean Git environment through requests and installed hooks. */
import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createDeclaredCheckRepository, installDeclaredCommitHook } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";
import { nestedGitCheckProgram } from "../fixtures/checks/nested-git.js";

const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });
const localVariables = ["GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY", "GIT_DIR", "GIT_WORK_TREE", "GIT_IMPLICIT_WORK_TREE", "GIT_GRAFT_FILE", "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS", "GIT_REPLACE_REF_BASE", "GIT_PREFIX", "GIT_SHALLOW_FILE", "GIT_COMMON_DIR"];
const git = promisify(execFile);

it("removes every repository-local Git variable from a check's environment", async () => {
  const script = `const keys=${JSON.stringify(localVariables)};require('node:fs').writeFileSync('receipt.json',JSON.stringify(Object.fromEntries(keys.filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]))))`;
  const root = await createDeclaredCheckRepository({ environment: { command: [process.execPath, "-e", script] } });
  repositories.push(root);
  const result = await runArc(["check", "run", "environment", "--json"], root, {
    env: Object.fromEntries(localVariables.map(variable => [variable, "/poisoned/repository"])),
  });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ outcome: "passed" }]);
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8"))).toEqual({});
});

it.each(["plain", "all", "linked"])("commits a nested fixture through the shipped hook in a %s commit", async mode => {
  const primary = await createDeclaredCheckRepository({ nested: {
    command: [process.execPath, "-e", nestedGitCheckProgram], gate: "commit", inputs: ["src/**"], cache: false,
  } });
  repositories.push(primary);
  let root = primary;
  if (mode === "linked") {
    root = await mkdtemp(join(tmpdir(), "arc-check-linked-"));
    repositories.unshift(root);
    await git("git", ["worktree", "add", "-b", "linked", root, "HEAD"], { cwd: primary });
    await writeFile(join(root, "src/a.ts"), "linked change\n");
  }
  await installDeclaredCommitHook(root);
  if (mode !== "all") await git("git", ["add", "src/a.ts"], { cwd: root });
  const result = await git("git", ["commit", ...(mode === "all" ? ["-a"] : []), "-m", "changed"], { cwd: root });
  expect(result.stdout + result.stderr).toContain("nested: passed");
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8"))).toEqual({ content: "nested", repositoryLocalVariables: [] });
});

it.each([
  ["gate", "commit"], ["gate", "push"], ["gate", "merge"], ["increment"], ["segment"],
  ["new-head", "--from", "HEAD"], ["run", "nested"],
])("creates and commits in an independent repository through check %j", async (...form) => {
  const root = await createDeclaredCheckRepository({ nested: {
    command: [process.execPath, "-e", nestedGitCheckProgram], gate: "commit", inputs: ["src/**"], cache: false,
  } });
  repositories.push(root);
  const result = await runArc(["check", ...form, "--json"], root, {
    env: { GIT_DIR: "/poisoned/repository", GIT_INDEX_FILE: "/poisoned/index", GIT_WORK_TREE: "/poisoned/worktree" },
  });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ id: "nested", outcome: "passed" }]);
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8"))).toEqual({ content: "nested", repositoryLocalVariables: [] });
});
