/** Retained measurements use native configured controllers and prepared artifact lifetimes. */
import { execa } from "execa";
import { access, cp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { makeFocusedVitestFixture } from "../helpers/focused-vitest-fixture.js";
import { assertRetainedTestCostRun, normalizeRetainedTestCostRuns } from "../../src/lib/test-cost/retained.js";
import { readBuildQualification } from "../../src/lib/build-qualification.js";

it("retains a heavy measurement only after owned setup, teardown, and controller closing", async () => {
  const fixture = await makeFocusedVitestFixture();
  try {
    await cp(resolve(import.meta.dirname, "../../test-cost-budgets.json"), join(fixture.packageRoot, "test-cost-budgets.json"));
    const output = join(fixture.packageRoot, "retained.json");
    const result = await execa(process.execPath, ["--import", "tsx", "src/scripts/measure-test-cost.ts",
      "--condition", "tier-isolated", "--project-set", "integration", "--workers", "1", "--output", output],
      { cwd: fixture.packageRoot, env: { CI: "1", ARC_E2E_SKIP_BUILD: "" }, reject: false, timeout: 30_000 });
    expect(result, result.stderr).toMatchObject({ exitCode: 0 });
    const events = await readFile(fixture.events, "utf8");
    expect(events.match(/"stage":"integration:setup"/gu)).toHaveLength(2);
    expect(events.match(/"stage":"integration:teardown"/gu)).toHaveLength(2);
    expect(events).toContain('"owned":true');
    expect(events).not.toContain('"owned":false');
    expect(events).toContain("closing-owned:true:false");
    const record = JSON.parse(await readFile(output, "utf8"));
    expect(record).toMatchObject({ schemaVersion: 4, outcome: "passed", unhandledErrorCount: 0,
      mode: { projectSet: "integration", workerSizing: "1" }, requestedWorkerSizing: "1", fileCount: 1, testCount: 1 });
    await expect(access(join(fixture.packageRoot, ".arc-build.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 60_000);

it("retains qualified runtime generations across default measurement output", async () => {
  const fixture = await makeFocusedVitestFixture();
  try {
    await cp(resolve(import.meta.dirname, "../../test-cost-budgets.json"), join(fixture.packageRoot, "test-cost-budgets.json"));
    let generation: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await execa(process.execPath, ["--import", "tsx", "src/scripts/measure-test-cost.ts",
        "--condition", "tier-isolated", "--project-set", "integration", "--workers", "1"],
        { cwd: fixture.packageRoot, env: { CI: "1", ARC_E2E_SKIP_BUILD: "" }, reject: false, timeout: 30_000 });
      expect(result, result.stderr).toMatchObject({ exitCode: 0 });
      const qualified = readBuildQualification(fixture.packageRoot, "runtimeMetafile");
      expect(qualified).toMatchObject({ status: "qualified" });
      if (qualified.status !== "qualified") throw new Error(qualified.reason);
      if (generation === undefined) generation = qualified.evidence.generation;
      expect(qualified.evidence.generation).toBe(generation);
    }
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 60_000);

it("includes real controller closing and retains native case metadata for existing consumers", async () => {
  const fixture = await makeFocusedVitestFixture();
  try {
    await execa("git", ["init", "-q", "-b", "main"], { cwd: fixture.root });
    await cp(resolve(import.meta.dirname, "../../test-cost-budgets.json"), join(fixture.packageRoot, "test-cost-budgets.json"));
    const configuration = join(fixture.packageRoot, "vitest.config.ts");
    await writeFile(configuration, (await readFile(configuration, "utf8")).replace("closeBundle() {",
      'async closeBundle() { const started = Date.now(); await new Promise(resolve => setTimeout(resolve, 75)); '
      + 'appendFileSync(events, JSON.stringify({ closingStart: started, closingEnd: Date.now() }) + "\\n");'));
    await writeFile(join(fixture.packageRoot, "__tests__/unit/named.test.mjs"), `
import { it, TestRunner } from "vitest";
it("native metadata case", () => {
  TestRunner.getCurrentTest().meta.arcTestCostCliSpawnCount = 2;
  TestRunner.getCurrentTest().meta.arcTestCostCliTimeoutMs = 1500;
});
`);
    const output = join(fixture.packageRoot, "retained.json");
    const result = await execa(process.execPath, ["--import", "tsx", "src/scripts/measure-test-cost.ts",
      "--condition", "tier-isolated", "--project-set", "unit", "--workers", "1", "--output", output],
      { cwd: fixture.packageRoot, env: { CI: "", ARC_TEST_ALLOW_CONCURRENCY: "", TEST: undefined, VITEST: undefined,
        NODE_ENV: undefined }, reject: false, timeout: 30_000 });
    expect(result, result.stderr).toMatchObject({ exitCode: 0 });
    const events = await readFile(fixture.events, "utf8");
    expect(events).toContain("config:true:true:test");
    const closing = events.split("\n").filter((line) => line.startsWith('{"closingStart":'))
      .map((line) => JSON.parse(line) as { closingStart: number; closingEnd: number });
    const record: unknown = JSON.parse(await readFile(output, "utf8"));
    assertRetainedTestCostRun(record, output);
    const retainedStart = Date.parse(record.capturedAt);
    expect(closing.some((event) => event.closingEnd <= retainedStart)).toBe(true);
    const retainedClosing = closing.filter((event) => event.closingStart >= retainedStart);
    expect(retainedClosing.length).toBeGreaterThan(0);
    const closingMs = Math.max(...retainedClosing.map((event) => event.closingEnd))
      - Math.min(...retainedClosing.map((event) => event.closingStart));
    expect(closingMs).toBeGreaterThanOrEqual(50);
    expect(record.wallClockMs).toBeGreaterThanOrEqual(closingMs);
    const lastClosingEnd = Math.max(...retainedClosing.map((event) => event.closingEnd));
    expect(Date.parse(record.capturedAt) + record.wallClockMs + (record.admissionWaitMs ?? 0))
      .toBeGreaterThanOrEqual(lastClosingEnd);
    expect(record).toMatchObject({ schemaVersion: 4, outcome: "passed", cliSpawnCount: 2 });
    expect(record.files.flatMap((file) => file.tests).find((test) => test.name === "native metadata case"))
      .toMatchObject({ cliSpawnCount: 2, cliTimeoutMs: 1500, vitestTimeoutMs: 5000 });
    expect(normalizeRetainedTestCostRuns([record]).summary).toMatchObject({ sampleCount: 1, cliSpawnCount: 2 });
    expect(events).toContain("closing-owned:false:false");
    expect(events).not.toContain('"stage":"integration:setup"');
    await expect(access(join(fixture.packageRoot, "dist/dev-build-stamp.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(fixture.packageRoot, ".config-loads"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 60_000);

it("uses refined projects for ownership when full measurement pre-parsing retains only unit cases", async () => {
  const fixture = await makeFocusedVitestFixture(true);
  try {
    await execa("git", ["init", "-q", "-b", "main"], { cwd: fixture.root });
    await cp(resolve(import.meta.dirname, "../../test-cost-budgets.json"), join(fixture.packageRoot, "test-cost-budgets.json"));
    const configuration = join(fixture.packageRoot, "vitest.config.ts");
    await writeFile(configuration, (await readFile(configuration, "utf8"))
      .replace('name: "unit",', 'name: "unit", allowOnly: true,'));
    await writeFile(join(fixture.packageRoot, "__tests__/unit/named.test.mjs"),
      'import { it } from "vitest"; it.only("refined native measurement", () => {});');
    const output = join(fixture.packageRoot, "retained.json");
    const result = await execa(process.execPath, ["--import", "tsx", "src/scripts/measure-test-cost.ts",
      "--condition", "tier-isolated", "--project-set", "full", "--workers", "1", "--output", output],
      { cwd: fixture.packageRoot, env: { CI: "", ARC_TEST_ALLOW_CONCURRENCY: "" }, reject: false, timeout: 30_000 });
    expect(result, result.stderr).toMatchObject({ exitCode: 0 });
    const record: unknown = JSON.parse(await readFile(output, "utf8"));
    assertRetainedTestCostRun(record, output);
    expect(record).toMatchObject({ mode: { projectSet: "full" }, testCount: 1 });
    expect(record.files.filter((file) => file.tests.length > 0).map((file) => file.tier)).toEqual(["unit"]);
    const events = await readFile(fixture.events, "utf8");
    expect(events).toContain("closing-owned:false:false");
    expect(events).not.toContain('"stage":"integration:setup"');
    expect(events).not.toContain('"stage":"e2e:setup"');
    await expect(access(join(fixture.packageRoot, "dist/dev-build-stamp.json"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 60_000);

it("loads the package measurement configuration when its script starts at repository root", async () => {
  const fixture = await makeFocusedVitestFixture();
  try {
    await cp(resolve(import.meta.dirname, "../../test-cost-budgets.json"), join(fixture.packageRoot, "test-cost-budgets.json"));
    const output = join(fixture.packageRoot, "retained.json");
    const result = await execa(process.execPath, ["--import", "tsx", "packages/arc-framework/src/scripts/measure-test-cost.ts",
      "--condition", "tier-isolated", "--project-set", "integration", "--workers", "1", "--output", output],
      { cwd: fixture.root, env: { CI: "1", ARC_E2E_SKIP_BUILD: "" }, reject: false, timeout: 30_000 });
    expect(result, result.stderr).toMatchObject({ exitCode: 0 });
    expect(JSON.parse(await readFile(output, "utf8"))).toMatchObject({ mode: { projectSet: "integration" }, testCount: 1 });
    expect(await readFile(fixture.events, "utf8")).toContain("closing-owned:true:false");
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 60_000);
