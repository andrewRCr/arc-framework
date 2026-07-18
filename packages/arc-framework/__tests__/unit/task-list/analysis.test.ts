/**
 * Unit tests for phase-aware task-list analysis and current-region extraction.
 */

import { describe, expect, it } from "vitest";

import {
  analyzeTaskList,
  extractCurrentTaskRegion,
} from "../../../src/lib/task-list/cursor.js";

function taskList(lines: readonly string[]): string {
  return `${lines.join("\n")}\n`;
}

describe("analyzeTaskList", () => {
  it("derives overall, phase, task, and subtask tallies from the cursor grammar", () => {
    const result = analyzeTaskList(taskList([
      "# Task List: analysis",
      "",
      "## **Phase 1:** Foundation",
      "",
      "### `[x]` **1.1 Complete parent**",
      "",
      "    - `[x]` **1.1.a Complete child**",
      "",
      "## **Phase 2:** Current",
      "",
      "### `[ ]` **2.1 Current parent**",
      "",
      "    - `[x]` **2.1.a First child**",
      "",
      "    - `[ ]` **2.1.b Current child**",
      "",
      "    - `[ ]` **2.1.c Later child**",
      "",
      "## **Phase 3:** Later",
      "",
      "### `[ ]` **3.1 Later parent**",
    ]));

    expect(result).toEqual({
      status: "found",
      cursor: {
        section: { id: "2.1", title: "Current parent", lineHint: 11 },
        leaf: { id: "2.1.b", title: "Current child", lineHint: 15 },
      },
      tallies: {
        phase: { current: 2, total: 3 },
        taskId: "2.1",
        subtask: { current: 2, total: 3 },
        overall: { done: 3, total: 7 },
      },
    });
  });

  it("reports malformed task grammar without throwing", () => {
    expect(analyzeTaskList(taskList([
      "## **Phase 1:** Broken",
      "",
      "### `[ ]` **1.1**",
    ]))).toEqual({
      status: "malformed",
      error: { line: 3, message: "task marker must include a valid id and title" },
    });
  });
});

describe("extractCurrentTaskRegion", () => {
  it("extracts the current parent block through the next task heading", () => {
    const content = taskList([
      "## **Phase 1:** Current",
      "",
      "### `[ ]` **1.1 Current parent**",
      "",
      "- _Goal:_ Keep this block.",
      "",
      "    - `[ ]` **1.1.a Current child**",
      "",
      "### `[ ]` **1.2 Next parent**",
      "",
      "- _Goal:_ Exclude this block.",
    ]);

    expect(extractCurrentTaskRegion(content)).toEqual({
      status: "found",
      content: [
        "### `[ ]` **1.1 Current parent**",
        "",
        "- _Goal:_ Keep this block.",
        "",
        "    - `[ ]` **1.1.a Current child**",
        "",
      ].join("\n"),
    });
  });

  it("preserves no-open and malformed states", () => {
    expect(extractCurrentTaskRegion(taskList([
      "### `[x]` **1.1 Complete**",
    ]))).toEqual({ status: "no-open-task" });
    expect(extractCurrentTaskRegion(taskList([
      "### `[ ]` **1.1**",
    ]))).toMatchObject({ status: "malformed" });
  });
});
