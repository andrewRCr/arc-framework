/** Unit coverage for retained test-cost comparison request parsing. */

import { describe, expect, it } from "vitest";

import { parseTestCostComparisonRequest } from "../../src/lib/test-cost/comparison-request.js";

describe("parseTestCostComparisonRequest", () => {
  it("accepts lever and sizing-sweep path groups", () => {
    expect(parseTestCostComparisonRequest({
      kind: "lever",
      before: ["before-1.json", "before-2.json"],
      after: ["after-1.json", "after-2.json"],
    })).toEqual({
      kind: "lever",
      before: ["before-1.json", "before-2.json"],
      after: ["after-1.json", "after-2.json"],
    });

    expect(parseTestCostComparisonRequest({
      kind: "sizing-sweep",
      groups: [["50-1.json"], ["native-1.json"]],
    })).toMatchObject({ kind: "sizing-sweep", groups: [["50-1.json"], ["native-1.json"]] });
  });

  it("refuses empty, malformed, or undersized groups", () => {
    expect(() => parseTestCostComparisonRequest({
      kind: "lever",
      before: [],
      after: ["after.json"],
    })).toThrow(/non-empty/u);
    expect(() => parseTestCostComparisonRequest({
      kind: "sizing-sweep",
      groups: [["only.json"]],
    })).toThrow(/at least two/u);
    expect(() => parseTestCostComparisonRequest({ kind: "unknown" })).toThrow(/kind/u);
  });
});
