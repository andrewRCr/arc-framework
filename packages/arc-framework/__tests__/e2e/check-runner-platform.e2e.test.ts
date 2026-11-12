/** Actual native exit statuses retain check meaning beside incomplete execution on each platform. */
import { afterEach, expect, it } from "vitest";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { preparedAdapterScript } from "../fixtures/checks/prepared-execution.js";
import { createRunnerMachineHome, registerRunnerFixtureSources } from "../fixtures/checks/runner-machine.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function platformCheck(code: number, noEvidenceExit?: number) {
  const machine = await createRunnerMachineHome(directories, [process.execPath]);
  const adapter = join(machine.home, "adapter.cjs");
  await writeFile(adapter, preparedAdapterScript("group", undefined, machine.home));
  await writeFile(join(machine.home, ".arc/config.yml"), JSON.stringify({ "checks.runner": [process.execPath, adapter] }));
  const definition = (status: number) => ({ checks: { example: { runner: true, mode: "files", inputs: ["long/**"],
    pass_paths: false, command: [process.execPath, "-e", `process.exit(${status})`, "--"],
    shards: { count: 3, argument: "--shard={index}/{count}", routed: true },
    ...(noEvidenceExit === undefined ? {} : { no_evidence_exit: noEvidenceExit }),
  } } });
  const root = await createDeclaredCheckRepository(definition(code).checks);
  directories.push(root);
  await mkdir(join(root, "long"));
  const paths = ["long/a.txt", "long/b.txt"];
  await Promise.all(paths.map(path => writeFile(join(root, path), "captured\n")));
  return { machine, adapter, root, definition };
}

it.each([7, 256, 0x80000000, 0xc0000005, 0xffffffff])("retains the platform's native failure for status %d beside incomplete work", async code => {
  const { machine, adapter, root, definition } = await platformCheck(code);
  const native = process.platform === "win32" ? code : code % 256;
  const complete = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  expect(complete.exitCode, complete.stdout + complete.stderr).toBe(native === 0 ? 0 : 1);
  const completed = JSON.parse(complete.stdout).result.checks[0];
  expect(completed.outcome).toBe(native === 0 ? "passed" : "failed");
  expect(completed.invocations).toEqual([1, 2, 3].map(index => expect.objectContaining({
    batch: 1, shard: { index, count: 3 }, outcome: { kind: native === 0 ? "success" : "failure", exitCode: native },
  })));
  await rm(join(machine.home, "closed"));
  await writeFile(adapter, preparedAdapterScript("group-loss", undefined, machine.home));
  const result = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  await registerRunnerFixtureSources(directories, join(machine.home, "source"));
  expect(result.exitCode, result.stdout + result.stderr).toBe(native === 0 ? 2 : 1);
  const check = JSON.parse(result.stdout).result.checks[0];
  expect(check).toMatchObject({ outcome: native === 0 ? "couldn't run" : "failed", reason: expect.stringMatching(/closed|settle|protocol/iu) });
  expect(check).not.toHaveProperty("record");
  expect(check.invocations).toHaveLength(3);
  expect(check.invocations[0]).toMatchObject({ batch: 1, shard: { index: 1, count: 3 },
    outcome: { kind: native === 0 ? "success" : "failure", exitCode: native } });
  expect(check.invocations.slice(1).map((detail: { outcome: { kind: string } }) => detail.outcome.kind))
    .toEqual(["unavailable", "unavailable"]);
  await expect(access(join(machine.home, "closed"))).resolves.toBeUndefined();
  await writeFile(adapter, preparedAdapterScript("execute", undefined, machine.home));
  await writeFile(join(root, ".arc/system/arc-checks.yml"), JSON.stringify(definition(0)));
  const repaired = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  expect(repaired.exitCode, repaired.stdout + repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).result.checks[0]).toMatchObject({ outcome: "passed" });
  expect(JSON.parse(repaired.stdout).result.checks[0].invocations).toHaveLength(3);
}, 45_000);

it.each([undefined, 137])("retains native status 137 interpretation with declared no-evidence %s", async noEvidenceExit => {
  const { machine, root } = await platformCheck(137, noEvidenceExit);
  const result = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  expect(result.exitCode, result.stdout + result.stderr).toBe(noEvidenceExit === undefined ? 2 : 1);
  const check = JSON.parse(result.stdout).result.checks[0];
  expect(check.outcome).toBe(noEvidenceExit === undefined ? "couldn't run" : "no evidence");
  expect(check.invocations).toHaveLength(3);
  for (const detail of check.invocations) expect(detail.outcome).toMatchObject({ exitCode: 137,
    kind: noEvidenceExit === undefined ? "unavailable" : "no-evidence" });
  await expect(access(join(machine.home, "closed"))).resolves.toBeUndefined();
}, 30_000);
