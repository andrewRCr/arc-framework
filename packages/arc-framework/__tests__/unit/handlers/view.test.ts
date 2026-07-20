import { describe, expect, it } from "vitest";

import type { ActiveSessionInitResult } from "../../../src/commands/active.js";
import { adaptActiveViewTarget, resolveExplicitViewTarget } from "../../../src/handlers/view.js";
import { buildLifecycleIndexFromRecords } from "../../../src/lib/work-unit/lifecycle-index.js";

function active(overrides: Partial<ActiveSessionInitResult> = {}): ActiveSessionInitResult {
  return {
    mode: "session-init",
    layout: "full",
    resolution: "single",
    path: ".arc/active/meta-feature.md",
    candidates: [],
    taskListPath: ".arc/active/tasks-feature.md",
    sessionType: "execution",
    currentWorkflow: null,
    planningStage: null,
    warnings: [],
    ...overrides,
  };
}

describe("adaptActiveViewTarget", () => {
  it("maps a single active envelope without leaking command types into lib", () => {
    expect(adaptActiveViewTarget(active(), "feat/feature")).toEqual({
      status: "resolved",
      slug: "feature",
      location: "active",
      metaPath: ".arc/active/meta-feature.md",
      taskListPath: ".arc/active/tasks-feature.md",
    });
  });

  it("selects exactly one branch-matching candidate and otherwise fails closed", () => {
    const multiple = active({
      resolution: "multiple",
      path: null,
      candidates: [
        {
          path: ".arc/active/meta-other.md", filename: "meta-other.md", branch: "feat/other",
          state: "Active", nextTask: null, taskList: "tasks-other.md", nextAction: null, currentWorkflow: null,
        },
        {
          path: ".arc/active/meta-feature.md", filename: "meta-feature.md", branch: "feat/feature",
          state: "Active", nextTask: null, taskList: "tasks-feature.md", nextAction: null, currentWorkflow: null,
        },
      ],
    });
    expect(adaptActiveViewTarget(multiple, "feat/feature")).toMatchObject({
      status: "resolved",
      slug: "feature",
      taskListPath: ".arc/active/tasks-feature.md",
    });
    expect(adaptActiveViewTarget(multiple, "feat/missing")).toEqual({ status: "unavailable" });
  });
});

describe("resolveExplicitViewTarget", () => {
  it.each([
    ["active", "Active", "active"],
    ["planned", "Planning", "planned"],
    ["provisional", "Planning", "provisional"],
  ] as const)("resolves a materialized %s target", async (slug, state, location) => {
    const index = buildLifecycleIndexFromRecords([{ slug, state, location }]);
    await expect(resolveExplicitViewTarget({
      cwd: "/repo",
      slug,
      index,
      readFile: async () => `# Metadata: ${slug}\n\n- **Task List:** tasks-${slug}.md\n`,
    })).resolves.toEqual({
      status: "resolved",
      slug,
      location,
      metaPath: `.arc/${location === "active" ? "active" : `backlog/${location}`}/meta-${slug}.md`,
      taskListPath: `.arc/${location === "active" ? "active" : `backlog/${location}`}/tasks-${slug}.md`,
    });
  });

  it("returns the completed-specific result only for a materialized completed record", async () => {
    const index = buildLifecycleIndexFromRecords([{
      slug: "completed",
      state: "Shipped",
      location: "completed",
    }]);
    await expect(resolveExplicitViewTarget({
      cwd: "/repo",
      slug: "completed",
      index,
      readFile: async () => { throw new Error("must not read"); },
    })).resolves.toEqual({ status: "completed", slug: "completed" });
  });

  it.each([
    "unknown",
    "malformed-index-drop",
    "remote-only",
    "sibling-worktree-only",
    "unmaterialized",
  ])("collapses the %s miss to unavailable without another authority port", async (slug) => {
    await expect(resolveExplicitViewTarget({
      cwd: "/repo",
      slug,
      index: buildLifecycleIndexFromRecords([]),
      readFile: async () => { throw new Error("must not read"); },
    })).resolves.toEqual({ status: "unavailable", slug });
  });

  it("collapses an unreadable materialized meta to unavailable", async () => {
    const index = buildLifecycleIndexFromRecords([{
      slug: "unreadable",
      state: "Planning",
      location: "planned",
    }]);
    await expect(resolveExplicitViewTarget({
      cwd: "/repo",
      slug: "unreadable",
      index,
      readFile: async () => { throw new Error("EACCES"); },
    })).resolves.toEqual({ status: "unavailable", slug: "unreadable" });
  });
});
