/**
 * Unit tests for errand-resume detection — recognizing when the session's
 * current branch is an execution-only errand with no backing meta, the signal
 * session-init's resolution arm loads run-errand on. Identity resolves from the
 * errand records (a branch→slug index), with a branch-parse legacy fallback for
 * a record-less `chore/<slug>` branch.
 */

import { describe, it, expect } from "vitest";

import { detectErrandResume } from "../../../src/lib/session-init/errand-resume-detection.js";

/** Build a branch→slug index as the composer derives it from the errand records. */
function index(entries: Record<string, string> = {}): ReadonlyMap<string, string> {
  return new Map(Object.entries(entries));
}

describe("detectErrandResume", () => {
  it("resolves a record-backed branch as resumable, taking the slug from the record", () => {
    const result = detectErrandResume({
      currentBranch: "chore/fix-typo",
      hasBackingMeta: false,
      slugByBranch: index({ "chore/fix-typo": "fix-typo" }),
    });

    expect(result).toEqual({ resumable: true, slug: "fix-typo" });
  });

  it("resolves a nature-typed branch from the record, where a chore/ parse would fail", () => {
    const result = detectErrandResume({
      currentBranch: "refactor/extract-helper",
      hasBackingMeta: false,
      slugByBranch: index({ "refactor/extract-helper": "extract-helper" }),
    });

    expect(result).toEqual({ resumable: true, slug: "extract-helper" });
  });

  it("does not flag a record-backed branch once a meta backs it (promoted errand → WU)", () => {
    const result = detectErrandResume({
      currentBranch: "chore/fix-typo",
      hasBackingMeta: true,
      slugByBranch: index({ "chore/fix-typo": "fix-typo" }),
    });

    expect(result).toEqual({ resumable: false, slug: null });
  });

  it("degrades a record-less chore/ branch to the branch-derived slug", () => {
    const result = detectErrandResume({
      currentBranch: "chore/legacy",
      hasBackingMeta: false,
      slugByBranch: index(),
    });

    expect(result).toEqual({ resumable: true, slug: "legacy" });
  });

  it("does not flag a record-less non-chore work-unit branch", () => {
    const result = detectErrandResume({
      currentBranch: "feat/some-feature",
      hasBackingMeta: false,
      slugByBranch: index(),
    });

    expect(result).toEqual({ resumable: false, slug: null });
  });

  it("does not flag a detached HEAD (null branch)", () => {
    const result = detectErrandResume({
      currentBranch: null,
      hasBackingMeta: false,
      slugByBranch: index(),
    });

    expect(result).toEqual({ resumable: false, slug: null });
  });

  it("does not flag a record-less bare `chore/` prefix with an empty slug", () => {
    const result = detectErrandResume({
      currentBranch: "chore/",
      hasBackingMeta: false,
      slugByBranch: index(),
    });

    expect(result).toEqual({ resumable: false, slug: null });
  });

  it("preserves a multi-segment slug from a record-less chore/ branch fallback", () => {
    const result = detectErrandResume({
      currentBranch: "chore/fix/nested-typo",
      hasBackingMeta: false,
      slugByBranch: index(),
    });

    expect(result).toEqual({ resumable: true, slug: "fix/nested-typo" });
  });
});
