/** Unit coverage for retained-run normalization and the cost noise band. */

import { describe, expect, it } from "vitest";

import {
  classifyNoise,
  normalizeCostRuns,
  type CostRunSummary,
} from "../../src/lib/test-cost/normalize.js";

const mode = { condition: "tier-isolated", projectSet: "lane", workerSizing: "12" } as const;

function run(wallClockMs: number, summedFileTimeMs: number): CostRunSummary {
  return { mode, wallClockMs, summedFileTimeMs, fileCount: 10, testCount: 20 };
}

describe("normalizeCostRuns", () => {
  it("reports the median of several retained runs as normalized", () => {
    expect(normalizeCostRuns([run(110, 310), run(90, 290), run(100, 300)])).toEqual({
      mode,
      sampleCount: 3,
      normalization: "median",
      wallClockMs: 100,
      summedFileTimeMs: 300,
      fileCount: 10,
      testCount: 20,
    });
  });

  it("labels one retained run as single rather than normalized", () => {
    expect(normalizeCostRuns([run(100, 300)])).toMatchObject({
      sampleCount: 1,
      normalization: "single-run",
    });
  });

  it("refuses to normalize unlike modes", () => {
    expect(() => normalizeCostRuns([
      run(100, 300),
      { ...run(90, 290), mode: { ...mode, workerSizing: "6" } },
    ])).toThrow(/worker sizing/u);
  });
});

describe("classifyNoise", () => {
  it("flags a delta inside ten percent as unestablished", () => {
    expect(classifyNoise(-0.08)).toMatchObject({ status: "unestablished" });
  });

  it("does not flag a delta clearly outside ten percent", () => {
    expect(classifyNoise(-0.15)).toMatchObject({ status: "established" });
  });

  it("treats the exact boundary as established", () => {
    expect(classifyNoise(0.1)).toMatchObject({ status: "established" });
  });
});
