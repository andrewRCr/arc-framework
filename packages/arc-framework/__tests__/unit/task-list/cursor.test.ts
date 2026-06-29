import { describe, expect, it } from "vitest";

import { resolveTaskListCursor } from "../../../src/lib/task-list/cursor.js";

function taskList(lines: readonly string[]): string {
  return lines.join("\n");
}

describe("resolveTaskListCursor", () => {
  it("returns the parent section and first open subtask leaf", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "## **Phase 1:** Build",
      "",
      "### `[ ]` **1.1 Implement cursor projection**",
      "",
      "- _Goal:_ Derive the cursor.",
      "",
      "    - `[x]` **1.1.a Parse parent tasks**",
      "",
      "    - `[ ]` **1.1.b Parse subtasks**",
    ]));

    expect(result).toEqual({
      status: "found",
      cursor: {
        section: {
          id: "1.1",
          title: "Implement cursor projection",
          lineHint: 5,
        },
        leaf: {
          id: "1.1.b",
          title: "Parse subtasks",
          lineHint: 11,
        },
      },
    });
  });

  it("uses a standalone open parent as both section and leaf", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "### `[x]` **1.1 Completed setup**",
      "",
      "### `[ ]` **1.2 Add standalone behavior**",
    ]));

    expect(result).toEqual({
      status: "found",
      cursor: {
        section: {
          id: "1.2",
          title: "Add standalone behavior",
          lineHint: 5,
        },
        leaf: {
          id: "1.2",
          title: "Add standalone behavior",
          lineHint: 5,
        },
      },
    });
  });

  it("accepts documented trailing notes on parent task headings", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "## **Phase 7:** Verification",
      "",
      "### `[ ]` **7.1 Complete verification** — load and follow `verify-work-unit.md`",
    ]));

    expect(result).toEqual({
      status: "found",
      cursor: {
        section: {
          id: "7.1",
          title: "Complete verification",
          lineHint: 5,
        },
        leaf: {
          id: "7.1",
          title: "Complete verification",
          lineHint: 5,
        },
      },
    });
  });

  it("supports revision task identifiers", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "## **Phase 4.R:** Recovery authority revision",
      "",
      "### `[ ]` **4.R.2 Implement the shared task-list cursor projection**",
      "",
      "    - `[ ]` **4.R.2.a Cover revision identifiers**",
    ]));

    expect(result).toEqual({
      status: "found",
      cursor: {
        section: {
          id: "4.R.2",
          title: "Implement the shared task-list cursor projection",
          lineHint: 5,
        },
        leaf: {
          id: "4.R.2.a",
          title: "Cover revision identifiers",
          lineHint: 7,
        },
      },
    });
  });

  it("skips completed and deferred markers before the first open task", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "### `[x]` **1.1 Completed**",
      "",
      "### `[~]` **1.2 Deferred**",
      "",
      "### `[ ]` **1.3 Continue here**",
    ]));

    expect(result).toMatchObject({
      status: "found",
      cursor: {
        section: { id: "1.3", title: "Continue here", lineHint: 7 },
        leaf: { id: "1.3", title: "Continue here", lineHint: 7 },
      },
    });
  });

  it("accepts trailing notes on bold subtask titles", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "### `[ ]` **2.1 Parent**",
      "",
      "    - `[ ]` **2.1.a Wire the check** — project copy",
    ]));

    expect(result).toMatchObject({
      status: "found",
      cursor: {
        section: { id: "2.1", title: "Parent", lineHint: 3 },
        leaf: { id: "2.1.a", title: "Wire the check", lineHint: 5 },
      },
    });
  });

  it("accepts plain single-line subtask titles", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "### `[ ]` **2.1 Parent**",
      "",
      "    - `[ ]` 2.1.a Plain subtask title",
    ]));

    expect(result).toMatchObject({
      status: "found",
      cursor: {
        section: { id: "2.1", title: "Parent", lineHint: 3 },
        leaf: { id: "2.1.a", title: "Plain subtask title", lineHint: 5 },
      },
    });
  });

  it("ignores root-level success criteria checkboxes after an open verification task", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "## **Phase 7:** Verification",
      "",
      "### `[ ]` **7.1 Complete verification**",
      "",
      "- _Note:_ Validate success criteria.",
      "",
      "---",
      "",
      "## Success Criteria",
      "",
      "- `[ ]` On Claude Code and Codex, forcing a compaction injects recovery",
      "- `[ ]` All quality gates pass",
    ]));

    expect(result).toEqual({
      status: "found",
      cursor: {
        section: {
          id: "7.1",
          title: "Complete verification",
          lineHint: 5,
        },
        leaf: {
          id: "7.1",
          title: "Complete verification",
          lineHint: 5,
        },
      },
    });
  });

  it("returns no-open-task when every task is terminal", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "### `[x]` **1.1 Completed**",
      "",
      "### `[~]` **1.2 Deferred**",
    ]));

    expect(result).toEqual({ status: "no-open-task" });
  });

  it("returns malformed for a parent marker without an id and title", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "### `[ ]` **1.1**",
    ]));

    expect(result).toEqual({
      status: "malformed",
      error: {
        line: 3,
        message: "task marker must include an id and title",
      },
    });
  });

  it("returns malformed for a subtask before any parent task", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "    - `[ ]` **1.1.a Orphan subtask**",
    ]));

    expect(result).toEqual({
      status: "malformed",
      error: {
        line: 3,
        message: "subtask marker appeared before any parent task",
      },
    });
  });
});
