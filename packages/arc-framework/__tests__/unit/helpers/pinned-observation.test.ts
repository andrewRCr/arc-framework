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

describe("shapes that name no fields", () => {
  // An empty shape is satisfied by every object, so a call carrying one reads as a hold while asserting
  // nothing at all. It is refused on either side rather than left to pass or to claim a spurious retirement.
  it("refuses a held shape naming no fields", () => {
    expect(() =>
      expectPinnedObservation(
        { verdict: "anything at all", state: "unrelated" },
        { behavior: BEHAVIOR, observed: {}, target: { verdict: "clean" } },
      ),
    ).toThrow(/`observed` shape names no fields/u);
  });

  it("refuses an awaited shape naming no fields", () => {
    expect(() =>
      expectPinnedObservation(
        { verdict: "reconcile" },
        { behavior: BEHAVIOR, observed: { verdict: "reconcile" }, target: {} },
      ),
    ).toThrow(/`target` shape names no fields/u);
  });

  it("refuses a nested shape naming no fields", () => {
    expect(() =>
      expectPinnedObservation(
        { verdict: "reconcile", overlap: { status: "available" } },
        { behavior: BEHAVIOR, observed: { verdict: "reconcile", overlap: {} }, target: { verdict: "clean" } },
      ),
    ).toThrow(/`observed` shape names no fields/u);
  });
});

describe("an object id carried inside a longer value", () => {
  it("refuses a sentence that quotes one", () => {
    expect(() =>
      expectPinnedObservation(
        { verdict: "reconcile", detail: "the base moved to 05594cf3 while the window was open" },
        {
          behavior: BEHAVIOR,
          observed: { verdict: "reconcile", detail: "the base moved to 05594cf3 while the window was open" },
          target: { verdict: "clean" },
        },
      ),
    ).toThrow(/object id/u);
  });

  it("refuses one carried in a path list", () => {
    expect(() =>
      expectPinnedObservation(
        { verdict: "reconcile", paths: ["src/a.ts"] },
        {
          behavior: BEHAVIOR,
          observed: { verdict: "reconcile", paths: ["05594cf3abc1"] },
          target: { verdict: "clean" },
        },
      ),
    ).toThrow(/object id/u);
  });

  it("refuses one named only by the awaited shape", () => {
    expect(() =>
      expectPinnedObservation(
        { verdict: "reconcile" },
        { behavior: BEHAVIOR, observed: { verdict: "reconcile" }, target: { verdict: "d".repeat(40) } },
      ),
    ).toThrow(/object id/u);
  });

  // A run of hex spelled only from `a` to `f` is an ordinary word far more often than an object id, so a
  // sentence carrying one is left alone rather than refused on a coincidence.
  it("accepts a sentence whose only hex-shaped run spells a word", () => {
    expect(() =>
      expectPinnedObservation(
        { verdict: "reconcile", detail: "the regenerable surface was defaced by the advance" },
        {
          behavior: BEHAVIOR,
          observed: { verdict: "reconcile", detail: "the regenerable surface was defaced by the advance" },
          target: { verdict: "clean" },
        },
      ),
    ).not.toThrow();
  });
});

describe("comparing list-valued and non-object results", () => {
  it("rejects a list of a different length", () => {
    expect(() =>
      expectPinnedObservation(
        { verdict: "reconcile", paths: ["src/a.ts", "src/b.ts"] },
        {
          behavior: BEHAVIOR,
          observed: { verdict: "reconcile", paths: ["src/a.ts"] },
          target: { verdict: "clean" },
        },
      ),
    ).toThrow(/no longer describes what happens/u);
  });

  it("rejects a list whose entries differ", () => {
    expect(() =>
      expectPinnedObservation(
        { verdict: "reconcile", paths: ["src/b.ts"] },
        {
          behavior: BEHAVIOR,
          observed: { verdict: "reconcile", paths: ["src/a.ts"] },
          target: { verdict: "clean" },
        },
      ),
    ).toThrow(/no longer describes what happens/u);
  });

  it("refuses a hold and an awaited result carrying equal lists", () => {
    expect(() =>
      expectPinnedObservation(
        { verdict: "reconcile", paths: ["src/a.ts"] },
        {
          behavior: BEHAVIOR,
          observed: { verdict: "clean", paths: ["src/a.ts"] },
          target: { verdict: "clean", paths: ["src/a.ts"] },
        },
      ),
    ).toThrow(/holds and awaits the same result/u);
  });

  it.each([
    ["nothing", null],
    ["a bare string", "reconcile"],
    ["a list", ["reconcile"]],
  ])("rejects a result that is %s rather than an object", (_kind, actual) => {
    expect(() =>
      expectPinnedObservation(actual, {
        behavior: BEHAVIOR,
        observed: { verdict: "reconcile" },
        target: { verdict: "clean" },
      }),
    ).toThrow(/no longer describes what happens/u);
  });
});
