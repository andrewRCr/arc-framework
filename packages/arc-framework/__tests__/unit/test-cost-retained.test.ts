/** Unit coverage for detailed retained-run normalization. */

import { describe, expect, it } from "vitest";

import {
  assertRetainedTestCostRun,
  normalizeRetainedTestCostRuns,
} from "../../src/lib/test-cost/retained.js";
import type { RetainedTestCostRun } from "../../src/lib/test-cost/run.js";

function run(durationMs: number, waitMs?: number): RetainedTestCostRun {
  const file = {
    path: "a.test.ts",
    tier: "unit",
    environmentSetupDurationMs: 0,
    prepareDurationMs: 0,
    collectDurationMs: 10,
    setupDurationMs: 10,
    fixedCostMs: 20,
    testTimeMs: durationMs - 20,
    executionDurationMs: durationMs - 20,
    durationMs,
    tests: [{
      id: "a",
      name: "a",
      durationMs: durationMs - 20,
      vitestTimeoutMs: 5_000,
      timeoutCeilingMs: 5_000,
      headroomMs: 5_020 - durationMs,
      headroomFraction: (5_020 - durationMs) / 5_000,
    }],
  };
  return {
    schemaVersion: 4,
    outcome: "passed",
    unhandledErrorCount: 0,
    requestedWorkerSizing: "12",
    capturedAt: "2026-09-11T00:00:00.000Z",
    mode: { condition: "tier-isolated", projectSet: "unit", workerSizing: "12" },
    wallClockMs: durationMs,
    summedFileTimeMs: durationMs,
    fileCount: 1,
    testCount: 1,
    cliSpawnCount: 0,
    ...(waitMs === undefined ? {} : { admissionWaitMs: waitMs }),
    substrate: { durationMs: 0, shareFraction: 0, files: [] },
    files: [file],
  };
}

describe("normalizeRetainedTestCostRuns", () => {
  it("normalizes summary, files, substrate, and observed waits by median", () => {
    expect(normalizeRetainedTestCostRuns([run(90), run(100, 30), run(110, 50)]))
      .toMatchObject({
        summary: { sampleCount: 3, normalization: "median", wallClockMs: 100, cliSpawnCount: 0 },
        files: [{ path: "a.test.ts", durationMs: 100, testCount: 1 }],
        substrate: { durationMs: 0, shareFraction: 0, files: [] },
        waits: { observedCount: 2, medianMs: 40 },
      });
  });

  it("refuses runs whose file membership differs", () => {
    const changed = run(100);
    const different = { ...changed, files: [{ ...changed.files[0]!, path: "b.test.ts" }] };
    expect(() => normalizeRetainedTestCostRuns([changed, different]))
      .toThrow(/file membership/u);
  });

  it("refuses a retained run without a successful outcome", () => {
    const ineligible = { ...run(100), outcome: "failed" };

    expect(() => assertRetainedTestCostRun(ineligible, "ineligible.json"))
      .toThrow(/successful outcome/u);
  });

  it("refuses malformed nested data and inconsistent derived totals", () => {
    const valid = run(100);
    const file = valid.files[0]!;
    for (const malformed of [
      { ...valid, mode: { ...valid.mode, condition: "invented" } },
      { ...valid, mode: undefined },
      { ...valid, capturedAt: "not-a-date" },
      { ...valid, wallClockMs: Number.POSITIVE_INFINITY },
      { ...valid, summedFileTimeMs: 1 },
      { ...valid, fileCount: 2 },
      { ...valid, substrate: undefined },
      { ...valid, substrate: { durationMs: 1, shareFraction: 1, files: ["ghost.test.ts"] } },
      { ...valid, files: [{ ...file, fixedCostMs: 1 }] },
      { ...valid, files: [{ ...file, tests: [{ ...file.tests[0]!, headroomMs: 0 }] }] },
    ]) {
      expect(() => assertRetainedTestCostRun(malformed, "malformed.json")).toThrow(/Invalid retained/u);
    }
  });

  it("refuses divergent substrate membership across otherwise comparable runs", () => {
    const valid = run(100);
    const divergent = {
      ...valid,
      substrate: { ...valid.substrate, files: ["ghost.test.ts"] },
    } as RetainedTestCostRun;
    expect(() => normalizeRetainedTestCostRuns([valid, divergent]))
      .toThrow(/substrate/u);
  });

  it("refuses legacy cost arithmetic under the new schema", () => {
    expect(() => assertRetainedTestCostRun({ ...run(100), schemaVersion: 3 }, "legacy.json"))
      .toThrow(/successful outcome/u);
  });
});
