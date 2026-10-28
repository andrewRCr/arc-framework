/** Actual CLI signals retain prepared resources until acknowledged work also settles. */
import { afterEach, expect, it } from "vitest";
import { access, appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { preparedAdapterScript } from "../fixtures/checks/prepared-execution.js";
import { createRunnerMachineHome, registerRunnerFixtureSources } from "../fixtures/checks/runner-machine.js";
import { startRunnerCli, waitForRunnerObservation } from "../fixtures/checks/runner-cli.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.runIf(process.platform !== "win32")("cancels preparation by plan UUID on a terminal interrupt and retains inputs until settlement", async () => {
  const machine = await createRunnerMachineHome(directories, [process.execPath]);
  const gate = join(machine.home, "settle");
  const adapter = join(machine.home, "adapter.cjs");
  await writeFile(adapter, preparedAdapterScript("wait-prepare", gate, machine.home));
  await writeFile(join(machine.home, ".arc/config.yml"), JSON.stringify({ "checks.runner": [process.execPath, adapter] }));
  const root = await createDeclaredCheckRepository({ example: { runner: true, command: [process.execPath, "-e", "process.exit(0)"] } });
  directories.push(root);
  const cli = startRunnerCli(root, machine.environment);
  try {
    const preparation = JSON.parse(await waitForRunnerObservation(join(machine.home, "preparing"), cli)) as {
      planId: string; source: { root: string; manifest: string };
    };
    cli.interrupt("SIGINT");
    const cancellation = JSON.parse(await waitForRunnerObservation(join(machine.home, "cancel"), cli)) as { planId: string; contextId?: string };
    expect(cancellation.planId).toBe(preparation.planId);
    expect(cancellation).not.toHaveProperty("contextId");
    expect(cli.closed).toBe(false);
    await expect(access(preparation.source.root)).resolves.toBeUndefined();
    await expect(access(preparation.source.manifest)).resolves.toBeUndefined();
    await writeFile(gate, "settle");
    const result = await cli.completed;
    expect(result.exitCode, result.stdout + result.stderr).toBe(2);
    expect(JSON.parse(result.stdout).result.checks[0]).toMatchObject({ outcome: "couldn't run" });
    await expect(access(preparation.source.root)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await writeFile(gate, "settle");
    if (!cli.closed) cli.child.kill("SIGKILL");
    await cli.completed;
    await waitForRunnerObservation(join(machine.home, "closed"));
    await registerRunnerFixtureSources(directories, join(machine.home, "source"));
  }
}, 30_000);

