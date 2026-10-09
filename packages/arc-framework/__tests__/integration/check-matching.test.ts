/** Input matching against real Git trees and pathspec semantics. */
import { afterEach, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { createExecaGitExec, createExecaGitExecInput } from "../../src/lib/git/process-executor.js";
import { stagedWorktreeTree } from "../../src/lib/checks/tree.js";
import { matchTreeInputs, selectChangedInputs } from "../../src/lib/checks/matching.js";

const io = { git: createExecaGitExec(), gitInput: createExecaGitExecInput() };
const repositories: string[] = [];
const files = ["root.ts", "src/a.ts", "src/deep/b.ts", "other/c.ts", "CAPS.ts", "name\n.ts"];
afterEach(async () => { vi.unstubAllEnvs(); await removeGitBackedDirs(repositories.splice(0)); });

async function fixture(): Promise<{ cwd: string; tree: string }> {
  const cwd = await createTempRepoCore({ prefix: "arc-check-match-" });
  repositories.push(cwd);
  for (const path of files) {
    await mkdir(dirname(join(cwd, path)), { recursive: true });
    await writeFile(join(cwd, path), `content of ${path}\n`);
  }
  return { cwd, tree: await stagedWorktreeTree(io.git, cwd) };
}

it.each([
  { pattern: "*.ts", expected: ["root.ts", "CAPS.ts", "name\n.ts"] },
  { pattern: "**/*.ts", expected: files },
  { pattern: "src/**", expected: ["src/a.ts", "src/deep/b.ts"] },
  { pattern: "src/**/b.ts", expected: ["src/deep/b.ts"] },
])("matches $pattern using Git's directory boundaries", async ({ pattern, expected }) => {
  const { cwd, tree } = await fixture();
  const result = await matchTreeInputs(io, cwd, tree, [pattern]);
  expect(result.status).toBe("known");
  if (result.status !== "known") throw new Error("Tree matching failed");
  expect(result.paths.map(entry => entry.path).sort()).toEqual([...expected].sort());
  for (const entry of result.paths) {
    expect(entry.newBlob).toBe((await io.git("git", ["rev-parse", `${tree}:${entry.path}`], { cwd })).stdout);
  }
});

it("does not select a check whose inputs the change misses", async () => {
  const { cwd } = await fixture();
  await io.git("git", ["add", "-A"], { cwd });
  await io.git("git", ["commit", "-m", "base"], { cwd });
  await writeFile(join(cwd, "other/c.ts"), "changed\n");
  const tree = await stagedWorktreeTree(io.git, cwd);
  expect(await selectChangedInputs(io.git, cwd, "HEAD", tree, ["src/**"])).toEqual({
    status: "not selected", reason: "inputs unchanged",
  });
});

it("selects matching inputs even when their only change is deletion", async () => {
  const { cwd } = await fixture();
  await io.git("git", ["add", "-A"], { cwd });
  await io.git("git", ["commit", "-m", "base"], { cwd });
  await rm(join(cwd, "src/a.ts"));
  const tree = await stagedWorktreeTree(io.git, cwd);
  const result = await selectChangedInputs(io.git, cwd, "HEAD", tree, ["src/**"]);
  expect(result.status).toBe("selected");
  if (result.status !== "selected") throw new Error("Input selection failed");
  expect(result.paths).toMatchObject([{ path: "src/a.ts", status: "D" }]);
});

it.each([
  { variables: { GIT_LITERAL_PATHSPECS: "1" }, pattern: "*.ts", expected: ["root.ts", "CAPS.ts", "name\n.ts"] },
  { variables: { GIT_GLOB_PATHSPECS: "1", GIT_LITERAL_PATHSPECS: "1" }, pattern: "*.ts", expected: ["root.ts", "CAPS.ts", "name\n.ts"] },
  { variables: { GIT_NOGLOB_PATHSPECS: "1", GIT_GLOB_PATHSPECS: "1" }, pattern: "*.ts", expected: ["root.ts", "CAPS.ts", "name\n.ts"] },
  { variables: { GIT_ICASE_PATHSPECS: "1" }, pattern: "caps.ts", expected: [] },
])("ignores caller pathspec variables $variables", async ({ variables, pattern, expected }) => {
  const { cwd, tree } = await fixture();
  for (const [name, value] of Object.entries(variables)) vi.stubEnv(name, value);
  const result = await matchTreeInputs(io, cwd, tree, [pattern]);
  expect(result.status).toBe("known");
  if (result.status !== "known") throw new Error("Tree matching failed");
  expect(result.paths.map(entry => entry.path).sort()).toEqual([...expected].sort());
  for (const [name, value] of Object.entries(variables)) expect(process.env[name]).toBe(value);
});

it("matches the whole tree when inputs are omitted", async () => {
  const { cwd, tree } = await fixture();
  const result = await matchTreeInputs(io, cwd, tree);
  expect(result.status).toBe("known");
  if (result.status !== "known") throw new Error("Tree matching failed");
  expect(result.paths.map(entry => entry.path).sort()).toEqual([...files].sort());
});

it("interprets a leading exclamation mark as an exclusion", async () => {
  const { cwd, tree } = await fixture();
  const result = await matchTreeInputs(io, cwd, tree, ["**/*.ts", "!src/**"]);
  expect(result.status).toBe("known");
  if (result.status !== "known") throw new Error("Tree matching failed");
  expect(result.paths.map(entry => entry.path).sort()).toEqual(["root.ts", "other/c.ts", "CAPS.ts", "name\n.ts"].sort());
});
