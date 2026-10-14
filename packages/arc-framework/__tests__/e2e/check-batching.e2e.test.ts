/** File-check batching preserves every argument and combines batch outcomes. */
import { afterEach, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

it.each(["none", "first", "last"])("runs all file batches and retains a %s batch failure", async failure => {
  const script = "const fs=require('node:fs');const args=process.argv.slice(1);const batches=fs.existsSync('receipt.json')?JSON.parse(fs.readFileSync('receipt.json')):[];batches.push(args);fs.writeFileSync('receipt.json',JSON.stringify(batches));process.exit(args.some(path=>path.includes('-fail'))?1:0)";
  const root = await createDeclaredCheckRepository({ files: {
    command: [process.execPath, "-e", script], mode: "files", inputs: ["src/batch/**"], cache: false,
  } });
  repositories.push(root);
  await mkdir(join(root, "src/batch"));
  const paths = Array.from({ length: 200 }, (_, index) => `src/batch/${index.toString().padStart(3, "0")}-${"a".repeat(140)}.ts`);
  if (failure === "first") paths.unshift("src/batch/000-0-fail.ts");
  if (failure === "last") paths.push("src/batch/zz-fail.ts");
  await Promise.all(paths.map(path => writeFile(join(root, path), "input\n")));
  const result = await runArc(["check", "run", "files", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(failure === "none" ? 0 : 1);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ outcome: failure === "none" ? "passed" : "failed" }]);
  const batches: string[][] = JSON.parse(await readFile(join(root, "receipt.json"), "utf8"));
  expect(batches.length).toBeGreaterThan(1);
  expect(batches.flat()).toEqual(paths);
});

it.each([
  { shape: "every batch empty", marker: undefined, outcome: "no evidence", exit: 1 },
  { shape: "one batch tested", marker: "000-0-tested", outcome: "passed", exit: 0 },
  { shape: "one batch failing", marker: "000-0-fail", outcome: "failed", exit: 1 },
])("combines no-evidence batches with $shape as $outcome", async ({ marker, outcome, exit }) => {
  const script = "const args=process.argv.slice(1);"
    + "process.exit(args.some(path=>path.includes('-fail'))?1:args.some(path=>path.includes('-tested'))?0:5)";
  const root = await createDeclaredCheckRepository({ files: {
    command: [process.execPath, "-e", script], mode: "files", inputs: ["src/batch/**"], cache: false, no_evidence_exit: 5,
  } });
  repositories.push(root);
  await mkdir(join(root, "src/batch"));
  const paths = Array.from({ length: 200 }, (_, index) => `src/batch/${index.toString().padStart(3, "0")}-${"a".repeat(140)}.ts`);
  if (marker !== undefined) paths.unshift(`src/batch/${marker}.ts`);
  await Promise.all(paths.map(path => writeFile(join(root, path), "input\n")));
  const result = await runArc(["check", "run", "files", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(exit);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ outcome }]);
});

it.each([
  { order: "a failure before a kill", first: "000-0-fail", last: "zz-kill" },
  { order: "a kill before a failure", first: "000-0-kill", last: "zz-fail" },
])("reports $order in separate batches as failed", async ({ first, last }) => {
  const script = "const args=process.argv.slice(1);"
    + "process.exit(args.some(path=>path.includes('-fail'))?1:args.some(path=>path.includes('-kill'))?137:0)";
  const root = await createDeclaredCheckRepository({ files: {
    command: [process.execPath, "-e", script], mode: "files", inputs: ["src/batch/**"], cache: false,
  } });
  repositories.push(root);
  await mkdir(join(root, "src/batch"));
  const paths = [`src/batch/${first}.ts`,
    ...Array.from({ length: 200 }, (_, index) => `src/batch/${index.toString().padStart(3, "0")}-${"a".repeat(140)}.ts`),
    `src/batch/${last}.ts`];
  await Promise.all(paths.map(path => writeFile(join(root, path), "input\n")));
  const result = await runArc(["check", "run", "files", "--json"], root);
  expect(result.exitCode, result.stderr).toBe(1);
  const [check] = JSON.parse(result.stdout).result.checks;
  expect(check).toMatchObject({ outcome: "failed" });
  expect(check).not.toHaveProperty("reason");
});
