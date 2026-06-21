/**
 * Unit tests for materializable-errand detection — filtering the oracle's
 * in-flight entries to the remote-only errands session-init offers to
 * materialize (git worktree add → run-errand resume), with identity (slug)
 * resolved from the errand records and a branch-derived legacy fallback.
 */

import { describe, it, expect } from "vitest";

import type {
  InFlightErrand,
  InFlightWorkUnit,
} from "../../../src/lib/git/in-flight-derivation.js";
import { findMaterializableErrands } from "../../../src/lib/session-init/materializable-errands.js";

const errand = (over: Partial<InFlightErrand> = {}): InFlightErrand => ({
  kind: "errand",
  slug: "fix-typo",
  branch: "chore/fix-typo",
  remoteOnly: true,
  ...over,
});

const wu = (over: Partial<InFlightWorkUnit> = {}): InFlightWorkUnit => ({
  kind: "work-unit",
  name: "feature-x",
  branch: "feat/feature-x",
  state: "Active",
  remoteOnly: true,
  dependsOn: [],
  ...over,
});

/** Build a branch→slug index as the composer derives it from the errand records. */
function index(entries: Record<string, string> = {}): ReadonlyMap<string, string> {
  return new Map(Object.entries(entries));
}

describe("findMaterializableErrands", () => {
  it("selects a remote-only errand, taking the slug from the record", () => {
    const result = findMaterializableErrands({
      entries: [errand({ branch: "chore/fix-typo" })],
      slugByBranch: index({ "chore/fix-typo": "fix-typo" }),
    });

    expect(result.candidates).toEqual([{ slug: "fix-typo", branch: "chore/fix-typo" }]);
  });

  it("resolves a nature-typed remote-only errand from the record", () => {
    const result = findMaterializableErrands({
      entries: [errand({ slug: "extract-helper", branch: "refactor/extract-helper" })],
      slugByBranch: index({ "refactor/extract-helper": "extract-helper" }),
    });

    expect(result.candidates).toEqual([{ slug: "extract-helper", branch: "refactor/extract-helper" }]);
  });

  it("degrades a record-less remote-only chore/ errand to its branch-derived slug", () => {
    const result = findMaterializableErrands({
      entries: [errand({ slug: "legacy", branch: "chore/legacy" })],
      slugByBranch: index(),
    });

    expect(result.candidates).toEqual([{ slug: "legacy", branch: "chore/legacy" }]);
  });

  it("excludes an errand checked out locally (remoteOnly false → a resume, not a materialize)", () => {
    const result = findMaterializableErrands({
      entries: [errand({ remoteOnly: false, worktreePath: "/repos/x" })],
      slugByBranch: index({ "chore/fix-typo": "fix-typo" }),
    });

    expect(result.candidates).toEqual([]);
  });

  it("excludes work-unit entries (only errands are materialize-errand candidates)", () => {
    expect(findMaterializableErrands({ entries: [wu()], slugByBranch: index() }).candidates).toEqual([]);
  });

  it("evaluates each entry independently", () => {
    const result = findMaterializableErrands({
      entries: [
        errand({ slug: "a", branch: "chore/a" }),
        errand({ slug: "b", branch: "chore/b", remoteOnly: false, worktreePath: "/wt/b" }),
        wu(),
      ],
      slugByBranch: index({ "chore/a": "a" }),
    });

    expect(result.candidates).toEqual([{ slug: "a", branch: "chore/a" }]);
  });

  it("returns no candidates for an empty entry set", () => {
    expect(findMaterializableErrands({ entries: [], slugByBranch: index() }).candidates).toEqual([]);
  });
});
