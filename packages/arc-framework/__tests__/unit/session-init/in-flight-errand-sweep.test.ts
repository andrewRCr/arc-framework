/**
 * Unit tests for the in-flight-errand sweep — classifying caller-enumerated
 * `chore/` branches (meta-less errands) into in-progress / awaiting-merge /
 * merged-cleanup / stale, an orient-only advisory mirroring the stale-worktree
 * sweep.
 */

import { describe, it, expect } from "vitest";

import {
  classifyInFlightErrands,
  type InFlightErrandFacts,
} from "../../../src/lib/session-init/in-flight-errand-sweep.js";

const facts = (over: Partial<InFlightErrandFacts> = {}): InFlightErrandFacts => ({
  branch: "chore/fix-typo",
  hasMeta: false,
  hasOpenPr: false,
  merged: false,
  ageDays: 0,
  ...over,
});

describe("classifyInFlightErrands", () => {
  it("classifies a fresh chore/ branch with no PR as in-progress and extracts the slug", () => {
    const result = classifyInFlightErrands({ branches: [facts()], staleThresholdDays: 3 });

    expect(result.errands).toEqual([
      { slug: "fix-typo", branch: "chore/fix-typo", state: "in-progress", ageDays: 0 },
    ]);
  });

  it("classifies a chore/ branch with an open PR as awaiting-merge", () => {
    const result = classifyInFlightErrands({ branches: [facts({ hasOpenPr: true })], staleThresholdDays: 3 });

    expect(result.errands[0]?.state).toBe("awaiting-merge");
  });

  it("classifies a merged chore/ branch as merged-cleanup (merged precedes an open PR)", () => {
    const result = classifyInFlightErrands({
      branches: [facts({ merged: true, hasOpenPr: true })],
      staleThresholdDays: 3,
    });

    expect(result.errands[0]?.state).toBe("merged-cleanup");
  });

  it("classifies an aged in-progress chore/ branch past the threshold as stale", () => {
    const result = classifyInFlightErrands({ branches: [facts({ ageDays: 7 })], staleThresholdDays: 3 });

    expect(result.errands[0]).toEqual({
      slug: "fix-typo",
      branch: "chore/fix-typo",
      state: "stale",
      ageDays: 7,
    });
  });

  it("excludes a chore/ branch that has a backing meta (promoted errand → WU)", () => {
    const result = classifyInFlightErrands({ branches: [facts({ hasMeta: true })], staleThresholdDays: 3 });

    expect(result.errands).toEqual([]);
  });

  it("excludes a non-chore branch defensively", () => {
    const result = classifyInFlightErrands({
      branches: [facts({ branch: "feat/some-feature" })],
      staleThresholdDays: 3,
    });

    expect(result.errands).toEqual([]);
  });

  it("classifies each branch independently", () => {
    const result = classifyInFlightErrands({
      branches: [
        facts({ branch: "chore/a", ageDays: 0 }),
        facts({ branch: "chore/b", hasOpenPr: true }),
        facts({ branch: "chore/c", merged: true }),
        facts({ branch: "chore/d", ageDays: 9 }),
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
