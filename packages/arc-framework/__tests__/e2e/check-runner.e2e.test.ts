/** Real selected checks qualify their configured executor before reusing a pass. */
import { afterEach, expect, it } from "vitest";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { createRunnerMachineHome } from "../fixtures/checks/runner-machine.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const directories: string[] = [];
const example = fileURLToPath(new URL("../../examples/check-runner/local.mjs", import.meta.url));
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.runIf(process.platform === "linux")("prepares captured execution before a hit and runs only cache misses", async () => {
  const machine = await createRunnerMachineHome(directories, [process.execPath, example, "--known-node-runtime"]);
  const executions = join(machine.home, "executions");
  const probes = join(machine.home, "probes");
  const probe = "require('node:fs').appendFileSync(process.env.PROBES, process.cwd()+'\\n');process.stdout.write('qualified\\r\\n')";
  const root = await createDeclaredCheckRepository({ example: { runner: true, mode: "files", inputs: ["src/**"],
    command: [process.execPath, "capture.cjs"], runtime_inputs: [[process.execPath, "-e", probe]],
    environment_inputs: { EXECUTIONS: "value", PROBES: "value" } } }, { global_inputs: ["capture.cjs"] });
  directories.push(root);
  await writeFile(join(root, "capture.cjs"), `const fs=require('node:fs');
fs.appendFileSync(process.env.EXECUTIONS, 'run\\n');
process.stdout.write(JSON.stringify({cwd:process.cwd(),value:fs.readFileSync('src/a.ts','utf8'),args:process.argv.slice(2)}));`);
  const run = async () => {
    const result = await runArc(["check", "run", "example", "--json"], root,
      { env: { ...machine.environment, EXECUTIONS: executions, PROBES: probes }, timeout: 30_000 });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    return JSON.parse(result.stdout).result.checks[0] as { outcome: string; output: string };
  };
  const first = await run();
  expect(first.outcome).toBe("passed");
  expect(JSON.parse(first.output)).toMatchObject({ value: "changed\n", args: ["src/a.ts", "src/deleted.ts"] });
  expect(JSON.parse(first.output).cwd).not.toBe(root);
  expect(await run()).toEqual(expect.objectContaining({ outcome: "reused", output: first.output }));
  await writeFile(join(root, "src/a.ts"), "second miss\n");
  expect(await run()).toMatchObject({ outcome: "passed" });
  expect(await readFile(executions, "utf8")).toBe("run\nrun\n");
  const preparedRoots = (await readFile(probes, "utf8")).trim().split("\n");
  expect(new Set(preparedRoots).size).toBe(3);
  expect(preparedRoots.every(cwd => cwd !== root)).toBe(true);
}, 60_000);

it.each(["no machine runner", "no project opt-in"])("retains native cwd with %s", async condition => {
  const machine = await createRunnerMachineHome(directories, [join("/", "missing-adapter")]);
  if (condition === "no machine runner") await rm(join(machine.home, ".arc/config.yml"));
  const root = await createDeclaredCheckRepository({ example: { runner: condition === "no machine runner", cache: false,
    inputs: ["src/**"], command: [process.execPath, "capture.cjs"] } });
  directories.push(root);
  const result = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  expect(result.exitCode, result.stdout + result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks[0]).toMatchObject({ outcome: "passed" });
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8"))).toMatchObject({ cwd: root, args: [] });
});

it.runIf(process.platform === "linux")("runs unknown runtime live on every request without recording a pass", async () => {
  const machine = await createRunnerMachineHome(directories, [process.execPath, example]);
  const root = await createDeclaredCheckRepository({ example: { runner: true, inputs: ["src/**"],
    command: [process.execPath, "-e", "process.stdout.write(process.cwd())"] } });
  directories.push(root);
  const outputs: string[] = [];
  for (let index = 0; index < 2; index++) {
    const result = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    const check = JSON.parse(result.stdout).result.checks[0] as { outcome: string; output: string; record: unknown };
    expect(check).toMatchObject({ outcome: "passed", record: { status: "not-recordable" } });
    expect(check.output).not.toBe(root);
    outputs.push(check.output);
  }
  expect(new Set(outputs).size).toBe(2);
});

it.runIf(process.platform === "linux")("executes every fixed portable batch once without expanding declared shards", async () => {
  const machine = await createRunnerMachineHome(directories, [process.execPath, example]);
  const receipt = join(machine.home, "batches");
  const root = await createDeclaredCheckRepository({ example: { runner: true, mode: "files", inputs: ["long/**"],
    command: [process.execPath, "capture.cjs"], environment_inputs: { RECEIPT: "value" },
    shards: { count: 3, argument: "--part={index}" } } });
  directories.push(root);
  await mkdir(join(root, "long"));
  const paths = Array.from({ length: 80 }, (_, index) => `long/item-${String(index).padStart(3, "0")}-${"x".repeat(140)}.ts`);
  await Promise.all(paths.map(path => writeFile(join(root, path), "content\n")));
  await writeFile(join(root, "capture.cjs"), `const fs=require('node:fs');
fs.appendFileSync(process.env.RECEIPT, JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)})+'\\n');
process.stdout.write('batch\\n');`);
  const result = await runArc(["check", "run", "example", "--json"], root,
    { env: { ...machine.environment, RECEIPT: receipt }, timeout: 30_000 });
  expect(result.exitCode, result.stdout + result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).result.checks[0]).toMatchObject({ outcome: "passed" });
  const batches = (await readFile(receipt, "utf8")).trim().split("\n").map(line => JSON.parse(line) as { cwd: string; args: string[] });
  expect(batches.length).toBeGreaterThan(1);
  expect(batches.flatMap(batch => batch.args)).toEqual(paths);
  expect(new Set(batches.map(batch => batch.cwd)).size).toBe(1);
  expect(batches[0]?.cwd).not.toBe(root);
}, 30_000);
