/** A files check that withholds its paths runs once whenever its inputs change. */
import { afterEach, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

async function contentCheckRepository(): Promise<string> {
  const root = await createDeclaredCheckRepository({ content: {
    command: [process.execPath, "-e", recordInvocation], mode: "files", pass_paths: false, inputs: ["docs/**"],
    cache: false,
  } });
  repositories.push(root);
  return root;
}

async function invocations(root: string): Promise<string[][]> {
  return JSON.parse(await readFile(join(root, "receipt.json"), "utf8"));
}

it("runs once with no arguments, however many inputs changed", async () => {
  const root = await contentCheckRepository();
  await mkdir(join(root, "docs/many"));
  const paths = Array.from({ length: 200 }, (_, index) => `docs/many/${index.toString().padStart(3, "0")}-${"a".repeat(140)}.md`);
  await Promise.all(paths.map(path => writeFile(join(root, path), "input\n")));
  const result = await runArc(["check", "run", "content", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ id: "content", outcome: "passed" }]);
  expect(await invocations(root)).toEqual([[]]);
}, 60_000);

it("is not selected when none of its inputs changed, even when named", async () => {
  const root = await contentCheckRepository();
  const result = await runArc(["check", "run", "content", "--changed", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks)
    .toMatchObject([{ id: "content", outcome: "not selected", reason: "inputs unchanged" }]);
  await expect(readFile(join(root, "receipt.json"), "utf8")).rejects.toThrow();
}, 60_000);

it("is selected by a deleted input alone", async () => {
  const root = await contentCheckRepository();
  await git("git", ["restore", "src/a.ts"], { cwd: root });
  await rm(join(root, "docs/b.md"));
  const result = await runArc(["check", "run", "content", "--changed", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ id: "content", outcome: "passed" }]);
  expect(await invocations(root)).toEqual([[]]);
}, 60_000);
