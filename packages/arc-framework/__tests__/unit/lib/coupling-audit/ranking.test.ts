import { describe, expect, it } from "vitest";

import {
  compareRankedClasses,
  rankResolvedClass,
} from "../../../../src/lib/coupling-audit/ranking.js";
import type { SurfaceKind } from "../../../../src/lib/coupling-audit/types.js";

const thresholds: Record<SurfaceKind, number> = {
  test: 25,
  code: 13,
  workflow: 8,
  template: 2,
  prose: 20,
  config: 3,
};

function counts(overrides: Partial<Record<SurfaceKind, number>> = {}): Record<SurfaceKind, number> {
  return { test: 0, code: 0, workflow: 0, template: 0, prose: 0, config: 0, ...overrides };
}

describe("coupling-audit ranking", () => {
  it.each([
    ["high", true, "abstract"],
    ["high", false, "change-with-mover"],
    ["stable", true, "leave-alone"],
    ["stable", false, "retain-local"],
  ] as const)("maps %s volatility and high=%s to %s", (volatility, high, verdict) => {
    const result = rankResolvedClass(
      { classId: "sample", volatility, fanOut: high ? 13 : 1, surfaceCounts: counts({ code: high ? 13 : 1 }) },
      thresholds,
    );
    expect(result.verdict).toBe(verdict);
  });

  it("treats threshold equality as high and uses the maximum mixed-surface ratio", () => {
    const result = rankResolvedClass(
      { classId: "mixed", volatility: "high", fanOut: 33, surfaceCounts: counts({ code: 13, prose: 30 }) },
      thresholds,
    );
    expect(result).toMatchObject({ highFanOut: true, maxThresholdRatio: 1.5, verdict: "abstract" });
  });

  it("orders by verdict, ratio, fan-out, then class ID", () => {
    const ranked = [
      rankResolvedClass(
        { classId: "z-low", volatility: "high", fanOut: 2, surfaceCounts: counts({ code: 2 }) },
        thresholds,
      ),
      rankResolvedClass(
        { classId: "z-high", volatility: "high", fanOut: 20, surfaceCounts: counts({ code: 13 }) },
        thresholds,
      ),
      rankResolvedClass(
        { classId: "a-high", volatility: "high", fanOut: 20, surfaceCounts: counts({ code: 13 }) },
        thresholds,
      ),
      rankResolvedClass(
        { classId: "ratio", volatility: "high", fanOut: 14, surfaceCounts: counts({ code: 14 }) },
        thresholds,
      ),
    ].sort(compareRankedClasses);
    expect(ranked.map((entry) => entry.classId)).toEqual(["ratio", "a-high", "z-high", "z-low"]);
  });

  it("rejects missing thresholds and unresolved volatility", () => {
    expect(() =>
      rankResolvedClass(
        { classId: "missing", volatility: "high", fanOut: 1, surfaceCounts: counts({ code: 1 }) },
        { ...thresholds, code: undefined } as unknown as Record<SurfaceKind, number>,
      ),
    ).toThrow("thresholds.code");
    expect(() =>
      rankResolvedClass(
        { classId: "unresolved", volatility: "unresolved", fanOut: 1, surfaceCounts: counts({ code: 1 }) },
        thresholds,
      ),
    ).toThrow("unresolved volatility");
  });
});
