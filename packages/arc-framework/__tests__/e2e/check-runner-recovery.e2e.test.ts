/** CLI recovery diagnostics retain caller-known ownership before and after a ready context. */
import { afterEach, expect, it } from "vitest";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { preparedAdapterScript } from "../fixtures/checks/prepared-execution.js";
import { createRunnerMachineHome, registerRunnerFixtureSources } from "../fixtures/checks/runner-machine.js";
import { runArc } from "./helpers.js";
import { removeGitBackedDir, removeGitBackedDirs } from "../helpers/temp-repo.js";

const directories: string[] = [];
const example = fileURLToPath(new URL("../../examples/check-runner/local.mjs", import.meta.url));
const execFileAsync = promisify(execFile);
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it("reports pre-context recovery after disconnect and permits an explicit fresh retry", async () => {
  const machine = await createRunnerMachineHome(directories, [process.execPath]);
  const adapter = join(machine.home, "adapter.cjs");
  const receipt = join(machine.home, "executed");
  await writeFile(adapter, preparedAdapterScript("disappeared", undefined, machine.home));
  await writeFile(join(machine.home, ".arc/config.yml"), JSON.stringify({ "checks.runner": [process.execPath, adapter] }));
  const root = await createDeclaredCheckRepository({ example: { runner: true, command: [process.execPath, "-e",
    `require('node:fs').appendFileSync(${JSON.stringify(receipt)},'run\\n')`] } });
  directories.push(root);
  const result = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  await registerRunnerFixtureSources(directories, join(machine.home, "source"));
  const preparation = JSON.parse(await readFile(join(machine.home, "preparing"), "utf8")) as {
    planId: string; source: { root: string; manifest: string };
  };
  expect(result.exitCode, result.stdout + result.stderr).toBe(2);
  const check = JSON.parse(result.stdout).result.checks[0];
  expect(check).toMatchObject({ outcome: "couldn't run" });
  expect(check.remedy).toContain(preparation.planId);
  expect(check.remedy).toContain(process.execPath);
  expect(check.remedy).toContain(preparation.source.root);
  expect(check.remedy).toContain(preparation.source.manifest);
  expect(check.remedy).toContain("Inspect and settle this test attempt by its plan UUID.");
  expect(check.remedy).not.toContain("context ");
  expect(check.remedy).toContain("retry with a fresh attempt");
  await expect(access(preparation.source.root)).resolves.toBeUndefined();
  await expect(access(preparation.source.manifest)).resolves.toBeUndefined();
  await expect(access(receipt)).rejects.toMatchObject({ code: "ENOENT" });
  await writeFile(adapter, preparedAdapterScript("execute", undefined, machine.home));
  const repaired = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  expect(repaired.exitCode, repaired.stdout + repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).result.checks[0]).toMatchObject({ outcome: "passed" });
  expect(await readFile(receipt, "utf8")).toBe("run\n");
  const fresh = JSON.parse(await readFile(join(machine.home, "preparing"), "utf8")) as { planId: string; source: { root: string } };
  expect(fresh.planId).not.toBe(preparation.planId);
  expect(fresh.source.root).not.toBe(preparation.source.root);
  await expect(access(fresh.source.root)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(access(preparation.source.root)).resolves.toBeUndefined();
}, 30_000);

