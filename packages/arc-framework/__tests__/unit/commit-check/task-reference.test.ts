import { describe, expect, it } from "vitest";

import { parseTaskReference } from "../../../src/lib/commit-check/task-reference.js";

describe("task-reference parser", () => {
  it("parses a single arbitrary-depth task id", () => {
    expect(parseTaskReference("Task 1.2.a.R")).toEqual({
      cardinality: "single",
      items: [{ kind: "single", taskId: "1.2.a.R" }],
      qualifier: null,
    });
  });

  it("parses and normalizes ranges inside a non-contiguous list", () => {
    expect(parseTaskReference("Tasks 1.2, 3.4.a, 5.1.b-d; maintenance")).toEqual({
      cardinality: "multiple",
      items: [
        { kind: "single", taskId: "1.2" },
        { kind: "single", taskId: "3.4.a" },
        { kind: "range", startTaskId: "5.1.b", endTaskId: "5.1.d" },
      ],
      qualifier: "maintenance",
    });
  });

  it.each([
    "Task 1.2",
    "Task 1.2.a; planning",
    "Tasks 1.2-1.4",
    "Tasks 1.2.a-d",
    "Tasks 1.2, 3.4.a, 5.1.b-d",
  ])("parses every task-bearing form accepted by footer policy: %s", (reference) => {
    expect(parseTaskReference(reference)).not.toBeNull();
  });

  it.each([
    "Tasks 1.2",
    "Task 1.2-1.4",
    "Task nonsense",
    "Tasks 1.2,3.4",
    "planning",
  ])("rejects a non-grammar form: %s", (reference) => {
    expect(parseTaskReference(reference)).toBeNull();
  });
});
