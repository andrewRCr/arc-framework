/** Real selected checks qualify their configured executor before reusing a pass. */
import { afterEach, expect, it } from "vitest";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { createRunnerMachineHome, registerRunnerFixtureSources } from "../fixtures/checks/runner-machine.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const directories: string[] = [];
const example = fileURLToPath(new URL("../../examples/check-runner/local.mjs", import.meta.url));
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it.runIf(process.platform === "linux").each(["bad-close", "wrong-source", "missing-output", "conflicting-context"])(
  "withholds publication after %s and permits qualified retry", async fault => {
  const proxy = fileURLToPath(new URL("../fixtures/checks/runner-proxy.mjs", import.meta.url));
  const machine = await createRunnerMachineHome(directories, [process.execPath, proxy]);
  const receipt = join(machine.home, "captures");
  const configuration = join(machine.home, ".arc/config.yml");
  await writeFile(configuration, JSON.stringify({ "checks.runner": [process.execPath, proxy, example, fault, receipt] }));
  const root = await createDeclaredCheckRepository({ example: { runner: true, inputs: ["src/**"],
    command: [process.execPath, "-e", "process.stdout.write('proof')"] } });
  directories.push(root);
  const result = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  // The proxy waits for the actual provider and its launched children to close before reporting its injected failure.
  await registerRunnerFixtureSources(directories, receipt);
  expect(result.exitCode, result.stdout + result.stderr).toBe(2);
  const check = JSON.parse(result.stdout).result.checks[0] as { outcome: string };
  expect(check).toMatchObject({ outcome: "couldn't run" });
  if (fault !== "wrong-source") expect(check).toMatchObject({ output: "proof" });
  expect(check).not.toHaveProperty("record");
  await writeFile(configuration, JSON.stringify({ "checks.runner": [process.execPath, example, "--known-node-runtime"] }));
  const repaired = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  expect(repaired.exitCode, repaired.stdout + repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).result.checks[0]).toMatchObject({ outcome: "passed", record: { status: "recorded" } });
  const reused = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  expect(JSON.parse(reused.stdout).result.checks[0]).toMatchObject({ outcome: "reused" });
}, 30_000);

it.runIf(process.platform === "linux")("keeps caller install-gap interpretation on native execution only", async () => {
  const machine = await createRunnerMachineHome(directories, [process.execPath, example]);
  const configuration = join(machine.home, ".arc/config.yml");
  const configured = await readFile(configuration, "utf8");
  await rm(configuration);
  const name = `missing-check-${basename(machine.home).toLowerCase()}`;
  const program = `try{require(${JSON.stringify(name)})}catch(error){console.error(error.message.split('\\n')[0]);process.exit(2)}`;
  const root = await createDeclaredCheckRepository({ example: { runner: true, inputs: ["src/**"], command: [process.execPath, "-e", program] } });
  directories.push(root);
  await writeFile(join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3,
    packages: { "": {}, [`node_modules/${name}`]: { version: "1.0.0" } } }));
  const native = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  expect(native.exitCode, native.stdout + native.stderr).toBe(2);
  expect(JSON.parse(native.stdout).result.checks[0]).toMatchObject({ outcome: "couldn't run", reason: expect.stringContaining("npm ci") });
  await writeFile(configuration, configured);
  const routed = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  expect(routed.exitCode, routed.stdout + routed.stderr).toBe(1);
  const check = JSON.parse(routed.stdout).result.checks[0] as { reason?: string };
  expect(check).toMatchObject({ outcome: "failed", output: expect.stringContaining(name) });
  expect(check.reason ?? "").not.toContain("npm ci");
  expect(check).not.toHaveProperty("record");
}, 30_000);

