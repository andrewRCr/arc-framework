/**
 * Tests for the two-shape assertion used where a behavior is known to be wrong.
 */

import { describe, expect, it } from "vitest";

import { expectPinnedObservation } from "../../helpers/pinned-observation.js";

const BEHAVIOR = "an advance touching no path the branch changed leaves the reconcile stop in place";

describe("holding a result that is known to be wrong", () => {
  it("accepts the result it holds", () => {
    expect(() =>
      expectPinnedObservation(
        { verdict: "reconcile", state: "behind", baseOid: "a".repeat(40) },
        { behavior: BEHAVIOR, observed: { verdict: "reconcile" }, target: { verdict: "clean" } },
      ),
    ).not.toThrow();
  });

  it("rejects a third result that is neither the one held nor the one awaited", () => {
    expect(() =>
      expectPinnedObservation(
        { verdict: "unavailable", state: "diverged" },
        { behavior: BEHAVIOR, observed: { verdict: "reconcile" }, target: { verdict: "clean" } },
      ),
    ).toThrow(/no longer describes what happens/u);
  });

  it("rejects the awaited result, asking for a plain assertion in its place", () => {
    expect(() =>
      expectPinnedObservation(
        { verdict: "clean", state: "synced" },
        { behavior: BEHAVIOR, observed: { verdict: "reconcile" }, target: { verdict: "clean" } },
      ),
    ).toThrow(/replace this call with a plain assertion/u);
  });
});

describe("naming the behavior under test", () => {
  // Each sentence cites something that organizes work rather than describing it; the citation is the
  // input under test, and the message has to hand it back so the author can see what to remove.
  it.each([
    ["a numbered unit of work", "Task 3.1 - the reconcile stop survives an advance", "Task 3.1"],
    ["a numbered grouping", "Phase 2 leaves the reconcile stop in place", "Phase 2"],
    ["a planning document", "the reconcile stop survives, per notes-sample-unit.md", "notes-sample-unit.md"],
    ["a numbered record entry", "row 14: the reconcile stop survives an advance", "row 14"],
  ])("refuses a sentence that cites %s", (_kind, behavior, cited) => {
    const call = (): void =>
      expectPinnedObservation(
        { verdict: "reconcile" },
        { behavior, observed: { verdict: "reconcile" }, target: { verdict: "clean" } },
      );

    expect(call).toThrow("describe what the code does");
    expect(call).toThrow(cited);
  });
});

describe("a result satisfying both shapes", () => {
  const drift = {
    verdict: "reconcile",
    state: "behind",
    overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
  };

  it("retires the hold when the awaited shape is the narrower one", () => {
    expect(() =>
      expectPinnedObservation(drift, {
        behavior: BEHAVIOR,
        observed: { verdict: "reconcile" },
        target: { verdict: "reconcile", overlap: { substantivePaths: [] } },
      }),
    ).toThrow(/replace this call with a plain assertion/u);
  });

  it("retires the hold when the held shape is the narrower one", () => {
    expect(() =>
      expectPinnedObservation(drift, {
        behavior: BEHAVIOR,
        observed: { verdict: "reconcile", state: "behind" },
        target: { verdict: "reconcile" },
      }),
    ).toThrow(/replace this call with a plain assertion/u);
  });
});

describe("shapes that cannot hold anything", () => {
  it("refuses a call that holds and awaits the same result", () => {
    expect(() =>
      expectPinnedObservation(
        { verdict: "reconcile" },
        { behavior: BEHAVIOR, observed: { verdict: "clean" }, target: { verdict: "clean" } },
      ),
    ).toThrow(/holds and awaits the same result/u);
  });

  it("refuses a shape naming an object id", () => {
    expect(() =>
      expectPinnedObservation(
        { verdict: "reconcile", baseOid: "b".repeat(40) },
        {
          behavior: BEHAVIOR,
          observed: { verdict: "reconcile", baseOid: "b".repeat(40) },
          target: { verdict: "clean" },
        },
      ),
    ).toThrow(/object id/u);
  });

  it("refuses a shape naming an object id nested in the result", () => {
    expect(() =>
      expectPinnedObservation(
        { verdict: "reconcile", register: { kind: "attention", oid: "c".repeat(12) } },
        {
          behavior: BEHAVIOR,
          observed: { verdict: "reconcile", register: { oid: "c".repeat(12) } },
          target: { verdict: "clean" },
        },
      ),
    ).toThrow(/object id/u);
  });
});