it.runIf(process.platform !== "win32")("cancels a ready context and drains its resistant child before releasing captured inputs", async () => {
  const machine = await createRunnerMachineHome(directories, [process.execPath]);
  const gate = join(machine.home, "settle");
  const started = join(machine.home, "child-started");
  const stopped = join(machine.home, "child-cancelled");
  const adapter = join(machine.home, "adapter.cjs");
  await writeFile(adapter, preparedAdapterScript("cancel-run", gate, machine.home));
  await writeFile(join(machine.home, ".arc/config.yml"), JSON.stringify({ "checks.runner": [process.execPath, adapter] }));
  const program = `const fs=require('node:fs');
process.on('SIGTERM',()=>fs.writeFileSync(${JSON.stringify(stopped)},'cancelled'));
fs.writeFileSync(${JSON.stringify(started)},'started');
setInterval(()=>{if(fs.existsSync(${JSON.stringify(gate)})){process.stdout.write('drained output');process.exit(0);}},10);`;
  const root = await createDeclaredCheckRepository({ example: { runner: true, command: [process.execPath, "-e", program] } });
  directories.push(root);
  const cli = startRunnerCli(root, machine.environment);
  try {
    await waitForRunnerObservation(started, cli);
    const preparation = JSON.parse(await readFile(join(machine.home, "preparing"), "utf8")) as {
      planId: string; source: { root: string; manifest: string };
    };
    cli.child.kill("SIGTERM");
    const cancellation = JSON.parse(await waitForRunnerObservation(join(machine.home, "cancel"), cli)) as { planId: string; contextId?: string };
    expect(cancellation).toEqual({ planId: preparation.planId, contextId: "prepared-context" });
    await waitForRunnerObservation(stopped, cli);
    expect(cli.closed).toBe(false);
    await expect(access(preparation.source.root)).resolves.toBeUndefined();
    await expect(access(preparation.source.manifest)).resolves.toBeUndefined();
    await writeFile(gate, "settle");
    const result = await cli.completed;
    expect(result.exitCode, result.stdout + result.stderr).toBe(2);
    expect(JSON.parse(result.stdout).result.checks[0]).toMatchObject({ outcome: "couldn't run", output: expect.stringContaining("drained output") });
    await expect(access(preparation.source.root)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await writeFile(gate, "settle");
    if (!cli.closed) cli.child.kill("SIGKILL");
    await cli.completed;
    await waitForRunnerObservation(join(machine.home, "closed"));
    await registerRunnerFixtureSources(directories, join(machine.home, "source"));
  }
}, 30_000);

it.runIf(process.platform !== "win32")("terminates only the local adapter on a second interrupt and reports retained preparation", async () => {
  const machine = await createRunnerMachineHome(directories, [process.execPath]);
  const gate = join(machine.home, "settle");
  const adapter = join(machine.home, "adapter.cjs");
  await writeFile(adapter, preparedAdapterScript("wait-prepare", gate, machine.home));
  await writeFile(join(machine.home, ".arc/config.yml"), JSON.stringify({ "checks.runner": [process.execPath, adapter] }));
  const root = await createDeclaredCheckRepository({ example: { runner: true, command: [process.execPath, "-e", "process.exit(0)"] } });
  directories.push(root);
  const cli = startRunnerCli(root, machine.environment);
  try {
    const preparation = JSON.parse(await waitForRunnerObservation(join(machine.home, "preparing"), cli)) as {
      planId: string; source: { root: string; manifest: string };
    };
    cli.interrupt("SIGINT");
    await waitForRunnerObservation(join(machine.home, "cancel"), cli);
    expect(cli.closed).toBe(false);
    cli.interrupt("SIGINT");
    await waitForRunnerObservation(join(machine.home, "closed"), cli);
    const result = await cli.completed;
    expect(result.exitCode, result.stdout + result.stderr).toBe(2);
    const check = JSON.parse(result.stdout).result.checks[0];
    expect(check).toMatchObject({ outcome: "couldn't run" });
    expect(check.remedy).toContain(preparation.planId);
    expect(check.remedy).toContain(preparation.source.root);
    expect(check.remedy).toContain(preparation.source.manifest);
    expect(check.remedy).toContain("Inspect and settle this test attempt by its plan UUID.");
    await expect(access(preparation.source.root)).resolves.toBeUndefined();
    await expect(access(preparation.source.manifest)).resolves.toBeUndefined();
  } finally {
    await writeFile(gate, "settle");
    if (!cli.closed) cli.child.kill("SIGKILL");
    await cli.completed;
    await waitForRunnerObservation(join(machine.home, "closed"));
    await registerRunnerFixtureSources(directories, join(machine.home, "source"));
  }
}, 30_000);

it.runIf(process.platform !== "win32")("exits on a third interrupt while an adapter resists termination, naming its retained plan", async () => {
  const machine = await createRunnerMachineHome(directories, [process.execPath]);
  const adapter = join(machine.home, "adapter.cjs");
  const observe = (name: string) => JSON.stringify(join(machine.home, name));
  await writeFile(adapter, `const fs=require('node:fs');
process.on('SIGTERM',()=>fs.writeFileSync(${observe("terminated")},'ignored'));
require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
  const request=JSON.parse(line);
  if(request.method==='check/prepare'){
    fs.appendFileSync(${observe("source")},JSON.stringify(request.params.source)+'\\n');
    fs.writeFileSync(${observe("preparing")},JSON.stringify({planId:request.params.planId,pid:process.pid}));
  }
  if(request.method==='check/cancel')fs.writeFileSync(${observe("cancel")},JSON.stringify(request.params));
});
setInterval(()=>undefined,1000);`);
  await writeFile(join(machine.home, ".arc/config.yml"), JSON.stringify({ "checks.runner": [process.execPath, adapter] }));
  const root = await createDeclaredCheckRepository({ example: { runner: true, command: [process.execPath, "-e", "process.exit(0)"] } });
  directories.push(root);
  const cli = startRunnerCli(root, machine.environment);
  let pid: number | undefined;
  try {
    const preparation = JSON.parse(await waitForRunnerObservation(join(machine.home, "preparing"), cli)) as { planId: string; pid: number };
    pid = preparation.pid;
    cli.interrupt("SIGINT");
    await waitForRunnerObservation(join(machine.home, "cancel"), cli);
    cli.interrupt("SIGINT");
    await waitForRunnerObservation(join(machine.home, "terminated"), cli);
    expect(cli.closed).toBe(false);
    cli.interrupt("SIGINT");
    const result = await cli.completed;
    expect(result.signal, result.stdout + result.stderr).toBe("SIGINT");
    expect(result.stderr).toContain(`Exiting without settlement; inspect and settle retained plans before retrying: ${preparation.planId}.`);
  } finally {
    if (!cli.closed) cli.child.kill("SIGKILL");
    await cli.completed;
    if (pid !== undefined) try { process.kill(pid, "SIGKILL"); } catch { /* Already exited. */ }
    await appendFile(join(machine.home, "source"), "");
    await registerRunnerFixtureSources(directories, join(machine.home, "source"));
  }
}, 30_000);