it.runIf(process.platform === "linux")("keeps valid routed success when disposable reports and pass storage are unavailable", async () => {
  const machine = await createRunnerMachineHome(directories, [process.execPath, example, "--known-node-runtime"]);
  const root = await createDeclaredCheckRepository({ example: { runner: true, inputs: ["src/**"],
    command: [process.execPath, "-e", "process.stdout.write('proof')"] } });
  directories.push(root);
  const storage = join(root, ".git/arc-checks");
  await writeFile(storage, "not a directory");
  const result = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  expect(result.exitCode, result.stdout + result.stderr).toBe(0);
  const check = JSON.parse(result.stdout).result.checks[0] as { outcome: string; logPath?: string };
  expect(check).toMatchObject({ outcome: "passed", output: "proof", record: { status: "unavailable" } });
  expect(check.logPath).toBeUndefined();
  const text = await runArc(["check", "run", "example"], root, { env: machine.environment });
  expect(text.exitCode, text.stdout + text.stderr).toBe(0);
  expect(text.stdout).toContain("could not record passes");
  await rm(storage);
  const repaired = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  expect(repaired.exitCode, repaired.stdout + repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).result.checks[0]).toMatchObject({ outcome: "passed", record: { status: "recorded" } });
  const reused = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  expect(JSON.parse(reused.stdout).result.checks[0]).toMatchObject({ outcome: "reused" });
}, 30_000);

it.runIf(process.platform === "linux")("retains a completed native failure and incomplete detail after transport loss", async () => {
  const proxy = fileURLToPath(new URL("../fixtures/checks/runner-proxy.mjs", import.meta.url));
  const machine = await createRunnerMachineHome(directories, [process.execPath, proxy]);
  const receipt = join(machine.home, "captures");
  const configuration = join(machine.home, ".arc/config.yml");
  await writeFile(configuration, JSON.stringify({ "checks.runner": [process.execPath, proxy, example, "failure-loss", receipt] }));
  const root = await createDeclaredCheckRepository({ example: { runner: true, inputs: ["src/**"],
    command: [process.execPath, "capture.cjs"] } }, { global_inputs: ["capture.cjs"] });
  directories.push(root);
  await writeFile(join(root, "capture.cjs"), "process.stdout.write('native failure');process.exit(7)");
  for (const json of [true, false]) {
    const result = await runArc(["check", "run", "example", ...(json ? ["--json"] : [])], root, { env: machine.environment });
    await registerRunnerFixtureSources(directories, receipt);
    expect(result.exitCode, result.stdout + result.stderr).toBe(1);
    if (json) {
      const check = JSON.parse(result.stdout).result.checks[0] as { outcome: string; reason?: string };
      expect(check).toMatchObject({ outcome: "failed", output: "native failure" });
      expect(check.reason).toMatch(/protocol|JSON|settle|closed/iu);
      expect(check).not.toHaveProperty("record");
    } else expect(result.stdout).toMatch(/example: failed.*(?:protocol|JSON|settle|closed)/isu);
  }
  await writeFile(configuration, JSON.stringify({ "checks.runner": [process.execPath, example, "--known-node-runtime"] }));
  await writeFile(join(root, "capture.cjs"), "process.stdout.write('repaired')");
  const repaired = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  expect(repaired.exitCode, repaired.stdout + repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).result.checks[0]).toMatchObject({ outcome: "passed", output: "repaired", record: { status: "recorded" } });
}, 30_000);

it.runIf(process.platform === "linux")("keeps routed not-run evidence ahead of declared no-evidence status and recovers", async () => {
  const machine = await createRunnerMachineHome(directories, [process.execPath, example]);
  const program = "if(process.env.REPAIRED==='yes'){process.stdout.write('repaired')}else{require('node:fs').writeFileSync(process.env.ARC_CHECK_NOTICE,'not run: executor unavailable\\n');process.exit(5)}";
  const root = await createDeclaredCheckRepository({ example: { runner: true, inputs: ["src/**"], no_evidence_exit: 5,
    command: [process.execPath, "-e", program], environment_inputs: { REPAIRED: "value" } } });
  directories.push(root);
  const unavailable = await runArc(["check", "run", "example", "--json"], root,
    { env: { ...machine.environment, REPAIRED: undefined } });
  expect(unavailable.exitCode, unavailable.stdout + unavailable.stderr).toBe(2);
  const check = JSON.parse(unavailable.stdout).result.checks[0] as { outcome: string };
  expect(check).toMatchObject({ outcome: "couldn't run", reason: expect.stringContaining("executor unavailable"),
    notice: "not run: executor unavailable" });
  expect(check).not.toHaveProperty("record");
  const repaired = await runArc(["check", "run", "example", "--json"], root,
    { env: { ...machine.environment, REPAIRED: "yes" } });
  expect(repaired.exitCode, repaired.stdout + repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).result.checks[0]).toMatchObject({ outcome: "passed", output: "repaired" });
});

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
    shards: { count: 2, argument: "--shard={index}/{count}", routed: true },
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

