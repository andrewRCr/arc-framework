import { describe, it, expect } from "vitest";

import {
  inferRecommendedSummaryLine,
  type SummaryLineInput,
} from "../../../src/lib/handoff/recommended-summary-line.js";

function input(overrides: Partial<SummaryLineInput> = {}): SummaryLineInput {
  return {
    context: "sync-skipped",
    worktreeState: "clean",
    ahead: 0,
    behind: 0,
    branch: "main",
    unpushedN: 0,
    ...overrides,
  };
}

describe("inferRecommendedSummaryLine", () => {
  it("composes Reconcile required for blocked-diverged on the sync envelope", () => {
    const result = inferRecommendedSummaryLine(input({
      context: "sync-ran",
      worktreeState: "diverged",
      ahead: 2,
      behind: 3,
      branch: "feature/foo",
    }));
    expect(result).toBe(
      "**Reconcile required:** `feature/foo` diverged from `origin/feature/foo` "
      + "(2 ahead, 3 behind). Manual rebase or merge needed before pushing.",
    );
  });

  it("composes the same Reconcile line when sync was skipped with diverged worktree", () => {
    const result = inferRecommendedSummaryLine(input({
      context: "sync-skipped",
      worktreeState: "diverged",
      ahead: 1,
      behind: 4,
      branch: "feature/bar",
    }));
    expect(result).toBe(
      "**Reconcile required:** `feature/bar` diverged from `origin/feature/bar` "
      + "(1 ahead, 4 behind). Manual rebase or merge needed before pushing.",
    );
  });

  it("composes Worktree unpushed for sync-skipped with N > 0", () => {
    const result = inferRecommendedSummaryLine(input({
      context: "sync-skipped",
      worktreeState: "local-ahead",
      ahead: 2,
      branch: "feature/baz",
      unpushedN: 3,
    }));
    expect(result).toBe("**Worktree:** 3 unpushed commit(s) on `feature/baz`.");
  });

  it("returns null for clean state with nothing to surface", () => {
    expect(inferRecommendedSummaryLine(input())).toBeNull();
  });

  it("returns null for identity-absent context when worktree is clean and nothing unpushed", () => {
    expect(inferRecommendedSummaryLine(input({
      context: "sync-skipped",
      worktreeState: "clean",
      unpushedN: 0,
    }))).toBeNull();
  });

  it("returns null on the sync envelope when the worktree is local-ahead (not the helper's surface)", () => {
    expect(inferRecommendedSummaryLine(input({
      context: "sync-ran",
      worktreeState: "local-ahead",
      ahead: 2,
      branch: "feature/foo",
      unpushedN: 2,
    }))).toBeNull();
  });

  it("returns null when branch is null even with diverged worktree", () => {
    expect(inferRecommendedSummaryLine(input({
      context: "sync-skipped",
      worktreeState: "diverged",
      ahead: 1,
      behind: 1,
      branch: null,
    }))).toBeNull();
  });

  it("returns null for sync-skipped with N=0 (nothing unpushed)", () => {
    expect(inferRecommendedSummaryLine(input({
      context: "sync-skipped",
      worktreeState: "local-ahead",
      ahead: 0,
      unpushedN: 0,
      branch: "main",
    }))).toBeNull();
  });
});
