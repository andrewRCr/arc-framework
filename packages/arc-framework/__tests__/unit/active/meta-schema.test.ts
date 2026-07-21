/** Unit coverage for semantic work-unit metadata schemas. */

import { describe, expect, it } from "vitest";

import { MetaRecordSchema } from "../../../src/lib/active/meta-schema.js";

function validRecord(): Record<string, unknown> {
  return {
    state: "Active",
    owner: "andrew",
    branch: "feat/cli-validation-surfaces",
    workClass: "Heavy",
    priority: "P2",
    cohort: "cli-substrate-adoption",
    dependsOn: [],
    origin: "internal",
    design: ["spec-cli-validation-surfaces.md"],
    taskList: "tasks-cli-validation-surfaces.md",
    currentWorkflow: null,
    lastCompleted: null,
    nextTask: "Task 2.1.a — Define the semantic meta-record contract",
    blockers: null,
    nextAction: "Begin Task 2.1.a",
    prUrl: null,
    completed: null,
  };
}

describe("MetaRecordSchema", () => {
  it("accepts a complete semantic record", () => {
    const record = validRecord();

    expect(MetaRecordSchema.parse(record)).toEqual(record);
  });

  it.each(["Planning", "Active", "Integrating", "Shipped"])(
    "accepts work-unit state %s",
    (state) => {
      expect(MetaRecordSchema.safeParse({ ...validRecord(), state }).success).toBe(true);
    },
  );

  it.each(["Light", "Heavy", "Novel", "TBD"])("accepts work class %s", (workClass) => {
    expect(MetaRecordSchema.safeParse({ ...validRecord(), workClass }).success).toBe(true);
  });

  it.each(["P1", "P2", "P3", "TBD"])("accepts priority %s", (priority) => {
    expect(MetaRecordSchema.safeParse({ ...validRecord(), priority }).success).toBe(true);
  });

  it.each(["state", "owner", "workClass", "priority", "origin"])(
    "rejects missing or null required field %s",
    (field) => {
      const missing = Object.fromEntries(
        Object.entries(validRecord()).filter(([key]) => key !== field),
      );
      expect(MetaRecordSchema.safeParse(missing).success).toBe(false);
      expect(MetaRecordSchema.safeParse({ ...validRecord(), [field]: null }).success).toBe(false);
    },
  );

  it("rejects unknown keys", () => {
    expect(MetaRecordSchema.safeParse({ ...validRecord(), unknown: "value" }).success).toBe(false);
  });

  it.each(["", "—", "[none]", "[internal]", "[TBD]"])(
    "rejects display or empty token %j in open semantic fields",
    (value) => {
      expect(MetaRecordSchema.safeParse({ ...validRecord(), owner: value }).success).toBe(false);
      expect(MetaRecordSchema.safeParse({ ...validRecord(), branch: value }).success).toBe(false);
      expect(MetaRecordSchema.safeParse({ ...validRecord(), origin: value }).success).toBe(false);
    },
  );

  it("rejects malformed identifier arrays", () => {
    expect(MetaRecordSchema.safeParse({ ...validRecord(), dependsOn: "kernel" }).success).toBe(false);
    expect(MetaRecordSchema.safeParse({ ...validRecord(), design: ["spec.md", null] }).success).toBe(false);
    expect(MetaRecordSchema.safeParse({ ...validRecord(), design: [""] }).success).toBe(false);
  });

  it("keeps null, empty lists, TBD, and internal as distinct semantic values", () => {
    const result = MetaRecordSchema.parse({
      ...validRecord(),
      branch: null,
      cohort: null,
      dependsOn: [],
      design: [],
      workClass: "TBD",
      priority: "TBD",
      origin: "internal",
    });

    expect(result.branch).toBeNull();
    expect(result.dependsOn).toEqual([]);
    expect(result.workClass).toBe("TBD");
    expect(result.priority).toBe("TBD");
    expect(result.origin).toBe("internal");
  });
});
