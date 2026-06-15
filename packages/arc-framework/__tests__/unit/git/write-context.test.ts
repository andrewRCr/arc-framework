import { describe, it, expect } from "vitest";

import {
  classifyPathSurface,
  classifyPlanningEntry,
  classifyWriteContext,
  resolveWriteContext,
} from "../../../src/lib/git/write-context.js";
import type { WriteContext } from "../../../src/lib/git/write-context.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/index.js";

/** Keyed mock exec — matches a prefix of the invocation's args (`*` wildcards). */
function buildExec(responses: Record<string, ExecResult>): GitExec {
  return async (cmd, args) => {
    for (const key of Object.keys(responses)) {
      const tokens = key.split(" ");
      if (tokens.every((t, i) => t === "*" || args[i] === t)) {
        return responses[key] as ExecResult;
      }
    }
    throw new Error(`unmatched git invocation: ${cmd} ${args.join(" ")}`);
  };
}

describe("classifyWriteContext", () => {
  it("proceeds on the configured base branch", () => {
    const result = classifyWriteContext({
      currentBranch: "main",
      baseBranch: "main",
      primaryWorktreePath: "/repo",
    });
    expect(result.verdict).toBe("proceed");
  });

  it("relocates when on a work-unit branch (not the base)", () => {
    const result = classifyWriteContext({
      currentBranch: "feat/some-wu",
      baseBranch: "main",
      primaryWorktreePath: "/repo",
    });
    expect(result.verdict).toBe("relocate");
  });

  it("safely refuses on a detached HEAD rather than writing silently", () => {
    const result = classifyWriteContext({
      currentBranch: null,
      baseBranch: "main",
      primaryWorktreePath: "/repo",
    });
    expect(result).toMatchObject({ verdict: "refuse", reason: "detached-head" });
  });

  it("safely refuses when no base branch resolves", () => {
    const result = classifyWriteContext({
      currentBranch: "main",
      baseBranch: null,
      primaryWorktreePath: "/repo",
    });
    expect(result).toMatchObject({ verdict: "refuse", reason: "no-base" });
  });

  it("threads the target path's surface into the verdict", () => {
    const result = classifyWriteContext({
      currentBranch: "main",
      baseBranch: "main",
      primaryWorktreePath: "/repo",
      targetPath: ".arc/active/cohort-agile-parallelism.md",
    });
    expect(result.pathSurface).toBe("cohort-doc");
  });

  it("leaves the path surface null when the check is path-agnostic", () => {
    const result = classifyWriteContext({
      currentBranch: "main",
      baseBranch: "main",
      primaryWorktreePath: "/repo",
    });
    expect(result.pathSurface).toBeNull();
  });

  it("resolves the errand slug when the current branch is a chore/ errand", () => {
    const result = classifyWriteContext({
      currentBranch: "chore/fix-typo",
      baseBranch: "main",
      primaryWorktreePath: "/repo",
    });
    // Off-base errand branch still relocates on the existing axis, with the slug surfaced alongside.
    expect(result).toMatchObject({ verdict: "relocate", errandSlug: "fix-typo" });
  });

  it("leaves the errand slug null on a non-errand branch", () => {
    const result = classifyWriteContext({
      currentBranch: "feat/some-wu",
      baseBranch: "main",
      primaryWorktreePath: "/repo",
    });
    expect(result.errandSlug).toBeNull();
  });

  it("leaves the errand slug null on a detached HEAD refusal", () => {
    const result = classifyWriteContext({
      currentBranch: null,
      baseBranch: "main",
      primaryWorktreePath: "/repo",
    });
    expect(result).toMatchObject({ verdict: "refuse", errandSlug: null });
  });
});

describe("classifyPathSurface", () => {
  it("classifies a cohort doc as the multi-owner cohort-doc surface", () => {
    expect(classifyPathSurface(".arc/active/cohort-agile-parallelism.md")).toBe("cohort-doc");
    expect(classifyPathSurface(".arc/backlog/planned/core/sub/cohort-sub.md")).toBe("cohort-doc");
  });

  it("classifies per-WU movable artifacts as the work-unit surface", () => {
    expect(classifyPathSurface(".arc/active/meta-merge-safety-mechanism.md")).toBe("work-unit");
    expect(classifyPathSurface(".arc/active/spec-merge-safety-mechanism.md")).toBe("work-unit");
    expect(classifyPathSurface(".arc/active/draft-merge-safety-mechanism.md")).toBe("work-unit");
    expect(classifyPathSurface(".arc/active/tasks-merge-safety-mechanism.md")).toBe("work-unit");
    expect(classifyPathSurface(".arc/active/notes-merge-safety-mechanism.md")).toBe("work-unit");
  });

  it("classifies code and other paths as the other surface", () => {
    expect(classifyPathSurface("packages/arc-framework/src/lib/git/write-context.ts")).toBe("other");
    expect(classifyPathSurface(".arc/backlog/ROADMAP.md")).toBe("other");
    expect(classifyPathSurface("README.md")).toBe("other");
  });

  it("does not classify an artifact-named path outside .arc/ as a planning surface", () => {
    expect(classifyPathSurface("src/notes-helper.md")).toBe("other");
  });
});

