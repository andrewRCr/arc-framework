import { describe, expect, it } from "vitest";

import { expandTaskReference, parseTaskReference } from "../../../src/lib/commit-check/task-reference.js";

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

describe("task-reference expansion", () => {
  it("expands inclusive document-order ranges and retains unique first occurrences", () => {
    const reference = parseTaskReference("Tasks 1.2.a-c, 1.2.b, 2.1");
    if (reference === null) throw new Error("Expected accepted producer grammar");
    expect(expandTaskReference(reference, ["1.2.a", "1.2.b", "1.2.c", "2.1"]))
      .toEqual(["1.2.a", "1.2.b", "1.2.c", "2.1"]);
  });
  it.each([["1.2.b"], ["1.2.a"], ["1.2.c", "1.2.b", "1.2.a"], []])("conserves range endpoints when the inventory cannot expand them: %j", (...ids) => {
    const reference = parseTaskReference("Tasks 1.2.a-c");
    if (reference === null) throw new Error("Expected accepted producer grammar");
    expect(expandTaskReference(reference, ids)).toEqual(["1.2.a", "1.2.c"]);
  });
});
