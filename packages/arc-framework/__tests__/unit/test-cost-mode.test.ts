/** Unit coverage for complete cost-measurement modes and comparison guards. */

import { describe, expect, it } from "vitest";

import {
  compareLever,
  createMeasurementMode,
  createSizingSweep,
  type ComparableCost,
  type MeasurementMode,
} from "../../src/lib/test-cost/mode.js";

const MODE: MeasurementMode = {
  condition: "tier-isolated",
  projectSet: "integration",
  workerSizing: "12",
};

function cost(valueMs: number, mode: MeasurementMode = MODE): ComparableCost {
  return { mode, valueMs };
}

describe("measurement mode", () => {
  it("requires an explicit condition, project set, and worker sizing", () => {
    expect(createMeasurementMode(MODE)).toEqual(MODE);
    expect(() => createMeasurementMode({ ...MODE, condition: undefined })).toThrow(/condition/u);
    expect(() => createMeasurementMode({ ...MODE, projectSet: undefined })).toThrow(/project set/u);
    expect(() => createMeasurementMode({ ...MODE, workerSizing: undefined })).toThrow(/worker sizing/u);
  });

  it("reports a lever delta only for identical modes", () => {
    expect(compareLever(cost(100), cost(80))).toEqual({
      kind: "measured",
      deltaMs: -20,
      deltaFraction: -0.2,
    });
  });

  it.each([
    ["condition", { condition: "under-load" }],
    ["projectSet", { projectSet: "lane" }],
    ["workerSizing", { workerSizing: "6" }],
  ] as const)("refuses a lever claim when %s differs", (axis, change) => {
    const afterMode = { ...MODE, ...change } as MeasurementMode;
    expect(compareLever(cost(100), cost(80, afterMode))).toEqual({
      kind: "refused",
      mismatches: [axis],
    });
  });

  it("refuses a mismatched mode before evaluating a zero baseline percentage", () => {
    expect(compareLever(cost(0), cost(80, { ...MODE, workerSizing: "6" }))).toEqual({
      kind: "refused",
      mismatches: ["workerSizing"],
    });
    expect(() => compareLever(cost(0), cost(80))).toThrow(/zero before value/u);
  });

  it("treats deliberate worker variation as a sizing sweep, not a lever claim", () => {
    expect(createSizingSweep([
      cost(100, { ...MODE, workerSizing: "6" }),
      cost(80, { ...MODE, workerSizing: "12" }),
    ])).toEqual({
      kind: "sizing-sweep",
      points: [
        cost(100, { ...MODE, workerSizing: "6" }),
        cost(80, { ...MODE, workerSizing: "12" }),
      ],
    });
  });
});
