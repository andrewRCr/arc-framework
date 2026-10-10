/** Declared index readers see the request's checked content through an absolute index path. */
import { afterEach, expect, it } from "vitest";
import { mkdir, readFile, writeFile, utimes } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const repositories: string[] = [];
const git = promisify(execFile);
const script = "const fs=require('node:fs');const tree=require('node:child_process').execFileSync('git',['write-tree'],{encoding:'utf8'}).trim();fs.writeFileSync('receipt.json',JSON.stringify({tree,index:process.env.GIT_INDEX_FILE}))";
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

it("gives a worktree request an absolute temporary index equal to its checked tree", async () => {
  const root = await createDeclaredCheckRepository({ index: {
    command: [process.execPath, "-e", script], mode: "files", inputs: ["src/a.ts"], reads_index: true, cache: false,
  } });
  repositories.push(root);
  const ownIndex = await readFile(join(root, ".git/index"));
  const worktree = await readFile(join(root, "src/a.ts"), "utf8");
  const result = await runArc(["check", "run", "index", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  const observed: { tree: string; index: string } = JSON.parse(await readFile(join(root, "receipt.json"), "utf8"));
  expect(observed.tree).toBe(JSON.parse(result.stdout).result.tree);
  expect(isAbsolute(observed.index)).toBe(true);
  expect(observed.index).toContain(join(".git", "arc-checks"));
  await expect(readFile(observed.index)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(root, ".git/index"))).toEqual(ownIndex);
  expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe(worktree);
});

it.each(["worktree", "staged", "hook"])("provides an absolute index from a nested root for a %s request", async scope => {
  const root = await createDeclaredCheckRepository({ index: {
    command: [process.execPath, "-e", script], root: "docs", gate: "commit", mode: "files", inputs: ["src/a.ts"],
    reads_index: true, cache: false,
  } });
  repositories.push(root);
  if (scope !== "worktree") {
    await git("git", ["add", "src/a.ts"], { cwd: root });
    await git("git", ["write-tree"], { cwd: root });
    if (scope === "staged") await writeFile(join(root, "src/a.ts"), "unstaged content\n");
  }
  const ownIndex = await readFile(join(root, ".git/index"));
  const worktree = await readFile(join(root, "src/a.ts"), "utf8");
  const result = await runArc(scope === "hook" ? ["check", "pre-commit", "--json"]
    : ["check", "run", "index", ...(scope === "staged" ? ["--staged"] : []), "--json"], root,
  scope === "hook" ? { env: { GIT_INDEX_FILE: ".git/index" } } : undefined);
  expect(result.exitCode, result.stdout + result.stderr).toBe(0);
  const observed: { tree: string; index: string } = JSON.parse(await readFile(join(root, "docs/receipt.json"), "utf8"));
  expect(observed.tree).toBe(JSON.parse(result.stdout).result.tree);
  expect(isAbsolute(observed.index)).toBe(true);
  if (scope === "hook") expect(observed.index).toBe(join(root, ".git/index"));
  else await expect(readFile(observed.index)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(root, ".git/index"))).toEqual(ownIndex);
  expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe(worktree);
});

it("ignores a stranded index from an earlier run", async () => {
  const root = await createDeclaredCheckRepository({ index: {
    command: [process.execPath, "-e", script], mode: "files", inputs: ["src/a.ts"], reads_index: true, cache: false,
  } });
  repositories.push(root);
  const directory = join(root, ".git/arc-checks/index-stranded");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "index"), "unfinished index\n");
  const result = await runArc(["check", "run", "index", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  const observed: { tree: string; index: string } = JSON.parse(await readFile(join(root, "receipt.json"), "utf8"));
  expect(observed.tree).toBe(JSON.parse(result.stdout).result.tree);
  expect(observed.index).not.toBe(join(directory, "index"));
  expect(await readFile(join(directory, "index"), "utf8")).toBe("unfinished index\n");
});

