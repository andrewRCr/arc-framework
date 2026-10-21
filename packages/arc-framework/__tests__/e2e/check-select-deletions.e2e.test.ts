/** A files check that selects deletions runs once with no paths when deletions are all that changed. */
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