it("keeps settled cleanup warnings advisory on live success and cache hits", async () => {
  const machine = await createRunnerMachineHome(directories, [process.execPath]);
  const adapter = join(machine.home, "adapter.cjs");
  const artifact = join(machine.home, "settled-resource");
  const receipt = join(machine.home, "executed");
  await writeFile(adapter, preparedAdapterScript("cleanup-warning", undefined, machine.home));
  await writeFile(join(machine.home, ".arc/config.yml"), JSON.stringify({ "checks.runner": [process.execPath, adapter] }));
  const root = await createDeclaredCheckRepository({ example: { runner: true, inputs: ["src/**"], command: [process.execPath, "-e",
    `require('node:fs').appendFileSync(${JSON.stringify(receipt)},'run\\n')`] } });
  directories.push(root);
  for (const outcome of ["passed", "reused"]) {
    const result = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).result.checks[0]).toMatchObject({ outcome,
      notice: expect.stringContaining(artifact), ...(outcome === "passed" ? { record: { status: "recorded" } } : {}) });
    expect(await readFile(artifact, "utf8")).toBe("settled provider resource");
    const preparation = JSON.parse(await readFile(join(machine.home, "preparing"), "utf8")) as { source: { root: string } };
    await expect(access(preparation.source.root)).rejects.toMatchObject({ code: "ENOENT" });
  }
  const text = await runArc(["check", "run", "example"], root, { env: machine.environment });
  expect(text.exitCode, text.stdout + text.stderr).toBe(0);
  expect(text.stdout).toContain("example: reused");
  expect(text.stdout).toContain(artifact);
  expect(await readFile(receipt, "utf8")).toBe("run\n");
  await rm(artifact);
  await writeFile(adapter, preparedAdapterScript("known", undefined, machine.home));
  const repaired = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  expect(repaired.exitCode, repaired.stdout + repaired.stderr).toBe(0);
  const check = JSON.parse(repaired.stdout).result.checks[0];
  expect(check).toMatchObject({ outcome: "reused" });
  expect(check.notice).toBeUndefined();
  await expect(access(artifact)).rejects.toMatchObject({ code: "ENOENT" });
}, 30_000);

it.runIf(process.platform === "linux")("preserves native failure with recovery and settles retained descendants before a fresh retry", async () => {
  const frontend = fileURLToPath(new URL("../fixtures/checks/runner-disconnect.mjs", import.meta.url));
  const machine = await createRunnerMachineHome(directories, [process.execPath]);
  const state = join(machine.home, "provider-state");
  const childMarker = join(machine.home, "child");
  const gate = join(machine.home, "settle");
  const receipt = join(machine.home, "executed");
  await writeFile(join(machine.home, ".arc/config.yml"), JSON.stringify({ "checks.runner": [process.execPath, frontend, example, state, machine.home] }));
  const child = `const fs=require('node:fs');process.on('SIGTERM',()=>{});
fs.writeFileSync(${JSON.stringify(childMarker)},String(process.pid));
setInterval(()=>{if(fs.existsSync(${JSON.stringify(gate)}))process.exit(0);},10);`;
  const root = await createDeclaredCheckRepository({ example: { runner: true, inputs: ["src/**"], command: [process.execPath, "capture.cjs"] } },
    { global_inputs: ["capture.cjs"] });
  directories.push(root);
  await writeFile(join(root, "capture.cjs"), `const fs=require('node:fs');
fs.appendFileSync(${JSON.stringify(receipt)},'run\\n');
require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{stdio:'ignore'}).unref();
setInterval(()=>{if(fs.existsSync(${JSON.stringify(childMarker)})){process.stdout.write('native failure');process.exit(7);}},10);`);
  const result = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  const attempt = JSON.parse(await readFile(join(machine.home, "attempt"), "utf8")) as {
    planId: string; contextId: string; source: { root: string; manifest: string };
  };
  const settle = () => expect.poll(async () => JSON.parse((await execFileAsync(process.execPath,
    [example, "--settle", attempt.planId, "--state-root", state], { timeout: 5000 })).stdout), { timeout: 5000 })
    .toMatchObject({ planId: attempt.planId, status: "settled" });
  try {
    expect(result.exitCode, result.stdout + result.stderr).toBe(1);
    const check = JSON.parse(result.stdout).result.checks[0];
    expect(check).toMatchObject({ outcome: "failed", output: "native failure" });
    expect(check.reason).toMatch(/closed|settle|protocol/iu);
    expect(check.remedy).toContain(attempt.planId);
    expect(check.remedy).toContain(attempt.contextId);
    expect(check.remedy).toContain(attempt.source.root);
    expect(check.remedy).toContain("--settle");
    await expect(access(attempt.source.root)).resolves.toBeUndefined();
    expect(await readFile(receipt, "utf8")).toBe("run\n");
    await settle();
    const inspected = await execFileAsync(process.execPath, [example, "--inspect", attempt.planId, "--state-root", state]);
    expect(JSON.parse(inspected.stdout)).toMatchObject({ status: "settled", workers: expect.arrayContaining([expect.objectContaining({ members: [] })]) });
    await registerRunnerFixtureSources(directories, join(machine.home, "source"));
    await removeGitBackedDir(dirname(attempt.source.manifest));
    await expect(access(attempt.source.root)).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(join(root, "capture.cjs"), `require('node:fs').appendFileSync(${JSON.stringify(receipt)},'run\\n');process.stdout.write('repaired');`);
    await writeFile(join(machine.home, ".arc/config.yml"), JSON.stringify({ "checks.runner": [process.execPath, example, "--known-node-runtime", "--state-root", state] }));
    const repaired = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
    expect(repaired.exitCode, repaired.stdout + repaired.stderr).toBe(0);
    expect(JSON.parse(repaired.stdout).result.checks[0]).toMatchObject({ outcome: "passed", output: "repaired", record: { status: "recorded" } });
    expect(await readFile(receipt, "utf8")).toBe("run\nrun\n");
  } finally {
    await writeFile(gate, "settle");
    await settle();
    await registerRunnerFixtureSources(directories, join(machine.home, "source"));
  }
}, 30_000);