it("retains worktree stat data in the index it supplies", async () => {
  const inspect = "const fs=require('node:fs');const diff=require('node:child_process').execFileSync('git',['diff-files','--name-only','--','src/a.ts'],{encoding:'utf8'});fs.writeFileSync('receipt.json',JSON.stringify({diff}))";
  const root = await createDeclaredCheckRepository({ index: {
    command: [process.execPath, "-e", inspect], mode: "files", inputs: ["src/a.ts"], reads_index: true, cache: false,
  } });
  repositories.push(root);
  const result = await runArc(["check", "run", "index", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8")).diff).toBe("");
});

it.each([false, true])("refreshes the index for a later fixer after a rewrite, staged=%s", async staged => {
  const rewrite = "require('node:fs').writeFileSync('src/a.ts','fixed content\\n')";
  const inspect = "const fs=require('node:fs');const git=(...args)=>require('node:child_process').execFileSync('git',args,{encoding:'utf8'}).trim();fs.writeFileSync('receipt.json',JSON.stringify({tree:git('write-tree'),turn:process.env.ARC_CHECK_TREE,content:git('show',':src/a.ts'),index:process.env.GIT_INDEX_FILE}))";
  const root = await createDeclaredCheckRepository({
    rewrite: { command: [process.execPath, "-e", rewrite], mode: "files", inputs: ["src/a.ts"], fixes: true, cache: false },
    index: { command: [process.execPath, "-e", inspect], mode: "files", inputs: ["src/a.ts"], fixes: true, reads_index: true, cache: false },
  });
  repositories.push(root);
  if (staged) {
    await git("git", ["add", "src/a.ts"], { cwd: root });
    await git("git", ["write-tree"], { cwd: root });
  }
  const ownIndex = await readFile(join(root, ".git/index"));
  const result = await runArc(["check", "run", "rewrite", "index", ...(staged ? ["--staged"] : []), "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  const observed = JSON.parse(await readFile(join(root, "receipt.json"), "utf8"));
  expect(observed.content).toBe("fixed content");
  expect(observed.tree).toBe(observed.turn);
  expect(observed.tree).toBe(JSON.parse(result.stdout).result.tree);
  expect(await readFile(join(root, ".git/index"))).toEqual(ownIndex);
  await expect(readFile(observed.index)).rejects.toMatchObject({ code: "ENOENT" });
});

it("preserves the index timestamp so equal-size edits cannot hide in cached file metadata", async () => {
  const inspect = "const git=(...args)=>require('node:child_process').execFileSync('git',args,{encoding:'utf8'}).trim();require('node:fs').writeFileSync('receipt.json',JSON.stringify({content:git('show',':src/a.ts')}))";
  const root = await createDeclaredCheckRepository({ index: {
    command: [process.execPath, "-e", inspect], inputs: ["src/a.ts"], reads_index: true, cache: false,
  } });
  repositories.push(root);
  await git("git", ["config", "core.trustctime", "false"], { cwd: root });
  await git("git", ["config", "core.checkStat", "minimal"], { cwd: root });
  const timestamp = new Date("2020-01-01T00:00:00.000Z");
  await utimes(join(root, "src/a.ts"), timestamp, timestamp);
  await git("git", ["add", "src/a.ts"], { cwd: root });
  await git("git", ["write-tree"], { cwd: root });
  await utimes(join(root, ".git/index"), timestamp, timestamp);
  await writeFile(join(root, "src/a.ts"), "forming\n");
  await utimes(join(root, "src/a.ts"), timestamp, timestamp);
  const result = await runArc(["check", "run", "index", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8")).content).toBe("forming");
});

it("refreshes index stat data after a fixer rewrites identical bytes without changing the tree", async () => {
  const touch = "const fs=require('node:fs');fs.writeFileSync('src/a.ts','changed\\n');const timestamp=new Date('2027-01-01T00:00:00Z');fs.utimesSync('src/a.ts',timestamp,timestamp)";
  const inspect = "const diff=require('node:child_process').execFileSync('git',['diff-files','--name-only','--','src/a.ts'],{encoding:'utf8'});require('node:fs').writeFileSync('receipt.json',JSON.stringify({diff}))";
  const root = await createDeclaredCheckRepository({
    touch: { command: [process.execPath, "-e", touch], inputs: ["src/a.ts"], fixes: true, cache: false },
    index: { command: [process.execPath, "-e", inspect], inputs: ["src/a.ts"], reads_index: true, cache: false },
  });
  repositories.push(root);
  const result = await runArc(["check", "run", "touch", "index", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8")).diff).toBe("");
  expect(JSON.parse(result.stdout).result.checks[0].rewritten).toEqual([]);
});
