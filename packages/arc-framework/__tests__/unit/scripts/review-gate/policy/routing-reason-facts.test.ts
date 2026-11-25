/** Tracing a routing difference back to the change-set facts a caller can correct. */

import { describe, expect, it } from "vitest";

import {
  routingInputDiagnostics,
  routingReasonDifference,
} from "../../../../../src/scripts/review-gate/policy/routing-reason-facts.js";

describe("routingReasonDifference", () => {
  it("names the facts behind reasons only one routing carries, in canonical order", () => {
    expect(routingReasonDifference(["sensitive-change-set", "frontline-inactive"], ["frontline-inactive", "routine-code"]))
      .toEqual({ facts: ["contentKind", "reviewRisk"], unestablished: null, repositoryReasons: [] });
  });

  it.each([
    ["prepared", ["unknown-change-set"], ["routine-code"]],
    ["current", ["routine-code"], ["unknown-change-set"]],
  ] as const)("marks the %s routing as the unestablished one", (side, prepared, current) => {
    expect(routingReasonDifference(prepared, current))
      .toEqual({ facts: ["contentKind", "reviewRisk"], unestablished: side, repositoryReasons: [] });
  });

  it("leaves method activity, frontline selection, and project reasons to the repository", () => {
    expect(routingReasonDifference(["routine-code", "self-review-inactive"], ["routine-code", "project:promoted"]))
      .toEqual({ facts: [], unestablished: null, repositoryReasons: ["project:promoted", "self-review-inactive"] });
  });

  it("finds nothing between routings that carry the same reasons", () => {
    expect(routingReasonDifference(["routine-code", "frontline-inactive"], ["frontline-inactive", "routine-code"]))
      .toEqual({ facts: [], unestablished: null, repositoryReasons: [] });
  });
});

describe("routingInputDiagnostics", () => {
  it("reports each rejected or missing routing input as its own diagnostic", () => {
    expect(routingInputDiagnostics(["contentKind", "reviewRisk"])).toEqual([
      { code: "routing-input-rejected", message: "Rejected or missing routing input: contentKind" },
      { code: "routing-input-rejected", message: "Rejected or missing routing input: reviewRisk" },
    ]);
  });
});
