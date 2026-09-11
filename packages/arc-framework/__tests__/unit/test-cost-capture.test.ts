/** Unit coverage for extracting complete cost records from Vitest's reported tasks. */

import { describe, expect, it } from "vitest";

import {
  captureTestCost,
  type ReportedCostModule,
} from "../../src/lib/test-cost/capture.js";

function moduleFixture(
  path: string,
  projectName: string,
  collectDuration: number,
  setupDuration: number,
  tests: Array<{
    id: string;
    name: string;
    duration?: number;
    timeout?: number;
    cliTimeout?: number;
    cliSpawnCount?: number;
    state?: string;
  }>,
  executionDuration: number = tests.reduce((total, test) => total + (test.duration ?? 0), 0),
): ReportedCostModule {
  return {
    relativeModuleId: path,
    project: { name: projectName },
    diagnostic: () => ({ collectDuration, setupDuration, duration: executionDuration }),
    children: {
      allTests: function* () {
        for (const test of tests) {
          yield {
            id: test.id,
            fullName: test.name,
            options: { timeout: test.timeout ?? 5_000 },
            meta: () => ({
              ...(test.cliTimeout === undefined ? {} : { arcTestCostCliTimeoutMs: test.cliTimeout }),
              ...(test.cliSpawnCount === undefined ? {} : { arcTestCostCliSpawnCount: test.cliSpawnCount }),
            }),
            result: () => ({ state: test.state ?? "passed" }),
            diagnostic: () => test.duration === undefined ? undefined : { duration: test.duration },
          };
        }
      },
    },
  };
}

describe("captureTestCost", () => {
  it("reports every file and their summed cost", () => {
    const result = captureTestCost([
      moduleFixture("a.test.ts", "unit", 2, 3, [{ id: "a", name: "a", duration: 5 }]),
      moduleFixture("b.test.ts", "integration", 7, 11, [{ id: "b", name: "b", duration: 13 }]),
    ]);

    expect(result.files.map((file) => [file.path, file.durationMs])).toEqual([
      ["a.test.ts", 10],
      ["b.test.ts", 31],
    ]);
    expect(result.summedFileTimeMs).toBe(41);
  });

  it("adds complete module execution cost without double-counting test time", () => {
    const [file] = captureTestCost([
      moduleFixture("fixed.test.ts", "unit", 17, 19, [
        { id: "one", name: "one", duration: 2 },
        { id: "two", name: "two", duration: 3 },
      ], 11),
    ]).files;

    expect(file).toMatchObject({
      fixedCostMs: 36,
      testTimeMs: 5,
      executionDurationMs: 11,
      durationMs: 47,
    });
  });

  it("retains every executed it.each case", () => {
    const [file] = captureTestCost([
      moduleFixture("matrix.test.ts", "unit", 1, 1, [
        { id: "case-1", name: "matrix > case 1", duration: 3 },
        { id: "case-2", name: "matrix > case 2", duration: 5 },
        { id: "case-3", name: "matrix > case 3", duration: 7 },
      ]),
    ]).files;

    expect(file?.tests).toHaveLength(3);
    expect(file?.tests.map((test) => test.id)).toEqual(["case-1", "case-2", "case-3"]);
  });

  it("attributes files from Vitest project identity even when they share a directory", () => {
    const result = captureTestCost([
      moduleFixture("__tests__/unit/shared-a.test.ts", "unit", 1, 1, [
        { id: "a", name: "a", duration: 1 },
      ]),
      moduleFixture("__tests__/unit/shared-b.test.ts", "unit-mocks", 1, 1, [
        { id: "b", name: "b", duration: 1 },
      ]),
    ]);

    expect(result.files.map((file) => file.tier)).toEqual(["unit", "unit-mocks"]);
  });

  it("fails loudly when a run has no timing data", () => {
    expect(() => captureTestCost([])).toThrow(/no file timing data/u);
    expect(() => captureTestCost([
      moduleFixture("missing.test.ts", "unit", 1, 1, [
        { id: "missing", name: "missing" },
      ]),
    ])).toThrow(/missing duration.*missing/u);
  });

  it("omits unexecuted skipped cases without masking missing executed timing", () => {
    const [file] = captureTestCost([
      moduleFixture("skips.test.ts", "unit", 1, 1, [
        { id: "ran", name: "ran", duration: 3 },
        { id: "skipped", name: "skipped", state: "skipped" },
      ]),
    ]).files;

    expect(file?.tests.map((test) => test.id)).toEqual(["ran"]);
  });

  it("retains fixed cost for a file whose only case is skipped", () => {
    const [file] = captureTestCost([
      moduleFixture("skipped-file.test.ts", "integration", 7, 11, [
        { id: "skipped", name: "skipped", state: "skipped" },
      ]),
    ]).files;

    expect(file).toMatchObject({ durationMs: 18, testTimeMs: 0, tests: [] });
  });

  it("reports headroom against a tighter runCli timeout", () => {
    const [test] = captureTestCost([
      moduleFixture("cli.test.ts", "integration", 1, 1, [{
        id: "cli",
        name: "cli",
        duration: 2_000,
        timeout: 30_000,
        cliTimeout: 10_000,
        cliSpawnCount: 2,
      }]),
    ]).files[0]?.tests ?? [];

    expect(test).toMatchObject({
      vitestTimeoutMs: 30_000,
      cliTimeoutMs: 10_000,
      cliSpawnCount: 2,
      timeoutCeilingMs: 10_000,
      headroomMs: 8_000,
      headroomFraction: 0.8,
    });
  });
});
