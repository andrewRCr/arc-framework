/** Generic plans are complete and immutable before adapter admission. */
import { afterEach, expect, it } from "vitest";
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { prepareSelectedCheckExecution } from "../../src/lib/checks/runner/execution.js";
import type { Invocation, Probe } from "../../src/lib/checks/runner/contract.js";
import { selectedExecutionFixture, preparedAdapterScript } from "../fixtures/checks/prepared-execution.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it("forms the whole plan from captured selection and bindings, then preserves it against later producer mutation", async () => {
  const fixture = await selectedExecutionFixture(directories, "known");
  let producerPlan: { invocations: Invocation[]; probes: { global: Probe[]; check: Probe[] } } | undefined;
  let displayed = false;
  const result = await prepareSelectedCheckExecution({ ...fixture.input,
    configuration: { ...fixture.input.configuration,
      argv: [process.execPath, "-e", 'process.stderr.write("preparing\\n");' + preparedAdapterScript("known")] },
    buildPlan: context => {
      const scalar = context.environment.SCALAR;
      if (scalar?.kind !== "value" || scalar.state !== "set") throw new Error("Expected captured scalar");
      const { tree, base, merged } = context.source.manifest.coordinates;
      producerPlan = { invocations: [0, 1].map(index => ({ id: `planned:${index}`, cwd: ".", shell: false,
        argv: [process.execPath, "-e", "process.exit(0)", ...context.paths, scalar.value],
        commandContent: { tree, ...(base === undefined ? {} : { base }), ...(merged.length === 0 ? {} : { merged }) } })),
      probes: { global: [{ id: "provided-probe", argv: [process.execPath, "-e", `process.stdout.write(${JSON.stringify(" \nprovided-probe\r\n")})`], cwd: "." }], check: [] } };
      return producerPlan;
    }, onDiagnostic: () => { displayed = true; producerPlan?.invocations[0]?.argv.push("later producer mutation"); },
  }, fixture.io);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error(result.reason);
  try {
    expect(result.execution.runtime?.size).toBe(2);
    expect([...result.execution.runtime?.keys() ?? []]).toEqual(["planned:0", "planned:1"]);
    expect(result.execution.runtime?.get("planned:1")?.probes.get("provided-probe")).toBe(" \nprovided-probe\r\n");
  } finally { await result.execution.close(); }
  expect(displayed).toBe(true);
  expect(producerPlan?.invocations[0]?.argv).toContain("later producer mutation");
  expect(result.execution.plan.invocations[0]?.argv).toEqual([process.execPath, "-e", "process.exit(0)", "input.txt", "literal\nvalue"]);
  expect(() => { result.execution.plan.invocations[0]!.argv.push("consumer mutation"); }).toThrow();
});

it("refuses an oversized complete generic argv before adapter launch and permits a repaired plan", async () => {
  const fixture = await selectedExecutionFixture(directories);
  const check = { ...fixture.input.check, mode: "project" as const };
  const marker = join(fixture.root, "adapter-started");
  const configuration = { ...fixture.input.configuration, argv: [process.execPath, "-e",
    `require('node:fs').writeFileSync(${JSON.stringify(marker)},'started');` + preparedAdapterScript("unknown")] as [string, ...string[]] };
  const buildPlan = (large: boolean) => ({ invocations: [{ id: "provided", cwd: ".", shell: false as const,
    argv: [process.execPath, "-e", "process.exit(0)", large ? "x".repeat(7936) : "literal"] as [string, ...string[]] }],
    probes: { global: [], check: [] } });
  const refused = await prepareSelectedCheckExecution({ ...fixture.input, check, configuration, buildPlan: () => buildPlan(true) }, fixture.io);
  if (refused.status === "ready") await refused.execution.close();
  expect(refused.status).toBe("unavailable");
  await expect(access(marker)).rejects.toThrow();
  for (const directory of fixture.captures) await expect(access(directory)).rejects.toThrow();
  const repaired = await prepareSelectedCheckExecution({ ...fixture.input, check, configuration, buildPlan: () => buildPlan(false) }, fixture.io);
  expect(repaired.status).toBe("ready");
  if (repaired.status !== "ready") throw new Error(repaired.reason);
  await repaired.execution.close();
  await expect(access(marker)).resolves.toBeUndefined();
});

it.each(["manifest", "environment"] as const)("validates captured %s before starting the adapter and permits repaired capture", async fault => {
  const fixture = await selectedExecutionFixture(directories);
  const marker = join(fixture.root, "adapter-started");
  const configuration = { ...fixture.input.configuration, argv: [process.execPath, "-e",
    `require('node:fs').writeFileSync(${JSON.stringify(marker)},'started');` + preparedAdapterScript("unknown")] as [string, ...string[]] };
  const source = { ...fixture.io.source,
    writeManifest: async (path: string, content: string) => {
      await fixture.io.source.writeManifest(path, content);
      if (fault === "manifest") await writeFile(path, "damaged manifest");
    }, files: { ...fixture.io.source.files, openOutput: async (path: string) => {
      const writer = await fixture.io.source.files.openOutput(path);
      return { write: writer.write, close: async () => {
        await writer.close();
        if (fault === "environment" && path.endsWith(".input")) await writeFile(path, "damaged captured input");
      } };
    } } };
  const refused = await prepareSelectedCheckExecution({ ...fixture.input, configuration }, { ...fixture.io, source });
  if (refused.status === "ready") await refused.execution.close();
  expect(refused.status).toBe("unavailable");
  await expect(access(marker)).rejects.toThrow();
  for (const directory of fixture.captures) await expect(access(directory)).rejects.toThrow();
  const repaired = await prepareSelectedCheckExecution({ ...fixture.input, configuration }, fixture.io);
  expect(repaired.status).toBe("ready");
  if (repaired.status !== "ready") throw new Error(repaired.reason);
  await repaired.execution.close();
});
