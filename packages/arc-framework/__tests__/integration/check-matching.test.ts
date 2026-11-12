/** Input matching against real Git trees and pathspec semantics. */
import { afterEach, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { RawGitExec } from "../../src/lib/git/exec.js";
import { matchPathList } from "../../src/lib/checks/path-list.js";
import { dirname, join } from "node:path";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { createExecaGitExec, createExecaGitExecInput, createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
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

const explicitPaths = [...files, ".arc/active/current/meta-unit.md", ".arc/user/alice/USER-INBOX.md",
  ".arc/completed/meta-old.md", "space name.md", "[literal].md", ":(glob)*.md"];
const raw = createExecaRawGitExec();

it.each([
  { inputs: ["**"], expected: explicitPaths },
  { inputs: ["**/*.md", "!.arc/completed/**"], expected: explicitPaths.slice(6).filter(path => !path.includes("completed")) },
  { inputs: ["src/**", "!src/deep/**"], expected: ["src/a.ts"] },
  { inputs: ["caps.ts"], expected: [] },
  { inputs: ["CAPS.ts"], expected: ["CAPS.ts"] },
  { inputs: ["*.md"], expected: ["space name.md", "[literal].md", ":(glob)*.md"] },
  { inputs: [], expected: [] },
])("matches an explicit list with $inputs", async ({ inputs, expected }) => {
  const { cwd } = await fixture();
  expect(await matchPathList({ git: raw }, cwd, explicitPaths, inputs)).toEqual({ status: "ok", paths: [...expected].sort() });
});

it("admits an empty supplied list", async () => {
  const { cwd } = await fixture();
  expect(await matchPathList({ git: raw }, cwd, [], ["**"])).toEqual({ status: "ok", paths: [] });
});

it.each(
  ["sha1", "sha256"].flatMap(format => [false, true].map(splitIndex => ({ format, splitIndex }))),
)("keeps the $format real index and object store unchanged and removes scratch (splitIndex=$splitIndex)", async ({ format, splitIndex }) => {
  const { cwd } = await fixture();
  // Convert the empty fixture before it holds objects for the second object format.
  if (format === "sha256") {
    await rm(join(cwd, ".git"), { recursive: true, force: true });
    await raw(["init", "--object-format=sha256"], { cwd });
  }
  await raw(["config", "core.splitIndex", String(splitIndex)], { cwd });
  await raw(["config", "splitIndex.sharedIndexExpire", "2.weeks.ago"], { cwd });
  await raw(["add", "root.ts"], { cwd });
  const index = await readFile(join(cwd, ".git/index"));
  const config = await readFile(join(cwd, ".git/config"));
  const staged = await raw(["ls-files", "--stage", "-z"], { cwd });
  const gitFiles = (await readdir(join(cwd, ".git"))).sort();
  const objects = await readdir(join(cwd, ".git/objects"), { recursive: true });
  if (splitIndex) {
    const shared = gitFiles.filter(name => name.startsWith("sharedindex."));
    expect(shared.length).toBeGreaterThan(0);
    for (const name of shared) await utimes(join(cwd, ".git", name), new Date("2020-01-01"), new Date("2020-01-01"));
  }
  const scratch = await mkdtemp(join(tmpdir(), "arc-match-parent-"));
  repositories.push(scratch);
  const createDirectory = (prefix: string) => mkdtemp(join(scratch, prefix.split(/[\\/]/u).at(-1) ?? "index-"));
  expect(await matchPathList({ git: raw, createDirectory }, cwd, explicitPaths, ["**"]))
    .toEqual({ status: "ok", paths: [...explicitPaths].sort() });
  expect(await readFile(join(cwd, ".git/index"))).toEqual(index);
  expect(await readFile(join(cwd, ".git/config"))).toEqual(config);
  expect((await readdir(join(cwd, ".git"))).sort()).toEqual(gitFiles);
  expect((await raw(["ls-files", "--stage", "-z"], { cwd })).stdout).toEqual(staged.stdout);
  expect(await readdir(join(cwd, ".git/objects"), { recursive: true })).toEqual(objects);
  expect(await readdir(scratch)).toEqual([]);
});

it.each(["create", "update-index", "ls-files"])("reports %s failure and succeeds after repair", async step => {
  const { cwd } = await fixture();
  await raw(["add", "root.ts"], { cwd });
  const index = await readFile(join(cwd, ".git/index"));
  const objects = await readdir(join(cwd, ".git/objects"), { recursive: true });
  const scratch = await mkdtemp(join(tmpdir(), "arc-match-failure-"));
  repositories.push(scratch);
  let fail = true;
  const git: RawGitExec = (args, options) => {
    if (fail && args[0] === step) return Promise.reject(new Error(`injected ${step} failure`));
    return raw(args, options);
  };
  const createDirectory = (prefix: string) => fail && step === "create"
    ? Promise.reject(new Error("injected create failure")) : mkdtemp(join(scratch, prefix.split(/[\\/]/u).at(-1) ?? "index-"));
  expect(await matchPathList({ git, createDirectory }, cwd, explicitPaths, ["**"]))
    .toEqual({ status: "unavailable", reason: expect.stringContaining(`injected ${step} failure`) });
  expect(await readdir(scratch)).toEqual([]);
  expect(await readFile(join(cwd, ".git/index"))).toEqual(index);
  expect(await readdir(join(cwd, ".git/objects"), { recursive: true })).toEqual(objects);
  fail = false;
  expect(await matchPathList({ git, createDirectory }, cwd, explicitPaths, ["**"]))
    .toEqual({ status: "ok", paths: [...explicitPaths].sort() });
  expect(await readdir(scratch)).toEqual([]);
});

it("ignores conflicting ambient pathspec policy for explicit lists", async () => {
  const { cwd } = await fixture();
  for (const name of ["GIT_LITERAL_PATHSPECS", "GIT_GLOB_PATHSPECS", "GIT_NOGLOB_PATHSPECS", "GIT_ICASE_PATHSPECS"]) vi.stubEnv(name, "1");
  expect(await matchPathList({ git: raw }, cwd, explicitPaths, ["**/*.md", "!.arc/completed/**"]))
    .toEqual({ status: "ok", paths: explicitPaths.slice(6).filter(path => !path.includes("completed")).sort() });
});
