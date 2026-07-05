/**
 * Unit tests for worktree location-template resolution.
 *
 * Covers template expansion ({repo} / {name} / {branch}), branch slugging
 * (path separators -> `-`), override templates, and the creation-time-artifact
 * contract — resolution is a pure function of its inputs, so a later branch
 * rename never recomputes or moves an already-created worktree.
 */

import { describe, it, expect } from "vitest";

import { resolveWorktreeLocation } from "../../../src/lib/git/worktree-location.js";

describe("resolveWorktreeLocation", () => {
  it("resolves the default template from the work-unit name", () => {
    const path = resolveWorktreeLocation({
      template: "../{repo}.{name}",
      repo: "arc-framework",
      name: "worktree-foundation",
      branch: "plan/worktree-foundation",
    });
    expect(path).toBe("../arc-framework.worktree-foundation");
  });

  it("supports branch-labeled templates, slugging branch separators to '-'", () => {
    const path = resolveWorktreeLocation({
      template: "../{repo}.{branch}",
      repo: "arc-framework",
      name: "worktree-foundation",
      branch: "feat/worktree-foundation",
    });
    expect(path).toBe("../arc-framework.feat-worktree-foundation");
  });

  it("resolves an override template to its own pattern", () => {
    expect(
      resolveWorktreeLocation({
        template: ".worktrees/{name}",
        repo: "arc-framework",
        name: "foo",
        branch: "plan/foo",
      }),
    ).toBe(".worktrees/foo");

    expect(
      resolveWorktreeLocation({
        template: "~/worktrees/{repo}/{branch}",
        repo: "arc-framework",
        name: "bar",
        branch: "fix/bar",
      }),
    ).toBe("~/worktrees/arc-framework/fix-bar");
  });

  it("slugs every separator in a multi-segment branch", () => {
    expect(
      resolveWorktreeLocation({
        template: "../{repo}.{branch}",
        repo: "arc",
        name: "foo-bar",
        branch: "feat/foo/bar",
      }),
    ).toBe("../arc.feat-foo-bar");
  });

  it("keeps the default path stable across branch rename inputs", () => {
    // Path resolved when the worktree is created on the original branch.
    const atCreation = resolveWorktreeLocation({
      template: "../{repo}.{name}",
      repo: "arc",
      name: "foo",
      branch: "plan/foo",
    });
    expect(atCreation).toBe("../arc.foo");

    // Resolution is pure: identical creation-time inputs always yield the
    // same path (no caching, no ambient git state).
    expect(
      resolveWorktreeLocation({ template: "../{repo}.{name}", repo: "arc", name: "foo", branch: "plan/foo" }),
    ).toBe(atCreation);

    // Activation / deactivation rename the branch, but the default path follows
    // the WU identity rather than the life-phase branch prefix.
    expect(
      resolveWorktreeLocation({
        template: "../{repo}.{name}",
        repo: "arc",
        name: "foo",
        branch: "feat/foo",
      }),
    ).toBe(atCreation);
  });

  it("treats branch-labeled paths as creation-time artifacts when opted in", () => {
    const atCreation = resolveWorktreeLocation({
      template: "../{repo}.{branch}",
      repo: "arc",
      branch: "plan/foo",
      name: "foo",
    });
    expect(atCreation).toBe("../arc.plan-foo");

    const ifRecomputedAfterRename = resolveWorktreeLocation({
      template: "../{repo}.{branch}",
      repo: "arc",
      branch: "feat/foo",
      name: "foo",
    });
    expect(ifRecomputedAfterRename).not.toBe(atCreation);
  });
});
