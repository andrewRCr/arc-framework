/** Machine runner settings at HOME must not create or hide an ARC project. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { SchemaInstallEnvelopeSchema, SchemaRefusalEnvelopeSchema } from "../../src/lib/schema-command/envelope.js";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { createRunnerMachineHome } from "../fixtures/checks/runner-machine.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it("refuses schema installation outside a project below a configured machine home", async () => {
  const machine = await createRunnerMachineHome(directories, [join("/", "missing-runner")]);
  const outside = join(machine.home, "outside-project");
  await mkdir(outside);
  const result = await runArc(["schema", "install", "--json"], outside,
    { env: { ...machine.environment, FORCE_COLOR: undefined } });
  expect(result.exitCode, result.stdout + result.stderr).toBe(1);
  expect(SchemaRefusalEnvelopeSchema.parse(JSON.parse(result.stdout))).toEqual({
    status: "refused", reason: "arc-project-root-unresolved",
  });
  expect(result.stderr).toBe("");
});

it("discovers a real ARC project at configured home and runs its ineligible native check", async () => {
  const root = await createDeclaredCheckRepository({ native: { cache: false, runner: false,
    command: [process.execPath, "-e", "process.stdout.write('configured-home native result')"] } });
  directories.push(root);
  await writeFile(join(root, ".arc/config.yml"), JSON.stringify({ "checks.runner": [join("/", "missing-runner")] }));
  const env = { HOME: root, USERPROFILE: root, GIT_CONFIG_NOSYSTEM: "1", FORCE_COLOR: undefined };
  const installed = await runArc(["schema", "install", "--json"], root, { env });
  expect(installed.exitCode, installed.stdout + installed.stderr).toBe(0);
  expect(SchemaInstallEnvelopeSchema.parse(JSON.parse(installed.stdout))).toMatchObject({ status: "ok" });
  const result = await runArc(["check", "run", "native", "--json"], root, { env });
  expect(result.exitCode, result.stdout + result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks).toMatchObject([
    { id: "native", outcome: "passed", output: "configured-home native result" },
  ]);
});