it.runIf(process.platform === "linux")("reports retained context recovery when cache-hit release closes abnormally", async () => {
  const proxy = fileURLToPath(new URL("../fixtures/checks/runner-proxy.mjs", import.meta.url));
  const machine = await createRunnerMachineHome(directories, [process.execPath, example, "--known-node-runtime"]);
  const receipt = join(machine.home, "executed");
  const captures = join(machine.home, "captures");
  const root = await createDeclaredCheckRepository({ example: { runner: true, inputs: ["src/**"], command: [process.execPath, "-e",
    `require('node:fs').appendFileSync(${JSON.stringify(receipt)},'run\\n')`] } });
  directories.push(root);
  const first = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  expect(first.exitCode, first.stdout + first.stderr).toBe(0);
  expect(JSON.parse(first.stdout).result.checks[0]).toMatchObject({ outcome: "passed", record: { status: "recorded" } });
  await writeFile(join(machine.home, ".arc/config.yml"), JSON.stringify({ "checks.runner": [process.execPath, proxy, example, "bad-close", captures] }));
  const result = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  await registerRunnerFixtureSources(directories, captures);
  const source = JSON.parse((await readFile(captures, "utf8")).trim()) as { root: string; manifest: string };
  expect(result.exitCode, result.stdout + result.stderr).toBe(2);
  const check = JSON.parse(result.stdout).result.checks[0];
  expect(check).toMatchObject({ outcome: "couldn't run" });
  expect(check.remedy).toMatch(/Inspect and settle plan [a-f0-9-]{36}, context /u);
  expect(check.remedy).toContain(source.root);
  expect(check.remedy).toContain(source.manifest);
  expect(check.remedy).toContain("--inspect");
  expect(check.remedy).toContain("--settle");
  await expect(access(source.root)).resolves.toBeUndefined();
  expect(await readFile(receipt, "utf8")).toBe("run\n");
  await writeFile(join(machine.home, ".arc/config.yml"), JSON.stringify({ "checks.runner": [process.execPath, example, "--known-node-runtime"] }));
  const repaired = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  expect(repaired.exitCode, repaired.stdout + repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).result.checks[0]).toMatchObject({ outcome: "reused" });
  expect(await readFile(receipt, "utf8")).toBe("run\n");
}, 30_000);
