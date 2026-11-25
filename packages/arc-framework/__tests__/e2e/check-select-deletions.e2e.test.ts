/** A files check that selects deletions runs once with no paths when deletions are all a change made itself. */
import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const git = promisify(execFile);
const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

const recordInvocation = "const fs=require('node:fs');const runs=fs.existsSync('receipt.json')"
  + "?JSON.parse(fs.readFileSync('receipt.json')):[];runs.push(process.argv.slice(1));"
  + "fs.writeFileSync('receipt.json',JSON.stringify(runs))";

/** A committed repository whose only docs inputs are `docs/b.md` and `docs/c.md`, with no change yet. */
async function docsRepository(selectDeletions: boolean): Promise<string> {
  const root = await createDeclaredCheckRepository({ content: {
    command: [process.execPath, "-e", recordInvocation], mode: "files", inputs: ["docs/**"], cache: false,
    ...(selectDeletions ? { select_deletions: true } : {}),
  } });
  repositories.push(root);
  await git("git", ["restore", "src/a.ts"], { cwd: root });
  await writeFile(join(root, "docs/c.md"), "base\n");
  await git("git", ["add", "docs/c.md"], { cwd: root });
  await git("git", ["commit", "-m", "second input"], { cwd: root });
  return root;
}

async function runChanged(root: string): Promise<unknown> {
  const result = await runArc(["check", "run", "content", "--changed", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  return JSON.parse(result.stdout).result.checks;
}

async function runRange(root: string, base: string): Promise<unknown> {
  const result = await runArc(["check", "run", "content", "--range", base, "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  return JSON.parse(result.stdout).result.checks;
}

/** Track `origin/main` as main's upstream and branch `feature` off it, returning the branch point. */
async function featureBranch(root: string): Promise<string> {
  const base = (await git("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  await git("git", ["remote", "add", "origin", join(root, ".missing-origin")], { cwd: root });
  await git("git", ["config", "branch.main.remote", "origin"], { cwd: root });
  await git("git", ["config", "branch.main.merge", "refs/heads/main"], { cwd: root });
  await git("git", ["update-ref", "refs/remotes/origin/main", base], { cwd: root });
  await git("git", ["checkout", "-b", "feature"], { cwd: root });
  return base;
}

/** Publish main's tip as the remote base, then merge it into `feature`. */
async function mergePublishedBase(root: string): Promise<void> {
  await git("git", ["update-ref", "refs/remotes/origin/main", "main"], { cwd: root });
  await git("git", ["checkout", "feature"], { cwd: root });
  await git("git", ["merge", "--no-ff", "main", "-m", "merge base"], { cwd: root });
}

async function invocations(root: string): Promise<string[][]> {
  return JSON.parse(await readFile(join(root, "receipt.json"), "utf8"));
}

it("runs once with no paths when a deletion is the only change", async () => {
  const root = await docsRepository(true);
  await rm(join(root, "docs/b.md"));
  expect(await runChanged(root)).toMatchObject([{ id: "content", outcome: "passed" }]);
  expect(await invocations(root)).toEqual([[]]);
}, 60_000);

it("passes only the live paths when a deletion comes with a change", async () => {
  const root = await docsRepository(true);
  await rm(join(root, "docs/b.md"));
  await writeFile(join(root, "docs/c.md"), "changed\n");
  expect(await runChanged(root)).toMatchObject([{ id: "content", outcome: "passed" }]);
  expect(await invocations(root)).toEqual([["docs/c.md"]]);
}, 60_000);

it("is not selected by a deletion alone when it does not select deletions", async () => {
  const root = await docsRepository(false);
  await rm(join(root, "docs/b.md"));
  expect(await runChanged(root)).toMatchObject([{ id: "content", outcome: "not selected", reason: "no files to check" }]);
  await expect(readFile(join(root, "receipt.json"), "utf8")).rejects.toThrow();
}, 60_000);

it("runs once with no paths for a range's own deletion beside a change a base merge brought in", async () => {
  const root = await docsRepository(true);
  const base = await featureBranch(root);
  await git("git", ["rm", "-q", "docs/b.md"], { cwd: root });
  await git("git", ["commit", "-m", "own deletion"], { cwd: root });
  await git("git", ["checkout", "main"], { cwd: root });
  await writeFile(join(root, "docs/c.md"), "incoming\n");
  await git("git", ["commit", "-am", "incoming"], { cwd: root });
  await mergePublishedBase(root);
  expect(await runRange(root, base)).toMatchObject([{ id: "content", outcome: "passed", mergedIn: ["docs/c.md"] }]);
  expect(await invocations(root)).toEqual([[]]);
}, 60_000);

it("is not selected by a deletion only a base merge brought in", async () => {
  const root = await docsRepository(true);
  const base = await featureBranch(root);
  await git("git", ["checkout", "main"], { cwd: root });
  await git("git", ["rm", "-q", "docs/b.md"], { cwd: root });
  await git("git", ["commit", "-m", "incoming deletion"], { cwd: root });
  await mergePublishedBase(root);
  expect(await runRange(root, base)).toMatchObject([{ id: "content", outcome: "not selected",
    reason: "every changed file was merged in unchanged", mergedIn: ["docs/b.md"] }]);
  await expect(readFile(join(root, "receipt.json"), "utf8")).rejects.toThrow();
}, 60_000);
