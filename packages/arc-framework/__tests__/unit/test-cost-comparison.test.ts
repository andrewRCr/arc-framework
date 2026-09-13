/** Unit coverage for retained lever comparisons and worker-sizing sweeps. */

import { describe, expect, it } from "vitest";

import { analyzeRetainedTestCost } from "../../src/lib/test-cost/comparison.js";
import type { RetainedTestCostRun } from "../../src/lib/test-cost/run.js";

function run(valueMs: number, workerSizing: string = "12"): RetainedTestCostRun {
  return {
    schemaVersion: 4,
    outcome: "passed",
    unhandledErrorCount: 0,
    capturedAt: "2026-09-11T00:00:00.000Z",
    requestedWorkerSizing: workerSizing,
    mode: { condition: "tier-isolated", projectSet: "lane", workerSizing },
    wallClockMs: valueMs,
    summedFileTimeMs: valueMs,
    fileCount: 1,
    testCount: 1,
    cliSpawnCount: 0,
    substrate: { durationMs: 0, shareFraction: 0, files: [] },
    files: [{
      path: "a.test.ts",
      tier: "unit",
      environmentSetupDurationMs: 0,
      prepareDurationMs: 0,
      collectDurationMs: 0,
      setupDurationMs: 0,
      fixedCostMs: 0,
      testTimeMs: valueMs,
      executionDurationMs: valueMs,
      durationMs: valueMs,
      tests: [{
        id: "a",
        name: "a",
        durationMs: valueMs,
        vitestTimeoutMs: 5_000,
        timeoutCeilingMs: 5_000,
        headroomMs: 5_000 - valueMs,
        headroomFraction: (5_000 - valueMs) / 5_000,
      }],
    }],
  };
}

describe("analyzeRetainedTestCost", () => {
  it("normalizes a same-mode lever and classifies its noise", () => {
    expect(analyzeRetainedTestCost({
      kind: "lever",
      before: [run(100), run(110), run(120)],
      after: [run(100), run(105), run(110)],
    })).toMatchObject({
      kind: "lever",
      before: { normalization: "median", wallClockMs: 110 },
      after: { normalization: "median", wallClockMs: 105 },
      comparison: {
        kind: "measured",
        wallClockMs: {
          deltaMs: -5,
          noise: { status: "unestablished", noiseBandFraction: 0.1 },
        },
        summedFileTimeMs: {
          deltaMs: -5,
          noise: { status: "unestablished", noiseBandFraction: 0.1 },
        },
      },
    });
  });

  it("refuses a lever whose normalized modes differ", () => {
    const after = run(80);
    const mismatched = {
      ...after,
      mode: { ...after.mode, condition: "under-load" as const },
    };

    expect(analyzeRetainedTestCost({
      kind: "lever",
      before: [run(100)],
      after: [mismatched],
    })).toMatchObject({
      kind: "lever",
      comparison: { kind: "refused", mismatches: ["condition"] },
    });
  });

  it("reports deliberate worker variation as a noise-classified sizing sweep", () => {
    expect(analyzeRetainedTestCost({
      kind: "sizing-sweep",
      groups: [[run(100, "6")], [run(80, "12")]],
    })).toMatchObject({
      kind: "sizing-sweep",
      wallClockMs: {
        points: [
          { mode: { workerSizing: "6" }, valueMs: 100 },
          {
            mode: { workerSizing: "12" },
            valueMs: 80,
            deltaFromFirst: {
              deltaMs: -20,
              noise: { status: "established", noiseBandFraction: 0.1 },
            },
          },
        ],
      },
    });
  });
});
