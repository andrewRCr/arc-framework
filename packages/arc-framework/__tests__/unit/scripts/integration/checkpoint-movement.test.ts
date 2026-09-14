import { describe, expect, it } from "vitest";

import { composeCheckpointMovementPlan } from "../../../../src/scripts/integration/checkpoint.js";

const oid = (character: string): string => character.repeat(40);
const coordinates = { base: oid("a"), head: oid("b") };
const admissionCoordinates = {
  repository: "owner/repo",
  changeRequest: 42,
  ...coordinates,
};

function plan(overrides: Record<string, unknown> = {}) {
  return composeCheckpointMovementPlan({
    movement: "disjoint",
    integrationEvidenceComplete: true,
    feasibility: { state: "clean", ...coordinates },
    admission: { state: "mergeable", ...admissionCoordinates },
    ...overrides,
  });
}

describe("checkpoint movement plan", () => {
  it("lets exact disjoint clean mergeability proceed without reconciliation", () => {
    expect(plan()).toEqual({ state: "proceed" });
  });

  it("requires complete evidence before overlapping base reconciliation", () => {
    expect(plan({ movement: "overlapping" })).toEqual({
      state: "reconcile", nextAction: "reconcile-base",
    });
    expect(plan({ movement: "overlapping", integrationEvidenceComplete: false })).toMatchObject({
      state: "blocked", reason: "unsafe-reconcile",
    });
  });

  it("routes an exact regenerable-only conflict to its distinct remedy", () => {
    expect(plan({
      feasibility: { state: "regenerable-conflict", ...coordinates, paths: ["ROADMAP.md"] },
    })).toEqual({ state: "reconcile", nextAction: "reconcile-regenerable" });
  });

  it("maps strict-currentness policy to the applicable reconcile arm", () => {
    const admission = {
      state: "base-currentness-required",
      ...admissionCoordinates,
      detail: "Current base required.",
    };
    expect(plan({ admission })).toEqual({ state: "reconcile", nextAction: "reconcile-base" });
    expect(plan({
      admission,
      feasibility: { state: "regenerable-conflict", ...coordinates, paths: ["ROADMAP.md"] },
    })).toEqual({ state: "reconcile", nextAction: "reconcile-regenerable" });
  });

  it("preserves conflict, host-pending, and host-refusal causes", () => {
    expect(plan({
      feasibility: { state: "substantive-conflict", ...coordinates, paths: ["src/x.ts"] },
    })).toMatchObject({ state: "blocked", reason: "conflict", paths: ["src/x.ts"] });
    expect(plan({
      admission: { state: "unresolved", ...admissionCoordinates, detail: "Host computing." },
    })).toEqual({ state: "blocked", reason: "host-pending", detail: "Host computing." });
    expect(plan({
      admission: { state: "refused", ...admissionCoordinates, detail: "Policy refusal." },
    })).toEqual({ state: "blocked", reason: "host-refused", detail: "Policy refusal." });
  });

  it.each([
    { movement: "unknown" },
    { feasibility: { state: "unavailable", ...coordinates, detail: "Git unavailable." } },
    { feasibility: { state: "clean", base: oid("c"), head: coordinates.head } },
    { admission: { state: "mergeable", ...admissionCoordinates, head: oid("c") } },
  ])("fails closed for unknown, unavailable, or mismatched evidence %#", (overrides) => {
    expect(plan(overrides)).toMatchObject({ state: "blocked", reason: "unsafe-reconcile" });
  });
});
