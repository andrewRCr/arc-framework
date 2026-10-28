/** Actual native exit statuses retain check meaning beside incomplete execution on each platform. */
import { afterEach, expect, it } from "vitest";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { preparedAdapterScript } from "../fixtures/checks/prepared-execution.js";
import { createRunnerMachineHome, registerRunnerFixtureSources } from "../fixtures/checks/runner-machine.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.each([256, 0x80000000, 0xc0000005, 0xffffffff])("retains the platform's native failure for status %d beside incomplete work", async code => {
  const machine = await createRunnerMachineHome(directories, [process.execPath]);
  const adapter = join(machine.home, "adapter.cjs");
  await writeFile(adapter, preparedAdapterScript("group-loss", undefined, machine.home));
  await writeFile(join(machine.home, ".arc/config.yml"), JSON.stringify({ "checks.runner": [process.execPath, adapter] }));
  const definition = (status: number) => ({ checks: { example: { runner: true, mode: "files", inputs: ["long/**"],
    command: [process.execPath, "-e", `process.exit(${status})`] } } });
  const root = await createDeclaredCheckRepository(definition(code).checks);
  directories.push(root);
  await mkdir(join(root, "long"));
  const paths = Array.from({ length: 80 }, (_, index) => `long/item-${index}-${"x".repeat(140)}.txt`);
  await Promise.all(paths.map(path => writeFile(join(root, path), "captured\n")));
  const result = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  await registerRunnerFixtureSources(directories, join(machine.home, "source"));
  const native = process.platform === "win32" ? code : code % 256;
  expect(result.exitCode, result.stdout + result.stderr).toBe(native === 0 ? 2 : 1);
  const check = JSON.parse(result.stdout).result.checks[0];
  expect(check).toMatchObject({ outcome: native === 0 ? "couldn't run" : "failed", reason: expect.stringMatching(/closed|settle|protocol/iu) });
  expect(check).not.toHaveProperty("record");
  await expect(access(join(machine.home, "closed"))).resolves.toBeUndefined();
  await writeFile(adapter, preparedAdapterScript("execute", undefined, machine.home));
  await writeFile(join(root, ".arc/system/arc-checks.yml"), JSON.stringify(definition(0)));
  const repaired = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  expect(repaired.exitCode, repaired.stdout + repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).result.checks[0]).toMatchObject({ outcome: "passed" });
}, 30_000);