describe("classifyPlanningEntry", () => {
  /** Build a real branch-vs-base core verdict for the planning layer to wrap. */
  const core = (currentBranch: string | null, baseBranch: string | null): WriteContext =>
    classifyWriteContext({ currentBranch, baseBranch, primaryWorktreePath: "/repo" });

  // Layer 1 — committable, by mode.

  it("proceeds under partial protection on the base branch", () => {
    const route = classifyPlanningEntry({
      writeContext: core("main", "main"),
      protection: "partial",
      onPlanningBranch: false,
      draftPresent: false,
      activeWorkUnit: false,
    });
    expect(route).toMatchObject({ route: "proceed", protection: "partial", currentBranch: "main" });
  });

  it("proceeds under full protection on an active Planning WU's planning branch", () => {
    const route = classifyPlanningEntry({
      writeContext: core("plan/some-wu", "main"),
      protection: "full",
      onPlanningBranch: true,
      draftPresent: false,
      activeWorkUnit: true,
    });
    expect(route).toMatchObject({ route: "proceed", protection: "full", currentBranch: "plan/some-wu" });
  });

  // Layer 2 — not committable, with the reason worded for the workflow.

  it("redirects under partial protection on a work-unit branch", () => {
    const route = classifyPlanningEntry({
      writeContext: core("feat/some-wu", "main"),
      protection: "partial",
      onPlanningBranch: false,
      draftPresent: false,
      activeWorkUnit: true,
    });
    expect(route).toMatchObject({ route: "redirect", reason: "work-unit-branch" });
  });

  it("redirects under full protection on the base branch — base is protected", () => {
    const route = classifyPlanningEntry({
      writeContext: core("main", "main"),
      protection: "full",
      onPlanningBranch: false,
      draftPresent: false,
      activeWorkUnit: false,
    });
    expect(route).toMatchObject({ route: "redirect", reason: "protected-base" });
  });

  it("redirects under full protection on a non-planning work-unit branch", () => {
    const route = classifyPlanningEntry({
      writeContext: core("feat/other-wu", "main"),
      protection: "full",
      onPlanningBranch: false,
      draftPresent: false,
      activeWorkUnit: true,
    });
    expect(route).toMatchObject({ route: "redirect", reason: "work-unit-branch" });
  });

  // Degenerate branch-vs-base contexts propagate to a redirect in either mode.

  it("redirects with the detached-head reason on a detached HEAD", () => {
    const route = classifyPlanningEntry({
      writeContext: core(null, "main"),
      protection: "partial",
      onPlanningBranch: false,
      draftPresent: false,
      activeWorkUnit: false,
    });
    expect(route).toMatchObject({ route: "redirect", reason: "detached-head" });
  });

  it("redirects with the no-base reason when no base branch resolves", () => {
    const route = classifyPlanningEntry({
      writeContext: core("main", null),
      protection: "full",
      onPlanningBranch: false,
      draftPresent: false,
      activeWorkUnit: false,
    });
    expect(route).toMatchObject({ route: "redirect", reason: "no-base" });
  });

  // Draft-presence and active-WU ride into the redirect as facts the workflow surfaces.

  it("carries draft-presence into the redirect to parameterize the stub leg's fold-in", () => {
    const route = classifyPlanningEntry({
      writeContext: core("main", "main"),
      protection: "full",
      onPlanningBranch: false,
      draftPresent: true,
      activeWorkUnit: false,
    });
    expect(route).toMatchObject({ route: "redirect", draftPresent: true, activeWorkUnit: false });
  });
});

describe("resolveWriteContext", () => {
  it("resolves current branch and primary worktree path from git, then classifies", async () => {
    const exec = buildExec({
      "rev-parse --abbrev-ref HEAD": { stdout: "feat/some-wu\n" },
      "worktree list --porcelain": { stdout: "worktree /repo/primary\nHEAD abc\nbranch refs/heads/main\n" },
    });

    const result = await resolveWriteContext({ exec, baseBranch: "main" });

    expect(result).toMatchObject({
      verdict: "relocate",
      currentBranch: "feat/some-wu",
      primaryWorktreePath: "/repo/primary",
    });
  });
});
