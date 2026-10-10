/** Public native-controller boundary fixtures for warmed timing and failure policy. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type createVitest, type TestResult, parseCLI } from "vitest/node";
import { runTestCostMeasurement } from "../../src/lib/test-cost/run.js";

const mode = { condition: "tier-isolated", projectSet: "unit", workerSizing: "12" } as const;
let previousExitCode: typeof process.exitCode;
beforeEach(() => { previousExitCode = process.exitCode; process.exitCode = undefined; });
afterEach(() => { process.exitCode = previousExitCode; });

type Failure = "none" | "module" | "unhandled" | "missing-timing" | "empty";
function nativeBoundary(failures: readonly Failure[] = [], project = "unit") {
  let clock = 1_000;
  let controllerCount = 0;
  const events: string[] = [];
  let retained: string | undefined;
  const advance = (stage: string, elapsed: number) => { events.push(stage); clock += elapsed; };
  const create: typeof createVitest = async () => {
    const index = controllerCount++;
    const failure = failures[index] ?? "none";
    const duration = index === 0 ? 90 : 30;
    advance("creation", 11);
    const test = { id: "case-a", fullName: "suite > case a", options: { timeout: 5_000 }, meta: () => ({}),
      result: (): TestResult => failure === "module"
        ? { state: "failed", errors: [{ name: "Error", message: "completed failure" }] }
        : failure === "empty" ? { state: "skipped", errors: undefined, note: undefined }
          : { state: "passed", errors: undefined },
      diagnostic: () => failure === "missing-timing" ? undefined : ({ duration }) };
    const relativeModuleId = "cost.test.ts";
    const module = { moduleId: `/tests/${relativeModuleId}`, relativeModuleId, project: { name: project },
      meta: () => ({}), errors: () => [],
      state: () => failure === "module" ? "failed" : "passed", ok: () => failure !== "module",
      diagnostic: () => { advance("capture", 31); return { environmentSetupDuration: 4, prepareDuration: 6,
        collectDuration: 10, setupDuration: 20, duration }; },
      children: { allTests: function* () { yield test; } } };
    const errors = failure === "unhandled" ? [new Error("worker failure")] : [];
    const specification = { project: { name: project }, testModule: undefined as { task: { mode: string } } | undefined };
    const provided: Record<string, unknown> = {};
    return { config: { experimental: { preParse: true } }, projects: [{ config: { exclude: [] } }],
      standalone: async () => { advance("reporting", 13); },
      getRelevantTestSpecifications: async () => { advance("discovery", 17); return [specification]; },
      experimental_parseSpecifications: async () => { advance("pre-parsing", 19);
        specification.testModule = { task: { mode: "run" } }; return [{ errors: () => [] }]; },
      runTestSpecifications: async () => { advance("execution", 23); return { testModules: [module], unhandledErrors: errors }; },
      close: async () => { advance("closing", 29); },
      provide: (key: string, value: unknown) => { provided[key] = value; }, getProvidedContext: () => provided,
      state: { getTestModules: () => [module], getUnhandledErrors: () => errors },
      logger: { error: (...values: unknown[]) => events.push(values.join(" ")), printError() {}, printUnhandledErrors() {} },
    } as unknown as Awaited<ReturnType<typeof createVitest>>;
  };
  return { advance, events, retained: () => retained, dependencies: { create, now: () => clock, parseCli: parseCLI,
    persist: async (_path: string, content: string) => { advance("persistence", 37); retained = content; } } };
}

const input = { cwd: "/repo/packages/arc-framework", env: {}, mode, outputPath: "/out.json" };
const lifecycle = ["creation", "reporting", "discovery", "pre-parsing", "execution", "closing", "capture"];
describe("runTestCostMeasurement", () => {
  it("discards a complete warm-up and retains only the second controller's costs", async () => {
    const fixture = nativeBoundary();
    const run = await runTestCostMeasurement(input, fixture.dependencies);
    expect(run).toMatchObject({ schemaVersion: 4, outcome: "passed", unhandledErrorCount: 0,
      capturedAt: new Date(1_143).toISOString(), wallClockMs: 143,
      summedFileTimeMs: 70, fileCount: 1, testCount: 1, cliSpawnCount: 0,
      files: [{ path: "cost.test.ts", executionDurationMs: 30 }],
      substrate: { durationMs: 0, shareFraction: 0, files: [] } });
    expect(run).not.toHaveProperty("admissionWaitMs");
    expect(fixture.events).toEqual([...lifecycle, ...lifecycle, "persistence"]);
    expect(JSON.parse(fixture.retained() ?? "null")).toEqual(run);
  });

  it.each(["module", "unhandled", "missing-timing", "empty"] as const)("stops after a %s warm-up failure", async (failure) => {
    const fixture = nativeBoundary([failure]);
    await expect(runTestCostMeasurement(input, fixture.dependencies)).rejects.toThrow(failure === "module"
      ? /cost\.test\.ts.*failed/u : failure === "missing-timing"
        ? /timing data is missing duration/u : /did not complete successfully/u);
    expect(fixture.retained()).toBeUndefined();
    expect(fixture.events.filter(event => event === "creation")).toHaveLength(1);
    expect(fixture.events).toContain("closing");
    expect(fixture.events).not.toContain("persistence");
  });

  it.each(["module", "unhandled", "missing-timing", "empty"] as const)("retains nothing after a %s measured-run failure", async (failure) => {
    const fixture = nativeBoundary(["none", failure]);
    await expect(runTestCostMeasurement(input, fixture.dependencies)).rejects.toThrow(failure === "module"
      ? /cost\.test\.ts.*failed/u : failure === "missing-timing"
        ? /timing data is missing duration/u : /did not complete successfully/u);
    expect(fixture.retained()).toBeUndefined();
    expect(fixture.events.filter(event => event === "closing")).toHaveLength(2);
    expect(fixture.events).not.toContain("persistence");
  });

  it("resolves native sizing once for both passes and preserves the requested sizing", async () => {
    const fixture = nativeBoundary();
    let available = 16;
    const run = await runTestCostMeasurement({ ...input, mode: { ...mode, workerSizing: "native" } },
      { ...fixture.dependencies, availableParallelism: () => available-- });
    expect(run).toMatchObject({ requestedWorkerSizing: "native", mode: { workerSizing: "15" },
      capturedAt: new Date(1_143).toISOString() });
    expect(JSON.parse(fixture.retained() ?? "null")).toEqual(run);
  });
});
