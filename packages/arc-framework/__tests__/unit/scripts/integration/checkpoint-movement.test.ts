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

  /**
   * The classifier this plan reads flattens an ambiguous base, an unrelated one and a failed read into one
   * token, so all three took the answer that fits only the last: a rerun. The cause is what tells them apart,
   * and it splits them three ways rather than two — only the ambiguous pair is one the reconcile can reach.
   */
  it("reconciles a base sharing more than one merge base with the branch", () => {
    expect(plan({ movement: "unknown", movementCause: "ambiguous" })).toEqual({
      state: "reconcile",
      nextAction: "reconcile-base",
    });
  });

  it("refuses a base sharing no history with the branch rather than reconciling it", () => {
    // Git declines to join unrelated histories unless told to, and the append-only reconcile never tells it to.
    expect(plan({ movement: "unknown", movementCause: "unrelated" })).toMatchObject({
      state: "blocked",
      reason: "base-unrelated",
    });
  });

  it("refuses an absent ancestor whether or not the evidence would authorize a reconcile", () => {
    // The evidence bar decides which reconcile runs; here there is no reconcile to authorize either way.
    for (const integrationEvidenceComplete of [true, false]) {
      expect(plan({ movement: "unknown", movementCause: "unrelated", integrationEvidenceComplete }))
        .toMatchObject({ state: "blocked", reason: "base-unrelated" });
    }
  });

  it("holds an ambiguous base to the same evidence bar as any other reconciliation", () => {
    expect(plan({
      movement: "unknown",
      movementCause: "ambiguous",
      integrationEvidenceComplete: false,
    })).toMatchObject({ state: "blocked", reason: "unsafe-reconcile" });
  });

  /**
   * The evidence bar was the only one this arm met, because it answered above the readings the arms below it
   * are held to. A pair leaving two ancestors still merges the base in to clear itself, and that merge is as
   * capable of conflicting, or of being refused admission, as any other — so it is held to the same readings.
   */
  it.each([
    [
      "a conflict the merge would leave the operator to resolve",
      { feasibility: { state: "substantive-conflict", ...coordinates, paths: ["src/x.ts"] } },
      { state: "blocked", reason: "conflict", paths: ["src/x.ts"] },
    ],
    [
      "a feasibility reading that did not complete",
      { feasibility: { state: "unavailable", ...coordinates, detail: "Git unavailable." } },
      { state: "blocked", reason: "unsafe-reconcile", detail: "Git unavailable." },
    ],
    [
      "a host that has not answered",
      { admission: { state: "unresolved", ...admissionCoordinates, detail: "Host computing." } },
      { state: "blocked", reason: "host-pending", detail: "Host computing." },
    ],
    [
      "a host that refused",
      { admission: { state: "refused", ...admissionCoordinates, detail: "Policy refusal." } },
      { state: "blocked", reason: "host-refused", detail: "Policy refusal." },
    ],
  ])("stops an ambiguous base at %s, as it stops any other reconciliation", (_label, overrides, expected) => {
    expect(plan({ movement: "unknown", movementCause: "ambiguous", ...overrides })).toMatchObject(expected);
  });

  it.each([
    { movement: "unknown" },
    { movement: "unknown", movementCause: "unavailable" },
    { feasibility: { state: "unavailable", ...coordinates, detail: "Git unavailable." } },
    { feasibility: { state: "clean", base: oid("c"), head: coordinates.head } },
    { admission: { state: "mergeable", ...admissionCoordinates, head: oid("c") } },
  ])("fails closed for unknown, unavailable, or mismatched evidence %#", (overrides) => {
    expect(plan(overrides)).toMatchObject({ state: "blocked", reason: "unsafe-reconcile" });
  });
});
