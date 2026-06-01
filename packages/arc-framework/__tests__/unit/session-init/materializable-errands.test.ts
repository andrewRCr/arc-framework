/**
 * Unit tests for materializable-errand detection — recognizing `chore/` remote
 * branches with no local worktree and no meta as cross-machine errands to
 * materialize (git worktree add → resume).
 */

import { describe, it, expect } from "vitest";

import {
  findMaterializableErrands,
  type RemoteErrandFacts,
} from "../../../src/lib/session-init/materializable-errands.js";

const facts = (over: Partial<RemoteErrandFacts> = {}): RemoteErrandFacts => ({
  branch: "chore/fix-typo",
  hasLocalWorktree: false,
  hasMeta: false,
  ...over,
});

describe("findMaterializableErrands", () => {
  it("recognizes a remote chore/ branch with no local worktree and no meta, extracting the slug", () => {
    const result = findMaterializableErrands({ branches: [facts()] });

    expect(result.candidates).toEqual([{ slug: "fix-typo", branch: "chore/fix-typo" }]);
  });

  it("excludes a branch already checked out locally (resume, not materialize)", () => {
    const result = findMaterializableErrands({ branches: [facts({ hasLocalWorktree: true })] });

    expect(result.candidates).toEqual([]);
  });

  it("excludes a branch with a backing meta (a work unit, not an errand)", () => {
    const result = findMaterializableErrands({ branches: [facts({ hasMeta: true })] });

    expect(result.candidates).toEqual([]);
  });

  it("excludes a non-chore remote branch", () => {
    const result = findMaterializableErrands({ branches: [facts({ branch: "feat/some-feature" })] });

    expect(result.candidates).toEqual([]);
  });

  it("evaluates each remote branch independently", () => {
    const result = findMaterializableErrands({
      branches: [
        facts({ branch: "chore/a" }),
        facts({ branch: "chore/b", hasLocalWorktree: true }),
        facts({ branch: "chore/c", hasMeta: true }),
        facts({ branch: "feat/d" }),
      ],
    });

    expect(result.candidates).toEqual([{ slug: "a", branch: "chore/a" }]);
  });

  it("returns no candidates for an empty branch set", () => {
    expect(findMaterializableErrands({ branches: [] }).candidates).toEqual([]);
  });
});
