import { describe, expect, it } from "vitest";

import type { ActiveSessionInitInternalResult, ActiveSessionInitResult } from "../../../src/commands/active.js";
import { adaptActiveViewTarget, resolveExplicitViewTarget } from "../../../src/handlers/view.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
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

function internal(result: ActiveSessionInitResult): ActiveSessionInitInternalResult {
  const semantics = result.candidates.map((candidate) => ({
    candidate,
    slug: SlugSchema.parse(/^meta-(.+)\.md$/u.exec(candidate.filename)?.[1]),
    placement: { kind: "active", scope: { kind: "project" } } as const,
  }));
  return {
    result,
    resolved: result.resolution === "single" ? {
      candidate: {
        path: result.path ?? ".arc/active/meta-feature.md",
        filename: "meta-feature.md",
        branch: "feat/feature",
        state: "Active",
        nextTask: null,
        taskList: "tasks-feature.md",
        nextAction: null,
        currentWorkflow: null,
      },
      slug: SlugSchema.parse("feature"),
      placement: { kind: "active", scope: { kind: "project" } },
    } : null,
    candidates: semantics,
  };
}

describe("adaptActiveViewTarget", () => {
  it("maps a single active envelope without leaking command types into lib", () => {
    expect(adaptActiveViewTarget(internal(active()), "feat/feature")).toEqual({
      status: "resolved",
      slug: "feature",
      placement: { kind: "active", scope: { kind: "project" } },
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
    expect(adaptActiveViewTarget(internal(multiple), "feat/feature")).toMatchObject({
      status: "resolved",
      slug: "feature",
      taskListPath: ".arc/active/tasks-feature.md",
    });
    expect(adaptActiveViewTarget(internal(multiple), "feat/missing")).toEqual({ status: "unavailable" });
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
      placement: location === "active"
        ? { kind: "active", scope: { kind: "project" } }
        : { kind: "backlog", commitment: location, cohort: [] },
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

  it("preserves an exact nested meta and configured task pointer while carrying semantic placement", async () => {
    const index = buildLifecycleIndexFromRecords([{
      slug: "nested",
      state: "Planning",
      location: "planned",
      cohort: "parent/child",
      path: "custom/index-record.md",
    }]);

    await expect(resolveExplicitViewTarget({
      cwd: "/repo",
      slug: "nested",
      index,
      readFile: async () => "# Metadata: nested\n\n- **Task List:** custom/checklist.md\n",
    })).resolves.toEqual({
      status: "resolved",
      slug: "nested",
      placement: { kind: "backlog", commitment: "planned", cohort: ["parent", "child"] },
      location: "planned",
      metaPath: "custom/index-record.md",
      taskListPath: "custom/checklist.md",
    });
  });

  it("fails closed when an explicit lifecycle record carries invalid semantic operands", async () => {
    const index = buildLifecycleIndexFromRecords([{
      slug: "invalid",
      state: "Planning",
      location: "planned",
      cohort: "Not-A-Slug",
      path: "custom/index-record.md",
    }]);

    await expect(resolveExplicitViewTarget({
      cwd: "/repo",
      slug: "invalid",
      index,
      readFile: async () => "# Metadata: invalid\n",
    })).resolves.toEqual({ status: "unavailable", slug: "invalid" });
  });
});
