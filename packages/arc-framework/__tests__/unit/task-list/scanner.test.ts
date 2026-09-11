import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ParentTaskIdSchema,
  scanTaskListStructure,
} from "../../../src/lib/task-list/scanner.js";

describe("ParentTaskIdSchema", () => {
  it("accepts canonical parent ids and refuses malformed dotted ids", () => {
    for (const id of ["1.1", "2.R", "5.R.a"]) {
      expect(ParentTaskIdSchema.safeParse(id).success).toBe(true);
    }
    for (const id of ["1", "1..a", "1.2.3", "phase.1"]) {
      expect(ParentTaskIdSchema.safeParse(id).success).toBe(false);
    }
  });
});

describe("scanTaskListStructure", () => {
  it("treats a pre-phase Delivery Plan as non-executable content", () => {
    const result = scanTaskListStructure([
      "## Delivery Plan",
      "",
      "### `[ ]` **9.9 Task-shaped member prose**",
      "",
      "    - `[ ]` **9.9.a Task-shaped seam prose**",
      "",
      "| # | Tasks |",
      "| - | ----- |",
      "| 1 | `8.8`, `8.9` |",
      "",
      "```markdown",
      "## **Phase 7:** Fenced example",
      "```",
      "",
      "## **Phase 1:** Build",
      "",
      "### `[ ]` **1.1 Real task**",
    ].join("\n"));

    expect(result).toMatchObject({
      status: "scanned",
      events: [
        { type: "section", line: 1 },
        { type: "phase", line: 15, id: "1", title: "Build" },
        { type: "content", line: 16, text: "" },
        { type: "parent", line: 17, item: { id: "1.1", title: "Real task" } },
      ],
    });
  });

  it("emits canonical phase, parent, subtask, and section events", () => {
    const result = scanTaskListStructure([
      "# Task List: Scanner",
      "",
      "## **Phase 1:** Build",
      "",
      "### `[ ]` **1.1 Implement scanner**",
      "",
      "    - `[x]` **1.1.a Recognize completed subtasks**",
      "",
      "### `[~]` **1.2 Deferred task**",
      "",
      "## Success Criteria",
    ].join("\n"));

    expect(result).toEqual({
      status: "scanned",
      events: [
        { type: "content", line: 1, text: "# Task List: Scanner" },
        { type: "content", line: 2, text: "" },
        { type: "phase", line: 3, id: "1", title: "Build" },
        { type: "content", line: 4, text: "" },
        {
          type: "parent",
          line: 5,
          marker: " ",
          item: { id: "1.1", title: "Implement scanner", lineHint: 5 },
        },
        { type: "content", line: 6, text: "" },
        {
          type: "subtask",
          line: 7,
          marker: "x",
          item: { id: "1.1.a", title: "Recognize completed subtasks", lineHint: 7 },
        },
        { type: "content", line: 8, text: "" },
        {
          type: "parent",
          line: 9,
          marker: "~",
          item: { id: "1.2", title: "Deferred task", lineHint: 9 },
        },
        { type: "content", line: 10, text: "" },
        { type: "section", line: 11 },
      ],
    });
  });

  it("refuses an open subtask beneath a completed parent", () => {
    const result = scanTaskListStructure([
      "### `[x]` **1.1 Completed parent**",
      "",
      "    - `[x]` **1.1.a Completed child**",
      "",
      "    - `[ ]` **1.1.b Hidden open child**",
    ].join("\n"));

    expect(result).toEqual({
      status: "malformed",
      error: {
        line: 5,
        message: "open subtask 1.1.b at line 5 appears beneath completed parent 1.1 at line 1",
      },
    });
  });

  it("refuses an anonymous checkbox inside a parent task but preserves ordinary bullets", () => {
    const result = scanTaskListStructure([
      "### `[ ]` **1.1 Active parent**",
      "",
      "- Ordinary outcome detail.",
      "",
      "- `[ ]` Unnumbered follow-up",
    ].join("\n"));

    expect(result).toEqual({
      status: "malformed",
      error: {
        line: 5,
        message: "anonymous checkbox at line 5 appears inside parent task 1.1 at line 1",
      },
    });
  });

  it("ignores task markers inside backtick and tilde fenced examples", () => {
    const canonicalTemplate = readFileSync(new URL(
      "../../../arc/reference/templates/arc/work-unit/template-tasks.md",
      import.meta.url,
    ), "utf8");
    const content = [
      canonicalTemplate,
      "~~~markdown",
      "### `[ ]` **8.1 Tilde-fenced parent**",
      "",
      "    - `[ ]` **8.1.a Tilde-fenced subtask**",
      "~~~",
      "",
      "### `[ ]` **9.1 Real task after examples**",
    ].join("\n");
    const realLine = content.split(/\r?\n/u)
      .findIndex((line) => line.includes("Real task after examples")) + 1;
    const result = scanTaskListStructure(content);

    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;
    expect(result.events.filter((event) => event.type === "parent" || event.type === "subtask"))
      .toEqual([{
        type: "parent",
        line: realLine,
        marker: " ",
        item: {
          id: "9.1",
          title: "Real task after examples",
          lineHint: realLine,
        },
      }]);
  });
});
