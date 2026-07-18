/**
 * Unit tests for view bands, headers, and task-list degrade output.
 */

import { describe, expect, it } from "vitest";

import {
  formatArtifactHeader,
  formatTaskBand,
  prepareViewDocument,
} from "../../../src/commands/view/format.js";

const NOW = new Date(2026, 0, 2, 9, 5);

describe("view formatting", () => {
  it("formats the task counter band with a rendered-at timestamp", () => {
    expect(formatTaskBand({
      phase: { current: 2, total: 3 },
      taskId: "2.1",
      subtask: { current: 2, total: 3 },
      overall: { done: 3, total: 7 },
    }, NOW)).toBe("Phase 2/3 · Task 2.1 (subtask 2/3) · 3/7 overall · rendered 09:05");
  });

  it("formats non-task kinds with the work-unit label and timestamp", () => {
    expect(formatArtifactHeader("spec", "feature", NOW))
      .toBe("spec · feature · rendered 09:05");
  });

  it("prepends the task band and carries a shifted source-line anchor", () => {
    const content = [
      "## **Phase 1:** Build",
      "",
      "### `[ ]` **1.1 Current task**",
      "",
      "- _Goal:_ Build it.",
      "",
    ].join("\n");

    expect(prepareViewDocument({
      kind: "tasks",
      workUnit: "feature",
      content,
      current: false,
      now: NOW,
    })).toEqual({
      content: "Phase 1/1 · Task 1.1 · 0/1 overall · rendered 09:05\n\n" + content,
      warnings: [],
      anchor: { line: 5, id: "1.1" },
      bypassPager: false,
    });
  });

  it("retains the task band when the task list is complete", () => {
    const content = [
      "## **Phase 1:** Build",
      "",
      "### `[x]` **1.1 Completed task**",
      "",
    ].join("\n");

    expect(prepareViewDocument({
      kind: "tasks",
      workUnit: "feature",
      content,
      current: false,
      now: NOW,
    })).toEqual({
      content: "Phase 1/1 · Task 1.1 · 1/1 overall · rendered 09:05\n\n" + content,
      warnings: [],
      bypassPager: false,
    });
  });

  it("prepends the one-line header for non-task artifacts", () => {
    expect(prepareViewDocument({
      kind: "spec",
      workUnit: "feature",
      content: "# Spec\n",
      current: false,
      now: NOW,
    })).toEqual({
      content: "spec · feature · rendered 09:05\n\n# Spec\n",
      warnings: [],
      bypassPager: false,
    });
  });

  it("emits a bare current region, explicit terminal state, and malformed degrade", () => {
    const open = [
      "## **Phase 1:** Build",
      "",
      "### `[ ]` **1.1 Current task**",
      "",
      "- _Goal:_ Build it.",
      "",
      "### `[ ]` **1.2 Later task**",
      "",
    ].join("\n");
    expect(prepareViewDocument({
      kind: "tasks",
      workUnit: "feature",
      content: open,
      current: true,
      now: NOW,
    })).toMatchObject({
      content: "### `[ ]` **1.1 Current task**\n\n- _Goal:_ Build it.\n",
      warnings: [],
      bypassPager: true,
    });

    expect(prepareViewDocument({
      kind: "tasks",
      workUnit: "feature",
      content: "### `[x]` **1.1 Complete**\n",
      current: true,
      now: NOW,
    })).toMatchObject({ content: "No open task.\n", warnings: [], bypassPager: true });

    const malformed = prepareViewDocument({
      kind: "tasks",
      workUnit: "feature",
      content: "### `[ ]` **1.1**\n",
      current: true,
      now: NOW,
    });
    expect(malformed).toMatchObject({
      content: "Current task unavailable: task list is malformed.\n",
      warnings: [expect.stringContaining("line 1")],
      bypassPager: true,
    });
  });
});
