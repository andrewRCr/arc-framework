/** Native Vitest workers prove unit launch admission across both isolation settings. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { UNIT_PROCESS_LAUNCH_COUNT_META } from "../../src/lib/unit-process-metadata.js";
import { makeVitestControllerFixture, runVitestControllerFixture } from "../helpers/vitest-controller-fixture.js";

interface NativeGuardReport {
  testResults: { name: string; status: string; message: string; assertionResults: { fullName: string; status: string; failureMessages: string[]; meta?: Record<string, unknown> }[] }[];
}

async function createGuardFixture(allowlist: readonly string[] = ["tests/guard-allowed.test.ts"],
  hooks: "list" | "stack" | "parallel" = "stack"): Promise<{ root: string; packageRoot: string; reportPath: string }> {
  const { root, packageRoot } = await makeVitestControllerFixture();
  const reportPath = join(packageRoot, "guard-report.json");
  try {
    await mkdir(join(packageRoot, "__tests__", "helpers"), { recursive: true });
    for (const file of ["unit-process-guard.ts", "unit-process-guard-core.ts", "unit-process-runner.ts"]) {
      await writeFile(join(packageRoot, "__tests__", "helpers", file),
        await readFile(join(import.meta.dirname, "../helpers", file)));
    }
    await writeFile(join(packageRoot, "vitest.config.mjs"), `
import GuardSequencer from "./tests/guard-sequencer.mjs";
export default { test: { watch: false, maxWorkers: 1, sequence: { sequencer: GuardSequencer }, projects: [
  { test: { name: "unit", root: import.meta.dirname, isolate: false,
    runner: "__tests__/helpers/unit-process-runner.ts",
    sequence: { hooks: ${JSON.stringify(hooks)} },
    include: ["tests/guard-*.test.ts"], setupFiles: ["tests/guard-setup.ts"] } },
  { test: { name: "unit-mocks", root: import.meta.dirname, isolate: true,
    runner: "__tests__/helpers/unit-process-runner.ts",
    sequence: { hooks: ${JSON.stringify(hooks)} },
    include: ["tests/guard-*.test.ts"], setupFiles: ["tests/guard-setup.ts"] } }
] } };
`);
    await writeFile(join(packageRoot, "tests/guard-sequencer.mjs"), `
import { BaseSequencer } from "vitest/node";
export default class extends BaseSequencer {
  sort(specs) { return specs.sort((left, right) => left.moduleId.localeCompare(right.moduleId)); }
}
`);
    await writeFile(join(packageRoot, "tests/guard-setup.ts"), `
import { installUnitProcessGuard } from "../__tests__/helpers/unit-process-guard.js";
await installUnitProcessGuard(${JSON.stringify(allowlist)});
`);
    await writeFile(join(packageRoot, "tests/guard-direct.test.ts"), `
import childProcess from "node:child_process";
import { it } from "vitest";
it("direct launch", () => { childProcess.spawn(process.execPath, ["-e", "process.exit(0)"]); });
`);
    await writeFile(join(packageRoot, "tests/guard-named.test.ts"), `
import { spawn } from "node:child_process";
import { it } from "vitest";
it("named launch", () => { spawn(process.execPath, ["-e", "process.exit(0)"]); });
`);
    await writeFile(join(packageRoot, "tests/guard-execa.test.ts"), `
import { execa } from "execa";
import { it } from "vitest";
it("execa launch", async () => { await execa(process.execPath, ["-e", "process.exit(0)"]); });
`);
    await writeFile(join(packageRoot, "tests/guard-promisified.test.ts"), `
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { it } from "vitest";
it("promisified launch", async () => {
  await promisify(execFile)(process.execPath, ["-e", "process.exit(0)"]);
});
`);
    await writeFile(join(packageRoot, "tests/guard-allowed.test.ts"), `
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";
it("allowed native output", async () => {
  const output = await promisify(execFile)(process.execPath, ["-e", "process.stdout.write('fixture')"]);
  expect(output).toMatchObject({ stdout: "fixture", stderr: "" });
});
`);
    return { root, packageRoot, reportPath };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}

it("blocks direct, named-import and execa launches while admitting native execFile output in both unit projects", async () => {
  const { root, packageRoot, reportPath } = await createGuardFixture();
  try {
    const result = await runVitestControllerFixture(packageRoot,
      ["unit", "--reporter", "json", "--outputFile", reportPath], { FORCE_COLOR: undefined });
    expect(result.code, result.stdout + result.stderr).toBe(1);
    const report = JSON.parse(await readFile(reportPath, "utf8")) as NativeGuardReport;
    const cases = report.testResults.flatMap((file) => file.assertionResults);
    expect(cases).toHaveLength(10);
    expect(cases.filter((test) => test.fullName.includes("allowed native output"))).toEqual([
      expect.objectContaining({ status: "passed" }), expect.objectContaining({ status: "passed" }),
    ]);
    const blocked = cases.filter((test) => !test.fullName.includes("allowed native output"));
    expect(blocked).toHaveLength(8);
    expect(blocked.every((test) => test.status === "failed"
      && test.failureMessages.join("\n").includes("Unit process launch blocked"))).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60_000);

const lateTeardowns = {
  returned: 'beforeAll(() => () => launch()); it("body", () => {});',
  fixture: 'const test = it.extend({ late: [async ({}, use) => { await use(1); launch(); }, { scope: "file" }] }); test("body", ({ late }) => { expect(late).toBe(1); });',
  around: 'aroundAll(async (run) => { await run(); launch(); }); it("body", () => {});',
  afterall: 'afterAll(() => launch()); it("body", () => {});',
};

it("publishes final admission once per native module across completion paths", async () => {
  const { root, packageRoot } = await createGuardFixture([]);
  const eventsPath = join(packageRoot, "module-completions.jsonl");
  const bodies = {
    passed: 'it("body", () => {});',
    failed: 'it("body", () => { expect(1).toBe(2); });',
    skipped: 'it.skip("body", () => {});',
    collection: 'it("body", () => {}); throw new Error("collection failure");',
    late: 'afterAll(() => { try { spawn(process.execPath, ["-e", "process.exit(0)"]); } catch {} }); it("body", () => {});',
    "skipped-blocked": 'try { spawn(process.execPath, ["-e", "process.exit(0)"]); } catch {} it.skip("body", () => {});',
  };
  try {
    await writeFile(join(packageRoot, "tests/module-reporter.mjs"), `
import { appendFileSync } from "node:fs";
import { basename } from "node:path";
export default class {
  onTestModuleEnd(module) {
    appendFileSync(${JSON.stringify(eventsPath)}, JSON.stringify({
      file: basename(module.moduleId), project: module.project.name, state: module.state(), ok: module.ok(),
      launches: module.meta()[${JSON.stringify(UNIT_PROCESS_LAUNCH_COUNT_META)}]
    }) + "\\n");
  }
}
`);
    for (const [name, body] of Object.entries(bodies)) {
      await writeFile(join(packageRoot, `tests/guard-lifecycle-${name}.test.ts`), `
import { spawn } from "node:child_process";
import { afterAll, expect, it } from "vitest";
${body}
`);
    }
    const native = await runVitestControllerFixture(packageRoot,
      ["unit", "guard-lifecycle-", "--reporter", "./tests/module-reporter.mjs"], { FORCE_COLOR: undefined });
    expect(native.code, native.stdout + native.stderr).toBe(1);
    const events = (await readFile(eventsPath, "utf8")).trim().split("\n")
      .map((line) => JSON.parse(line) as { file: string; project: string; state: string; ok: boolean; launches: number });
    for (const project of ["unit", "unit-mocks"]) {
      for (const name of Object.keys(bodies)) {
        const file = `guard-lifecycle-${name}.test.ts`;
        expect.soft(events.filter((event) => event.file === file && event.project === project), native.stdout + native.stderr)
          .toEqual([{ file, project, state: name === "passed" ? "passed" : name.startsWith("skipped") ? "skipped" : "failed",
            ok: name === "passed" || name === "skipped",
            launches: name === "late" || name === "skipped-blocked" ? 1 : 0 }]);
      }
    }
    expect(events).toHaveLength(12);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60_000);

it.each(["list", "stack", "parallel"] as const)("finalizes caught file teardown launches with %s hooks", async (hooks) => {
  const { root, packageRoot, reportPath } = await createGuardFixture([], hooks);
  try {
    for (const [name, teardown] of Object.entries(lateTeardowns)) {
      await writeFile(join(packageRoot, `tests/guard-late-${name}.test.ts`), `
import { execFileSync } from "node:child_process";
import { afterAll, aroundAll, beforeAll, expect, it } from "vitest";
function launch() { try { execFileSync(process.execPath, ["-e", "process.exit(0)"]); } catch {} }
${teardown}
`);
    }
    const native = await runVitestControllerFixture(packageRoot,
      ["unit", "guard-late-", "--reporter", "json", "--outputFile", reportPath], { FORCE_COLOR: undefined });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as NativeGuardReport;
    expect(report.testResults, native.stdout + native.stderr).toHaveLength(8);
    expect(report.testResults.filter((file) => file.status !== "failed")).toEqual([]);
    expect(report.testResults.every((file) => file.message.includes("Unit process launch blocked"))).toBe(true);
    expect(native.code, native.stdout + native.stderr).toBe(1);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60_000);

it.each(["list", "stack", "parallel"] as const)("counts allowlisted cleanup-only launches with %s hooks", async (hooks) => {
  const files = Object.keys(lateTeardowns).map((name) => `tests/guard-late-${name}.test.ts`);
  const { root, packageRoot, reportPath } = await createGuardFixture(files, hooks);
  try {
    for (const [name, teardown] of Object.entries(lateTeardowns)) {
      await writeFile(join(packageRoot, `tests/guard-late-${name}.test.ts`), `
import { execFileSync } from "node:child_process";
import { afterAll, aroundAll, beforeAll, expect, it } from "vitest";
function launch() { expect(execFileSync(process.execPath, ["-e", "process.stdout.write('cleanup')"], { encoding: "utf8" })).toBe("cleanup"); }
${teardown}
`);
    }
    const native = await runVitestControllerFixture(packageRoot,
      ["unit", "guard-late-", "--reporter", "json", "--outputFile", reportPath], { FORCE_COLOR: undefined });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as NativeGuardReport;
    expect(report.testResults, native.stdout + native.stderr).toHaveLength(8);
    expect(report.testResults.filter((file) => file.status !== "passed")).toEqual([]);
    expect(native.code, native.stdout + native.stderr).toBe(0);
    expect(native.stdout + native.stderr).not.toContain("Unit launch allowlist idle:");
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60_000);

it("checks the launch floor with command-line JSON reporting and retains a final suite-hook launch", async () => {
  const files = ["tests/guard-floor-afterall.test.ts", "tests/guard-floor-idle.test.ts"];
  const { root, packageRoot, reportPath } = await createGuardFixture(files);
  try {
    await writeFile(join(packageRoot, files[0]!), `
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, it } from "vitest";
it("final suite-hook body", () => {});
afterAll(async () => { await promisify(execFile)(process.execPath, ["-e", "process.exit(0)"]); });
`);
    await writeFile(join(packageRoot, files[1]!), `
import { it } from "vitest";
it("idle legacy body", () => {});
`);
    const native = await runVitestControllerFixture(packageRoot,
      ["unit", "guard-floor-", "--reporter", "json", "--outputFile", reportPath], { FORCE_COLOR: undefined });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as NativeGuardReport;
    const cases = report.testResults.flatMap((file) => file.assertionResults);
    expect(cases, native.stdout + native.stderr).toHaveLength(4);
    expect(cases.filter((test) => test.status !== "passed")).toEqual([]);
    expect(cases.map((test) => test.meta?.[UNIT_PROCESS_LAUNCH_COUNT_META])).toEqual([0, 0, 0, 0]);
    expect(native.code, native.stdout + native.stderr).toBe(1);
    const diagnostics = (native.stdout + native.stderr).split("\n")
      .filter((line) => line.includes("Unit launch allowlist idle:"));
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.every((line) => line.includes("guard-floor-idle.test.ts"))).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60_000);

it("fails caught helper/execa launches and caught suite-hook launches in both unit projects", async () => {
  const { root, packageRoot, reportPath } = await createGuardFixture();
  try {
    await writeFile(join(packageRoot, "tests/guard-caught-helper.test.ts"), `
import { spawn } from "node:child_process";
import { it } from "vitest";
it("caught helper launch", () => { try { spawn(process.execPath, ["-e", "process.exit(0)"]); } catch {} });
`);
    await writeFile(join(packageRoot, "tests/guard-caught-execa.test.ts"), `
import { execa } from "execa";
import { it } from "vitest";
it("caught execa launch", async () => { await execa(process.execPath, ["-e", "process.exit(0)"], { reject: false }); });
`);
    for (const hook of ["beforeAll", "afterAll"]) {
      await writeFile(join(packageRoot, `tests/guard-caught-${hook}.test.ts`), `
import { spawn } from "node:child_process";
import { it, ${hook} } from "vitest";
${hook}(() => { try { spawn(process.execPath, ["-e", "process.exit(0)"]); } catch {} });
it("caught ${hook} body", () => {});
`);
    }
    const result = await runVitestControllerFixture(packageRoot,
      ["unit", "--reporter", "json", "--outputFile", reportPath], { FORCE_COLOR: undefined });
    expect(result.code, result.stdout + result.stderr).toBe(1);
    const report = JSON.parse(await readFile(reportPath, "utf8")) as NativeGuardReport;
    const caught = report.testResults.flatMap((file) => file.assertionResults)
      .filter((test) => /caught (helper|execa) launch/u.test(test.fullName));
    expect(caught).toHaveLength(4);
    expect(caught.filter((test) => test.status !== "failed")).toEqual([]);
    const hookFiles = report.testResults.filter((file) => /guard-caught-(beforeAll|afterAll)\.test\.ts$/u.test(file.name));
    expect(hookFiles).toHaveLength(4);
    expect(hookFiles.filter((file) => file.status !== "failed")).toEqual([]);
    expect(hookFiles.every((file) => file.message.includes("Unit process launch blocked"))).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60_000);

it("counts each esbuild file's own service and denies reuse by an off-list file in the same worker", async () => {
  const files = ["tests/guard-esbuild-first.test.ts", "tests/guard-esbuild-second.test.ts"];
  const { root, packageRoot, reportPath } = await createGuardFixture(["tests/guard-allowed.test.ts", ...files]);
  try {
    for (const [index, file] of files.entries()) {
      await writeFile(join(packageRoot, file), `
import { transform } from "esbuild";
import { expect, it } from "vitest";
it("esbuild service ${index}", async ({ task }) => {
  task.meta.worker = process.pid;
  task.meta.project = task.file.projectName;
  const output = await transform("export const value = 1;");
  expect(output.code).toContain("export const value");
});
`);
    }
    const native = await runVitestControllerFixture(packageRoot,
      ["unit", "--reporter", "json", "--outputFile", reportPath], { FORCE_COLOR: undefined });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as NativeGuardReport;
    const services = report.testResults.flatMap((file) => file.assertionResults)
      .filter((test) => test.fullName.includes("esbuild service"));
    expect(services, native.stdout + native.stderr + JSON.stringify(report.testResults)).toHaveLength(4);
    expect(services.filter((test) => test.status !== "passed")).toEqual([]);
    expect(services.map((test) => test.meta?.[UNIT_PROCESS_LAUNCH_COUNT_META])).toEqual([1, 1, 1, 1]);
    for (const project of ["unit"]) {
      const workers = services.filter((test) => test.meta?.project === project).map((test) => test.meta?.worker);
      expect(workers).toHaveLength(2);
      expect(new Set(workers).size).toBe(1);
    }
    await writeFile(join(packageRoot, "tests/guard-setup.ts"), `
import { installUnitProcessGuard } from "../__tests__/helpers/unit-process-guard.js";
await installUnitProcessGuard(["tests/guard-allowed.test.ts", ${JSON.stringify(files[0])}]);
`);
    await runVitestControllerFixture(packageRoot,
      ["unit", "--reporter", "json", "--outputFile", reportPath], { FORCE_COLOR: undefined });
    const denied = JSON.parse(await readFile(reportPath, "utf8")) as NativeGuardReport;
    const blocked = denied.testResults.flatMap((file) => file.assertionResults)
      .filter((test) => test.fullName.includes("esbuild service 1"));
    expect(blocked).toHaveLength(2);
    expect(blocked.filter((test) => test.status !== "failed"
      || !test.failureMessages.join("\n").includes("Unit process launch blocked"))).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60_000);
