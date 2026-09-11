/** Unit coverage for the admitted in-process test-cost runner. */

import { describe, expect, it, vi } from "vitest";

import { runTestCostMeasurement } from "../../src/lib/test-cost/run.js";

const mode = { condition: "tier-isolated", projectSet: "unit", workerSizing: "12" } as const;

describe("runTestCostMeasurement", () => {
  it("measures only the Vitest action, keeps queue wait separate, and retains one run", async () => {
    let clock = 1_000;
    const exit = vi.fn(async () => {});
    const persist = vi.fn(async () => {});
    const parseCli = vi.fn(() => ({ filter: [], options: { run: true } }));
    const start = vi.fn(async () => {
      clock = 1_250;
      return {
        state: {
          getTestModules: () => [{
            relativeModuleId: "cost.test.ts",
            project: { name: "unit" },
            state: () => "passed",
            ok: () => true,
            diagnostic: () => ({ collectDuration: 10, setupDuration: 20, duration: 30 }),
            children: {
              allTests: function* () {
                yield {
                  id: "case-a",
                  fullName: "suite > case a",
                  options: { timeout: 5_000 },
                  diagnostic: () => ({ duration: 30 }),
                };
              },
            },
          }],
          getUnhandledErrors: () => [],
        },
        shouldKeepServer: () => false,
        exit,
      } as never;
    });
    const admit = vi.fn(async (_input, action) => ({ result: await action(), waitMs: 45 }));

    const result = await runTestCostMeasurement({
      cwd: "/repo/packages/arc-framework",
      env: {},
      mode,
      outputPath: "/repo/.test-cost-runs/run.json",
    }, { admit, now: () => clock, parseCli, persist, start });

    expect(parseCli).toHaveBeenCalledWith([
      "vitest", "run", "--project", "unit", "--project", "unit-mocks",
      "--maxWorkers", "12",
    ]);
    expect(admit).toHaveBeenCalledWith(
      { cwd: "/repo/packages/arc-framework", env: {}, tier: "unit" },
      expect.any(Function),
    );
    expect(result).toMatchObject({
      schemaVersion: 3,
      outcome: "passed",
      unhandledErrorCount: 0,
      wallClockMs: 250,
      summedFileTimeMs: 60,
      admissionWaitMs: 45,
      fileCount: 1,
      testCount: 1,
      cliSpawnCount: 0,
      substrate: { durationMs: 0, shareFraction: 0, files: [] },
    });
    expect(exit).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(
      "/repo/.test-cost-runs/run.json",
      `${JSON.stringify(result, null, 2)}\n`,
    );
  });

  it("refuses to retain a run whose Vitest module failed", async () => {
    const persist = vi.fn(async () => {});
    const exit = vi.fn(async () => {});
    const start = vi.fn(async () => ({
      state: {
        getTestModules: () => [{
          relativeModuleId: "failed.test.ts",
          project: { name: "unit" },
          state: () => "failed",
          ok: () => false,
          diagnostic: () => ({ collectDuration: 1, setupDuration: 1, duration: 1 }),
          children: {
            allTests: function* () {
              yield {
                id: "failed-case",
                fullName: "failed case",
                options: { timeout: 5_000 },
                result: () => ({ state: "failed" }),
                diagnostic: () => ({ duration: 1 }),
              };
            },
          },
        }],
        getUnhandledErrors: () => [],
      },
      shouldKeepServer: () => false,
      exit,
    } as never));
    const admit = vi.fn(async (_input, action) => ({ result: await action() }));

    await expect(runTestCostMeasurement({
      cwd: "/repo",
      env: {},
      mode,
      outputPath: "/out.json",
    }, {
      admit,
      now: () => 1,
      parseCli: () => ({ filter: [], options: { run: true } }),
      persist,
      start,
    })).rejects.toThrow(/failed\.test\.ts.*failed/u);

    expect(persist).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledOnce();
  });

  it("refuses to retain passed modules when Vitest reports an unhandled run error", async () => {
    const persist = vi.fn(async () => {});
    const exit = vi.fn(async () => {});
    const start = vi.fn(async () => ({
      state: {
        getTestModules: () => [{
          relativeModuleId: "passed.test.ts",
          project: { name: "unit" },
          state: () => "passed",
          ok: () => true,
          diagnostic: () => ({ collectDuration: 1, setupDuration: 1, duration: 1 }),
          children: {
            allTests: function* () {
              yield {
                id: "passed-case",
                fullName: "passed case",
                options: { timeout: 5_000 },
                result: () => ({ state: "passed" }),
                diagnostic: () => ({ duration: 1 }),
              };
            },
          },
        }],
        getUnhandledErrors: () => [new Error("worker failure")],
      },
      shouldKeepServer: () => false,
      exit,
    } as never));
    const admit = vi.fn(async (_input, action) => ({ result: await action() }));

    await expect(runTestCostMeasurement({
      cwd: "/repo",
      env: {},
      mode,
      outputPath: "/out.json",
    }, {
      admit,
      now: () => 1,
      parseCli: () => ({ filter: [], options: { run: true } }),
      persist,
      start,
    })).rejects.toThrow(/unhandled run error/u);

    expect(persist).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledOnce();
  });

  it("always closes the completed Vitest controller", async () => {
    const exit = vi.fn(async () => {});
    const start = vi.fn(async () => ({
      state: { getTestModules: () => [], getUnhandledErrors: () => [] },
      shouldKeepServer: () => false,
      exit,
    } as never));
    const admit = vi.fn(async (_input, action) => ({ result: await action() }));

    await expect(runTestCostMeasurement({
      cwd: "/repo",
      env: {},
      mode,
      outputPath: "/out.json",
    }, {
      admit,
      now: () => 1,
      parseCli: () => ({ filter: [], options: { run: true } }),
      persist: async () => {},
      start,
    })).rejects.toThrow(/no file timing data/u);

    expect(exit).toHaveBeenCalledOnce();
  });
});
