/** Unit coverage for detailed retained-run normalization. */

import { describe, expect, it } from "vitest";

import { normalizeRetainedTestCostRuns } from "../../src/lib/test-cost/retained.js";
import type { RetainedTestCostRun } from "../../src/lib/test-cost/run.js";

function run(durationMs: number, waitMs?: number): RetainedTestCostRun {
  const file = {
    path: "a.test.ts",
    tier: "unit",
    collectDurationMs: 10,
    setupDurationMs: 10,
    fixedCostMs: 20,
    testTimeMs: durationMs - 20,
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
    schemaVersion: 1,
    capturedAt: "2026-09-11T00:00:00.000Z",
    mode: { condition: "tier-isolated", projectSet: "unit", workerSizing: "12" },
    wallClockMs: durationMs,
    summedFileTimeMs: durationMs,
    fileCount: 1,
    testCount: 1,
    ...(waitMs === undefined ? {} : { admissionWaitMs: waitMs }),
    substrate: { durationMs: 0, shareFraction: 0, files: [] },
    files: [file],
  };
}

describe("normalizeRetainedTestCostRuns", () => {
  it("normalizes summary, files, substrate, and observed waits by median", () => {
    expect(normalizeRetainedTestCostRuns([run(90), run(100, 30), run(110, 50)]))
      .toMatchObject({
        summary: { sampleCount: 3, normalization: "median", wallClockMs: 100 },
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
});
