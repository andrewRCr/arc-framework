/**
 * Unit tests for materializable-errand detection — filtering the oracle's
 * in-flight entries to the remote-only `chore/` errands session-init offers to
 * materialize (git worktree add → run-errand resume).
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

describe("findMaterializableErrands", () => {
  it("selects a remote-only errand entry as a candidate, carrying slug + branch", () => {
    expect(findMaterializableErrands({ entries: [errand()] }).candidates).toEqual([
      { slug: "fix-typo", branch: "chore/fix-typo" },
    ]);
  });

  it("excludes an errand checked out locally (remoteOnly false → a resume, not a materialize)", () => {
    const result = findMaterializableErrands({
      entries: [errand({ remoteOnly: false, worktreePath: "/repos/x" })],
    });

    expect(result.candidates).toEqual([]);
  });

  it("excludes work-unit entries (only errands are materialize-errand candidates)", () => {
    expect(findMaterializableErrands({ entries: [wu()] }).candidates).toEqual([]);
  });

  it("evaluates each entry independently", () => {
    const result = findMaterializableErrands({
      entries: [
        errand({ slug: "a", branch: "chore/a" }),
        errand({ slug: "b", branch: "chore/b", remoteOnly: false, worktreePath: "/wt/b" }),
        wu(),
      ],
    });

    expect(result.candidates).toEqual([{ slug: "a", branch: "chore/a" }]);
  });

  it("returns no candidates for an empty entry set", () => {
    expect(findMaterializableErrands({ entries: [] }).candidates).toEqual([]);
  });
});
