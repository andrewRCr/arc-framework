/** Public schemas narrow untyped store fields without reparsing content. */
import { describe, expect, it } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../../../helpers/schema-assertion.js";
import { createKindRegistry } from "../../../../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../../../../src/lib/store/kinds/registrations.js";
import { ParsedTaskListRecordSchema } from "../../../../../src/lib/store/kinds/task-list/index.js";
import { ParsedDesignRecordSchema } from "../../../../../src/lib/store/kinds/design/index.js";
import { ParsedCohortDocumentSchema } from "../../../../../src/lib/store/kinds/cohort/index.js";

const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);

describe("public parsed-field schemas", () => {
  it.each([
    ["work-item/task-list", ParsedTaskListRecordSchema, "# Tasks\n- **Design:** `spec-example.md`", { design: "spec-example.md" }],
    ["work-item/draft", ParsedDesignRecordSchema, "**Purpose:** Raw prose.", { purpose: "Raw prose." }],
    ["work-item/spec", ParsedDesignRecordSchema, "**Purpose:**", { purpose: "" }],
    ["work-item/companion", ParsedDesignRecordSchema, "# Notes", { purpose: null }],
    ["cohort/document", ParsedCohortDocumentSchema, "**Parent:** `outer-group`\n**Purpose:** —", { purpose: "—", parent: "outer-group" }],
  ] as const)("narrows %s parser output", (kind, schema, content, expected) => {
    const parsed = registry[kind].parser?.(content);
    expect(parsed?.success).toBe(true);
    if (!parsed?.success) throw new Error("Expected content decoding");
    const fields: unknown = parsed.data;
    expect(assertSchemaAccepts(schema, fields)).toEqual(expected);
  });

  it.each([
    [ParsedTaskListRecordSchema, { design: null }],
    [ParsedDesignRecordSchema, { purpose: null }],
    [ParsedDesignRecordSchema, { purpose: "" }],
    [ParsedCohortDocumentSchema, { purpose: null, parent: null }],
    [ParsedCohortDocumentSchema, { purpose: "", parent: null }],
  ])("preserves nullable and empty parsed values", (schema, fields) => {
    expect(assertSchemaAccepts(schema, fields)).toEqual(fields);
  });

  it.each([
    ["non-object task fields", ParsedTaskListRecordSchema, null],
    ["missing design", ParsedTaskListRecordSchema, {}],
    ["non-string design", ParsedTaskListRecordSchema, { design: 1 }],
    ["unknown task field", ParsedTaskListRecordSchema, { design: null, extra: true }],
    ["missing Purpose", ParsedDesignRecordSchema, {}],
    ["non-string Purpose", ParsedDesignRecordSchema, { purpose: [] }],
    ["unknown design field", ParsedDesignRecordSchema, { purpose: null, extra: true }],
    ["missing Parent", ParsedCohortDocumentSchema, { purpose: null }],
    ["non-string cohort Purpose", ParsedCohortDocumentSchema, { purpose: false, parent: null }],
    ["invalid Parent", ParsedCohortDocumentSchema, { purpose: null, parent: "Bad_Name" }],
    ["path-valued Parent", ParsedCohortDocumentSchema, { purpose: null, parent: "outer/inner" }],
    ["unknown cohort field", ParsedCohortDocumentSchema, { purpose: null, parent: null, extra: true }],
  ])("refuses %s", (_name, schema, fields) => {
    assertSchemaRefuses(schema, fields);
  });
});
