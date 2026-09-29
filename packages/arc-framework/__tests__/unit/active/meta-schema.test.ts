/** Unit coverage for semantic work-unit metadata schemas. */

import { describe, expect, it } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

import {
  META_FIELD_KEYS,
  MetaProjectionRecordSchema,
  MetaRecordSchema,
  ParsedMetaRecordSchema,
} from "../../../src/lib/active/meta-schema.js";
import { META_FIELDS } from "../../../src/lib/active/meta-reader.js";

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
    reviewRubric: null,
    promotionReceipt: null,
    candidateId: null,
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
      assertSchemaAccepts(MetaRecordSchema, { ...validRecord(), state });
    },
  );

  it.each(["Light", "Heavy", "Novel", "TBD"])("accepts work class %s", (workClass) => {
    assertSchemaAccepts(MetaRecordSchema, { ...validRecord(), workClass });
  });

  it.each(["P1", "P2", "P3", "TBD"])("accepts priority %s", (priority) => {
    assertSchemaAccepts(MetaRecordSchema, { ...validRecord(), priority });
  });

  it("accepts only a canonical optional promotion receipt", () => {
    const canonical = `errand-v1/repair/${"a".repeat(32)}`;

    assertSchemaAccepts(MetaRecordSchema, { ...validRecord(), promotionReceipt: canonical });
    assertSchemaAccepts(MetaRecordSchema, { ...validRecord(), promotionReceipt: null });
    for (const malformed of ["errand-v1/Repair/" + "a".repeat(32), "errand-v1/repair/stale", "repair"]) {
      assertSchemaRefuses(MetaRecordSchema, { ...validRecord(), promotionReceipt: malformed });
    }
  });

  it("accepts only a canonical nullable Candidate identity", () => {
    const candidateId = `sha256:${"a".repeat(64)}`;

    assertSchemaAccepts(MetaRecordSchema, { ...validRecord(), candidateId });
    assertSchemaAccepts(MetaRecordSchema, { ...validRecord(), candidateId: null });
    for (const malformed of ["candidate", "sha256:stale", "a".repeat(64)]) {
      assertSchemaRefuses(MetaRecordSchema, { ...validRecord(), candidateId: malformed });
    }
  });

  it.each(["state", "owner", "workClass", "priority", "origin"])(
    "rejects missing or null required field %s",
    (field) => {
      const missing = Object.fromEntries(
        Object.entries(validRecord()).filter(([key]) => key !== field),
      );
      assertSchemaRefuses(MetaRecordSchema, missing);
      assertSchemaRefuses(MetaRecordSchema, { ...validRecord(), [field]: null });
    },
  );

  it("rejects unknown keys", () => {
    assertSchemaRefuses(MetaRecordSchema, { ...validRecord(), unknown: "value" });
  });

  it.each(["", "—", "[none]", "[internal]", "[TBD]"])(
    "rejects display or empty token %j in open semantic fields",
    (value) => {
      assertSchemaRefuses(MetaRecordSchema, { ...validRecord(), owner: value });
      assertSchemaRefuses(MetaRecordSchema, { ...validRecord(), branch: value });
      assertSchemaRefuses(MetaRecordSchema, { ...validRecord(), origin: value });
    },
  );

  it("rejects malformed identifier arrays", () => {
    assertSchemaRefuses(MetaRecordSchema, { ...validRecord(), dependsOn: "kernel" });
    assertSchemaRefuses(MetaRecordSchema, { ...validRecord(), design: ["spec.md", null] });
    assertSchemaRefuses(MetaRecordSchema, { ...validRecord(), design: [""] });
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

describe("ParsedMetaRecordSchema", () => {
  it("defaults an omitted promotion receipt to null", () => {
    const historical = validRecord();
    delete historical.promotionReceipt;

    expect(ParsedMetaRecordSchema.parse(historical).promotionReceipt).toBeNull();
  });
});

describe("MetaProjectionRecordSchema", () => {
  function projectionRecord(): Record<string, string | null> {
    return Object.fromEntries(META_FIELD_KEYS.map(({ name }) => [name, null]));
  }

  it("accepts the complete Markdown label projection", () => {
    const projection = {
      State: "Active",
      Owner: "andrew",
      Branch: "feat/example",
      Class: "Heavy",
      Priority: "P2",
      Cohort: null,
      "Depends On": "[none]",
      Origin: "[internal]",
      Design: "spec-example.md",
      "Task List": "tasks-example.md",
      "Review Rubric": null,
      "Promotion Receipt": null,
      Candidate: null,
      "Current Workflow": null,
      "Last Completed": null,
      "Next Task": null,
      Blockers: null,
      "Next Action": "Begin Task 1.1",
      "PR URL": null,
      Completed: null,
    };

    expect(MetaProjectionRecordSchema.parse(projection)).toEqual(projection);
  });

  it("keeps the descriptor semantic keys aligned with the projection authority", () => {
    expect(META_FIELDS.map(({ name, key }) => ({ name, key }))).toEqual(META_FIELD_KEYS);
  });

  it("defaults an omitted promotion receipt while requiring the other managed labels", () => {
    const complete = projectionRecord();
    const missing = Object.fromEntries(Object.entries(complete).filter(([name]) => name !== "Completed"));
    const historical = Object.fromEntries(
      Object.entries(complete).filter(([name]) => name !== "Promotion Receipt"),
    );

    expect(Object.keys(complete)).toHaveLength(20);
    expect(MetaProjectionRecordSchema.parse(historical)["Promotion Receipt"]).toBeNull();
    assertSchemaRefuses(MetaProjectionRecordSchema, missing);
    assertSchemaRefuses(MetaProjectionRecordSchema, { ...complete, Extra: null });
    assertSchemaRefuses(MetaProjectionRecordSchema, { ...complete, State: 42 });
  });
});

describe("ParsedMetaRecordSchema", () => {
  it("accepts raw closed-domain tokens without discarding independent fields", () => {
    const parsed = {
      ...validRecord(),
      state: "Paused unexpectedly",
      workClass: "Bespoke",
      priority: "Urgent",
      branch: null,
      dependsOn: ["kernel", "layout"],
      design: [],
    };

    expect(ParsedMetaRecordSchema.parse(parsed)).toEqual(parsed);
  });

  it("preserves independent fields when another token is absent or invalid", () => {
    const parsed = ParsedMetaRecordSchema.parse({
      ...validRecord(),
      state: "not-a-state",
      owner: null,
      branch: "feat/still-usable",
      dependsOn: ["kernel"],
    });

    expect(parsed.state).toBe("not-a-state");
    expect(parsed.owner).toBeNull();
    expect(parsed.branch).toBe("feat/still-usable");
    expect(parsed.dependsOn).toEqual(["kernel"]);
  });

  it("rejects empty present adapter values", () => {
    assertSchemaRefuses(ParsedMetaRecordSchema, { ...validRecord(), state: "" });
  });
});
