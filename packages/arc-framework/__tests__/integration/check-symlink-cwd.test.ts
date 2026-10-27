/** Native checks and forecasts preserve selected files through directory links. */
import { afterEach, expect, it, vi } from "vitest";
import { mkdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { handleCheckRun } from "../../src/commands/check.js";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runHandlerAt } from "../helpers/handler.js";
import { makeInteractionContext } from "../helpers/interaction-context.js";

const repositories: string[] = [];
const context = makeInteractionContext({ noInput: true, machineReadable: true });
const inspect = "const fs=require('node:fs');const paths=process.argv.slice(1);"
  + "const contents=paths.map(path=>fs.readFileSync(path,'utf8'));"
  + "const receipt={paths,contents,cwd:fs.realpathSync(process.cwd())};fs.writeFileSync('receipt.json',JSON.stringify(receipt));"
  + "console.log(JSON.stringify(receipt));process.exit(contents.some(content=>content.includes('BAD'))?1:0)";
const command = [process.execPath, "-e", inspect];
afterEach(async () => { vi.unstubAllEnvs(); await removeGitBackedDirs(repositories.splice(0)); });

it.each([
  { name: "absent wrong target", content: "GOOD\n", decoy: false, outcome: "passed", exitCode: 0 },
  { name: "passing decoy at the wrong target", content: "BAD\n", decoy: true, outcome: "failed", exitCode: 1 },
])("checks selected content through a directory link with $name", async scenario => {
  vi.stubEnv("FORCE_COLOR", undefined);
  const root = await createDeclaredCheckRepository({ files: {
    command, mode: "files", root: "alias", inputs: ["packages/check/file.txt"], cache: false,
  } });
  repositories.push(root);
  const directory = join(root, "packages/check");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "file.txt"), scenario.content);
  await symlink(directory, join(root, "alias"), "junction");
  if (scenario.decoy) {
    await mkdir(join(root, "packages/packages/check"), { recursive: true });
    await writeFile(join(root, "packages/packages/check/file.txt"), "GOOD\n");
  }
  const dry = await runHandlerAt(root, () => handleCheckRun(["files"], { json: true, dryRun: true }, context));
  const before = await readFile(join(directory, "receipt.json"), "utf8").catch(() => undefined);
  const result = await runHandlerAt(root, () => handleCheckRun(["files"], { json: true }, context));
  const forecast = JSON.parse(dry.stdout).result.checks[0];
  const check = JSON.parse(result.stdout).result.checks[0];
  const receipt = await readFile(join(directory, "receipt.json"), "utf8").then(text => JSON.parse(text)).catch(() => undefined);
  expect.soft(dry.exitCode, dry.stdout + dry.stderr).toBe(0);
  expect.soft(forecast).toMatchObject({ outcome: "would run", cwd: "alias", batches: [[...command, "file.txt"]] });
  expect.soft(before).toBeUndefined();
  expect.soft(result.exitCode, result.stdout + result.stderr).toBe(scenario.exitCode);
  expect.soft(check).toMatchObject({ outcome: scenario.outcome });
  expect.soft(receipt).toEqual({ paths: ["file.txt"], contents: [scenario.content], cwd: await realpath(directory) });
});

it("retains native missing-directory reporting and succeeds after repair", async () => {
  vi.stubEnv("FORCE_COLOR", undefined);
  const root = await createDeclaredCheckRepository({ files: {
    command, mode: "files", root: "missing", inputs: ["packages/check/file.txt"], cache: false,
  } });
  repositories.push(root);
  await mkdir(join(root, "packages/check"), { recursive: true });
  await writeFile(join(root, "packages/check/file.txt"), "GOOD\n");
  const dry = await runHandlerAt(root, () => handleCheckRun(["files"], { json: true, dryRun: true }, context));
  const unavailable = await runHandlerAt(root, () => handleCheckRun(["files"], { json: true }, context));
  await mkdir(join(root, "missing"));
  const repaired = await runHandlerAt(root, () => handleCheckRun(["files"], { json: true }, context));
  expect.soft(dry.exitCode, dry.stdout + dry.stderr).toBe(0);
  expect.soft(JSON.parse(dry.stdout).result?.checks[0]).toMatchObject({ outcome: "would run", cwd: "missing",
    batches: [[...command, "../packages/check/file.txt"]] });
  expect.soft(unavailable.exitCode, unavailable.stdout + unavailable.stderr).toBe(2);
  expect.soft(JSON.parse(unavailable.stdout).result?.checks[0]).toMatchObject({ outcome: "couldn't run",
    remedy: "arc check run files --all" });
  expect.soft(repaired.exitCode, repaired.stdout + repaired.stderr).toBe(0);
  const check = JSON.parse(repaired.stdout).result.checks[0];
  expect(check.outcome).toBe("passed");
  expect(JSON.parse(check.output).contents).toEqual(["GOOD\n"]);
});
