/**
 * Unit tests for worktree location-template resolution.
 *
 * Covers template expansion ({repo} / {branch}), branch slugging (path
 * separators -> `-`), override templates, and the creation-time-artifact
 * contract — resolution is a pure function of its inputs, so a later branch
 * rename never recomputes or moves an already-created worktree.
 */

import { describe, it, expect } from "vitest";

import { resolveWorktreeLocation } from "../../../src/lib/git/worktree-location.js";

describe("resolveWorktreeLocation", () => {
  it("resolves the default template, slugging branch separators to '-'", () => {
    const path = resolveWorktreeLocation({
      template: "../{repo}.{branch}",
      repo: "arc-framework",
      branch: "feat/worktree-foundation",
    });
    expect(path).toBe("../arc-framework.feat-worktree-foundation");
  });

  it("leaves a branch with no separators unchanged", () => {
    const path = resolveWorktreeLocation({
      template: "../{repo}.{branch}",
      repo: "arc-framework",
      branch: "main",
    });
    expect(path).toBe("../arc-framework.main");
  });

  it("resolves an override template to its own pattern", () => {
    expect(
      resolveWorktreeLocation({
        template: ".worktrees/{branch}",
        repo: "arc-framework",
        branch: "plan/foo",
      }),
    ).toBe(".worktrees/plan-foo");

    expect(
      resolveWorktreeLocation({
        template: "~/worktrees/{repo}/{branch}",
        repo: "arc-framework",
        branch: "fix/bar",
      }),
    ).toBe("~/worktrees/arc-framework/fix-bar");
  });

  it("slugs every separator in a multi-segment branch", () => {
    expect(
      resolveWorktreeLocation({
        template: "../{repo}.{branch}",
        repo: "arc",
        branch: "feat/foo/bar",
      }),
    ).toBe("../arc.feat-foo-bar");
  });

  it("treats the resolved path as a creation-time artifact — a later rename does not recompute or move it", () => {
    // Path resolved when the worktree is created on the original branch.
    const atCreation = resolveWorktreeLocation({
      template: "../{repo}.{branch}",
      repo: "arc",
      branch: "feat/foo",
    });
    expect(atCreation).toBe("../arc.feat-foo");

    // Resolution is pure: identical creation-time inputs always yield the
    // same path (no caching, no ambient git state).
    expect(
      resolveWorktreeLocation({ template: "../{repo}.{branch}", repo: "arc", branch: "feat/foo" }),
    ).toBe(atCreation);

    // An Active->Planning demotion renames the branch. Recomputing from the
    // new branch would point elsewhere — which is precisely why callers
    // persist the creation-time path (and read the live location from
    // `git worktree list`) rather than re-resolving on rename.
    const ifRecomputedAfterRename = resolveWorktreeLocation({
      template: "../{repo}.{branch}",
      repo: "arc",
      branch: "plan/foo",
    });
    expect(ifRecomputedAfterRename).not.toBe(atCreation);
  });
});
