import { describe, expect, it } from "vitest";

import { composeBaseDriftRegister } from "../../../src/lib/git/base-drift-register.js";
import type { IntegrationEvidence, OverlapEvidence } from "../../../src/lib/git/base-drift-types.js";

const complete: IntegrationEvidence = {
  coverage: "complete",
  scannedCommitCount: 1,
  events: [{ commits: ["a"], proof: "topology", slug: "sibling", prNumber: 7 }],
  unclassifiedCommitCount: 0,
  truncated: false,
  limitations: [],
};

describe("base-drift register composition", () => {
  it("uses calm only for complete evidence with no substantive overlap", () => {
    const overlap: OverlapEvidence = {
      status: "available", substantivePaths: [], regenerablePaths: ["ROADMAP"],
    };
    const result = composeBaseDriftRegister("main", 4, complete, overlap, "disjoint");
    expect(result.kind).toBe("calm");
    expect(result.text).toContain("1 sibling integration ahead");
    expect(result.text).toContain("Movement is disjoint.");
    expect(result.text).toContain("typed checkpoint decides whether integration proceeds, reconciles, or stops");
  });

  it("lets substantive contention lead and appends evidence degradation", () => {
    const integration: IntegrationEvidence = {
      coverage: "partial", scannedCommitCount: 1, events: [], unclassifiedCommitCount: 1,
      truncated: false, limitations: ["unclassified-commits"],
    };
    const overlap: OverlapEvidence = {
      status: "available",
      substantivePaths: ["a", "b", "c", "d"],
      regenerablePaths: [],
    };
    const result = composeBaseDriftRegister("main", 4, integration, overlap, "overlapping");
    expect(result.kind).toBe("attention");
    expect(result.text).toContain("`a`, `b`, `c`, and 1 more");
    expect(result.text).toContain("unclassified base movement");
    expect(result.text).toContain("Movement is overlapping.");
    expect(result.text).toContain("typed checkpoint decides whether integration proceeds, reconciles, or stops");
  });

  it("degrades when overlap could not be established", () => {
    const result = composeBaseDriftRegister(
      "main",
      2,
      complete,
      { status: "unavailable", reason: "merge-base-failed" },
      "unknown",
    );
    expect(result.kind).toBe("degraded");
    expect(result.text).toContain("overlap analysis was unavailable");
    expect(result.text).toContain("Movement is unknown.");
    expect(result.text).toContain("typed checkpoint decides whether integration proceeds, reconciles, or stops");
  });

  it("keeps disjoint movement explicit when integration evidence is incomplete", () => {
    const result = composeBaseDriftRegister(
      "main",
      2,
      {
        coverage: "partial", scannedCommitCount: 1, events: [], unclassifiedCommitCount: 1,
        truncated: false, limitations: ["unclassified-commits"],
      },
      { status: "available", substantivePaths: [], regenerablePaths: [] },
      "disjoint",
    );
    expect(result.kind).toBe("degraded");
    expect(result.text).toContain("Movement is disjoint.");
    expect(result.text).not.toContain("requires reconciliation before integration");
  });
});
