/** Actual standalone adapter bytes execute public plans without ARC-private runtime imports. */
import { afterEach, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";
import { selectedExecutionFixture } from "../fixtures/checks/prepared-execution.js";
import { startCheckRunnerProcess } from "../../src/lib/checks/runner/session-process.js";

const example = fileURLToPath(new URL("../../examples/check-runner/local.mjs", import.meta.url));
const directories: string[] = [];
const localIt = it.runIf(process.platform === "linux");
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

localIt("executes captured files and exact explicit bindings with derived coordinates through the actual example", async () => {
  const fixture = await selectedExecutionFixture(directories);
  const chunks: Buffer[] = [];
  const attempt = prepareSelectedCheckExecution({ ...fixture.input,
    configuration: { file: fixture.input.configuration.file, argv: [process.execPath, example] },
    buildPlan: context => ({ invocations: [{ id: "check", cwd: ".", shell: false,
      argv: [process.execPath, "-e", `
        const fs=require('node:fs');
        process.stdout.write(JSON.stringify({source:fs.readFileSync('input.txt','utf8'),scalar:process.env.SCALAR,
          file:[...fs.readFileSync(process.env.EXPLICIT_FILE)],tree:process.env.ARC_CHECK_TREE,
          head:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}));
      `], commandContent: { tree: context.source.manifest.coordinates.tree,
        merged: context.source.manifest.coordinates.merged } }], probes: { global: [], check: [] } }),
    onOutput: ({ bytes }) => { chunks.push(Buffer.from(bytes)); },
  }, fixture.io);
  const prepared = await attempt;
  expect(prepared.status).toBe("ready");
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  try {
    expect(prepared.execution.runtime).toBeUndefined();
    expect(prepared.execution.supportsRunGroup).toBe(false);
    const result = await prepared.execution.run("check");
    expect(result.outcomes.get("check")).toEqual({ status: "completed", exitCode: 0 });
    expect(JSON.parse(Buffer.concat(chunks).toString("utf8"))).toEqual({ source: "captured source\r\n",
      scalar: "literal\nvalue", file: [0, 255, 13, 10], tree: fixture.input.request.tree,
      head: fixture.input.request.source.head.status === "known" ? fixture.input.request.source.head.commit : undefined });
    await expect(prepared.execution.close()).resolves.toMatchObject({ status: "closed" });
  } finally { await prepared.execution.close(); }
});

localIt.each(["source", "environment", "manifest"])("refuses %s corruption inside the actual adapter and permits a fresh repaired attempt", async fault => {
  const fixture = await selectedExecutionFixture(directories);
  const stateRoot = join(fixture.root, "adapter.secret");
  const marker = join(fixture.root, "executed.secret");
  let sourceRoot = "";
  let environmentFile = "";
  const input = { ...fixture.input, configuration: { file: fixture.input.configuration.file,
    argv: [process.execPath, example, "--state-root", stateRoot] as [string, ...string[]] },
  buildPlan: (context: Parameters<NonNullable<typeof fixture.input.buildPlan>>[0]) => {
    sourceRoot = context.source.root;
    const binding = context.environment.EXPLICIT_FILE;
    if (binding?.kind !== "file" || binding.state !== "file") throw new Error("Expected captured explicit file");
    environmentFile = binding.path;
    return { invocations: [{ id: "check", cwd: ".", shell: false as const,
      argv: [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)},'executed')`] as [string, ...string[]] }],
    probes: { global: [], check: [] } };
  } };
  const result = await prepareSelectedCheckExecution(input, { ...fixture.io, launch: launch => {
    if (fault === "manifest") writeFileSync(join(sourceRoot, "..", "manifest.json"), " ", { flag: "a" });
    else if (fault === "source") writeFileSync(join(sourceRoot, "input.txt"), "changed");
    else writeFileSync(environmentFile, Buffer.from([1, 254, 13, 10]));
    return startCheckRunnerProcess(launch);
  } });
  if (result.status === "ready") await result.execution.close();
  expect(result).toMatchObject({ status: "unavailable", reason: fault === "manifest"
    ? "Source manifest digest or canonical encoding changed" : "Captured input bytes or identity changed" });
  await expect(access(marker)).rejects.toThrow();
  const repaired = await prepareSelectedCheckExecution(input, fixture.io);
  if (repaired.status !== "ready") throw new Error(repaired.reason);
  try {
    expect((await repaired.execution.run("check")).outcomes.get("check")).toEqual({ status: "completed", exitCode: 0 });
  } finally { await repaired.execution.close(); }
});

localIt("refuses a reused plan directory without deleting another attempt's ownership records", async () => {
  const fixture = await selectedExecutionFixture(directories);
  const stateRoot = join(fixture.root, "adapter.secret");
  const attempt = prepareSelectedCheckExecution({ ...fixture.input, configuration: { file: fixture.input.configuration.file,
    argv: [process.execPath, example, "--state-root", stateRoot] } }, { ...fixture.io, launch: input => {
    mkdirSync(join(stateRoot, attempt.planId), { recursive: true });
    writeFileSync(join(stateRoot, attempt.planId, "existing-owner"), "preserve existing attempt");
    return startCheckRunnerProcess(input);
  } });
  const result = await attempt;
  if (result.status === "ready") await result.execution.close();
  expect(result.status).toBe("unavailable");
  expect(await readFile(join(stateRoot, attempt.planId, "existing-owner"), "utf8")).toBe("preserve existing attempt");
});

localIt("qualifies actual Node probes with exact stdout in the captured environment", async () => {
  const fixture = await selectedExecutionFixture(directories);
  const marker = " \n" + JSON.stringify({ scalar: "literal\nvalue", derived: false }) + "\r\n";
  const prepared = await prepareSelectedCheckExecution({ ...fixture.input,
    configuration: { file: fixture.input.configuration.file,
      argv: [process.execPath, example, "--known-node-runtime", "--state-root", join(fixture.root, "adapter.secret")] },
    check: { ...fixture.input.check, runtime_inputs: [[process.execPath, "-e",
      `process.stdout.write(' \\n'+JSON.stringify({scalar:process.env.SCALAR,derived:Object.hasOwn(process.env,'ARC_CHECK_TREE')})+'\\r\\n')`]] },
  }, fixture.io);
  if (prepared.status !== "ready") throw new Error(prepared.reason);
  try {
    expect(prepared.execution.runtime?.size).toBe(1);
    const binding = prepared.execution.runtime?.get(prepared.execution.plan.invocations[0]!.id);
    expect(binding?.identity).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(binding?.probes.get("global-probe:0")).toBe(" \nglobal-probe:0\r\n");
    expect(binding?.probes.get("check-probe:0")).toBe(marker);
    const result = await prepared.execution.run(prepared.execution.plan.invocations[0]!.id);
    expect([...result.outcomes.values()]).toEqual([{ status: "completed", exitCode: 0 }]);
  } finally { await prepared.execution.close(); }
});
