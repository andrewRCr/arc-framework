import { describe, expect, it } from "vitest";

import type { ActiveSessionInitResult } from "../../../src/commands/active.js";
import { adaptActiveViewTarget } from "../../../src/handlers/view.js";

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
