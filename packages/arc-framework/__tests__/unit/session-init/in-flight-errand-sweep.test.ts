/**
 * Unit tests for the in-flight-errand sweep — classifying caller-enumerated
 * errand branches (identity resolved from the record, carried as the fact's
 * slug) into in-progress / awaiting-merge / merged-cleanup / stale, an
 * orient-only advisory mirroring the stale-worktree sweep.
 */

import { describe, it, expect } from "vitest";

import {
  classifyInFlightErrands,
  type InFlightErrandFacts,
} from "../../../src/lib/session-init/in-flight-errand-sweep.js";

const facts = (over: Partial<InFlightErrandFacts> = {}): InFlightErrandFacts => ({
  slug: "fix-typo",
  branch: "chore/fix-typo",
  hasOpenPr: false,
  merged: false,
  ageDays: 0,
  ...over,
});

describe("classifyInFlightErrands", () => {
  it("classifies a fresh errand with no PR as in-progress, carrying its record slug", () => {
    const result = classifyInFlightErrands({ branches: [facts()], staleThresholdDays: 3 });

    expect(result.errands).toEqual([
      { slug: "fix-typo", branch: "chore/fix-typo", state: "in-progress", ageDays: 0 },
    ]);
  });

  it("classifies a nature-typed errand branch by its record slug", () => {
    const result = classifyInFlightErrands({
      branches: [facts({ slug: "extract-helper", branch: "refactor/extract-helper" })],
      staleThresholdDays: 3,
    });

    expect(result.errands).toEqual([
      { slug: "extract-helper", branch: "refactor/extract-helper", state: "in-progress", ageDays: 0 },
    ]);
  });

  it("classifies an errand with an open PR as awaiting-merge", () => {
    const result = classifyInFlightErrands({ branches: [facts({ hasOpenPr: true })], staleThresholdDays: 3 });

    expect(result.errands[0]?.state).toBe("awaiting-merge");
  });

  it("classifies a merged errand as merged-cleanup (merged precedes an open PR)", () => {
    const result = classifyInFlightErrands({
      branches: [facts({ merged: true, hasOpenPr: true })],
      staleThresholdDays: 3,
    });

    expect(result.errands[0]?.state).toBe("merged-cleanup");
  });

  it("classifies an aged in-progress errand past the threshold as stale", () => {
    const result = classifyInFlightErrands({ branches: [facts({ ageDays: 7 })], staleThresholdDays: 3 });

    expect(result.errands[0]).toEqual({
      slug: "fix-typo",
      branch: "chore/fix-typo",
      state: "stale",
      ageDays: 7,
    });
  });

  it("classifies each branch independently", () => {
    const result = classifyInFlightErrands({
      branches: [
        facts({ slug: "a", branch: "chore/a", ageDays: 0 }),
        facts({ slug: "b", branch: "chore/b", hasOpenPr: true }),
        facts({ slug: "c", branch: "chore/c", merged: true }),
        facts({ slug: "d", branch: "chore/d", ageDays: 9 }),
      ],
      staleThresholdDays: 3,
    });

    expect(result.errands.map((e) => [e.slug, e.state])).toEqual([
      ["a", "in-progress"],
      ["b", "awaiting-merge"],
      ["c", "merged-cleanup"],
      ["d", "stale"],
    ]);
  });

  it("returns no errands for an empty branch set", () => {
    expect(classifyInFlightErrands({ branches: [], staleThresholdDays: 3 }).errands).toEqual([]);
  });
});
