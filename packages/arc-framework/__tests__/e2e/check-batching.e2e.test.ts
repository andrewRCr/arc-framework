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