it.runIf(process.platform === "linux")("reports a protocol refusal without replacement execution and permits repaired retry", async () => {
  const fault = fileURLToPath(new URL("../fixtures/checks/runner-bad-protocol.mjs", import.meta.url));
  const machine = await createRunnerMachineHome(directories, [process.execPath, fault]);
  const retained = join(machine.home, "retained-inputs");
  const executed = join(machine.home, "executed");
  const configuration = join(machine.home, ".arc/config.yml");
  await writeFile(configuration, JSON.stringify({ "checks.runner": [process.execPath, fault, retained] }));
  const command = `require('node:fs').appendFileSync(${JSON.stringify(executed)},'run\\n');process.stdout.write('repaired')`;
  const root = await createDeclaredCheckRepository({ example: { runner: true, inputs: ["src/**"], command: [process.execPath, "-e", command] } });
  directories.push(root);
  for (const json of [true, false]) {
    const result = await runArc(["check", "run", "example", ...(json ? ["--json"] : [])], root, { env: machine.environment });
    // The fixture's closed process launches no children; its recorded captures can now be removed by test cleanup.
    await registerRunnerFixtureSources(directories, retained);
    expect(result.exitCode, result.stdout + result.stderr).toBe(2);
    if (json) {
      const check = JSON.parse(result.stdout).result.checks[0] as { reason: string; remedy: string };
      expect(check.reason).toContain(configuration);
      expect(check.remedy).toMatch(/repair.*retry/iu);
    } else expect(result.stdout + result.stderr).toMatch(/checks\.runner.*repair/isu);
    await expect(readFile(executed, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  }
  await writeFile(configuration, JSON.stringify({ "checks.runner": [process.execPath, example] }));
  const repaired = await runArc(["check", "run", "example", "--json"], root, { env: machine.environment });
  expect(repaired.exitCode, repaired.stdout + repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).result.checks[0]).toMatchObject({ outcome: "passed", output: "repaired" });
  expect(await readFile(executed, "utf8")).toBe("run\n");
}, 30_000);

it.runIf(process.platform === "linux").each(["missing executable", "missing explicit file", "invalid machine config"])(
  "reports %s with repair guidance and permits a fresh retry", async fault => {
    const argv = [process.execPath, example];
    const machine = await createRunnerMachineHome(directories, fault === "missing executable" ? ["missing-adapter-for-repair"] : argv);
    const configuration = join(machine.home, ".arc/config.yml");
    if (fault === "invalid machine config") await writeFile(configuration, "[]\n");
    const file = join(machine.home, "explicit-file");
    if (fault !== "missing explicit file") await writeFile(file, "repaired");
    const root = await createDeclaredCheckRepository({ example: { runner: true, inputs: ["src/**"],
      command: [process.execPath, "-e", "process.stdout.write(require('node:fs').readFileSync(process.env.FILE,'utf8'))"],
      environment_inputs: { FILE: "file" } } });
    directories.push(root);
    const environment = { ...machine.environment, FILE: file };
    for (const json of [true, false]) {
      const result = await runArc(["check", "run", "example", ...(json ? ["--json"] : [])], root, { env: environment });
      expect(result.exitCode, result.stdout + result.stderr).toBe(2);
      if (json) {
        const envelope = JSON.parse(result.stdout) as { error?: { message: string }; result?: { checks: Array<{ reason: string; remedy: string }> } };
        const reason = envelope.error?.message ?? envelope.result?.checks[0]?.reason;
        if (fault === "missing explicit file") {
          // A caller-side capture fault names the binding, not the machine configuration.
          expect(reason).toMatch(/environment_inputs binding FILE.*repair the file input/u);
          expect(reason).not.toContain(configuration);
        } else {
          expect(reason).toContain(configuration);
          expect(reason).toContain("checks.runner");
        }
        if (fault === "missing executable") expect(reason).toMatch(/did not start/u);
        if (fault !== "invalid machine config") expect(envelope.result?.checks[0]?.remedy).toMatch(/repair.*retry/iu);
      } else if (fault === "missing explicit file") {
        expect(result.stdout + result.stderr).toMatch(/environment_inputs binding FILE.*repair/isu);
      } else {
        expect(result.stdout + result.stderr).toContain(configuration);
        expect(result.stdout + result.stderr).toMatch(/checks\.runner.*repair/isu);
      }
    }
    await writeFile(configuration, JSON.stringify({ "checks.runner": argv }));
    await writeFile(file, "repaired");
    const repaired = await runArc(["check", "run", "example", "--json"], root, { env: environment });
    expect(repaired.exitCode, repaired.stdout + repaired.stderr).toBe(0);
    expect(JSON.parse(repaired.stdout).result.checks[0]).toMatchObject({ outcome: "passed", output: "repaired" });
  }, 30_000,
);

it("forecasts configured reuse as requiring preparation without probes or explicit-file capture", async () => {
  const machine = await createRunnerMachineHome(directories, ["missing-adapter-for-dry-run"]);
  const configuration = await readFile(join(machine.home, ".arc/config.yml"), "utf8");
  await rm(join(machine.home, ".arc/config.yml"));
  const probeReceipt = join(machine.home, "native-probes");
  const probe = `require('node:fs').appendFileSync(${JSON.stringify(probeReceipt)},'probe\\n');process.stdout.write('same')`;
  const root = await createDeclaredCheckRepository({ example: { runner: true, inputs: ["src/**"],
    command: [process.execPath, "-e", "process.stdout.write('native pass')"], runtime_inputs: [[process.execPath, "-e", probe]],
    environment_inputs: { PRIVATE_FILE: "file" } } });
  directories.push(root);
  const privateFile = join(root, "input.secret");
  await appendFile(join(root, ".gitignore"), "*.secret\n");
  await writeFile(privateFile, "secret bytes");
  const environment = { ...machine.environment, PRIVATE_FILE: privateFile };
  const run = async (dryRun: boolean, json = true) => runArc(["check", "run", "example",
    ...(dryRun ? ["--dry-run"] : []), ...(json ? ["--json"] : [])], root, { env: environment });
  expect(JSON.parse((await run(false)).stdout).result.checks[0].outcome).toBe("passed");
  expect(JSON.parse((await run(false)).stdout).result.checks[0].outcome).toBe("reused");
  const probesBefore = await readFile(probeReceipt, "utf8");
  await writeFile(join(machine.home, ".arc/config.yml"), configuration);
  await rm(privateFile);
  const preview = await run(true);
  expect(preview.exitCode, preview.stdout + preview.stderr).toBe(0);
  const check = JSON.parse(preview.stdout).result.checks[0] as { reason?: string };
  expect(check).toMatchObject({ outcome: "would run", environmentInputs: { PRIVATE_FILE: "file" } });
  expect(check.reason).toMatch(/reuse.*requires.*preparation/iu);
  const text = await run(true, false);
  expect(text.exitCode, text.stdout + text.stderr).toBe(0);
  expect(text.stdout).toMatch(/reuse.*requires.*preparation/iu);
  expect(preview.stdout).not.toContain("secret bytes");
  expect(await readFile(probeReceipt, "utf8")).toBe(probesBefore);
}, 30_000);
