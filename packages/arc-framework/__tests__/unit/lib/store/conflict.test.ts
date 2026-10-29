/** Hunk coordinates retain the record basis and distinguish empty sides from blank lines. */
import { expect, it } from "vitest";
import { OwnerIdentitySchema, RecordVersionSchema, TextConflictRecordSchema, recordReferences } from "../../../../src/lib/store/index.js";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../../helpers/schema-assertion.js";
const record = recordReferences["personal/document"](OwnerIdentitySchema.parse({ type: "person", name: "owner" }), "notes.md");
const label = { actor: "writer", time: "2026-10-01T00:00:00Z" };
const hunk = { record, location: { kind: "hunk", start: 0, end: 1 }, base: "base",
  baseVersion: RecordVersionSchema.parse("observed"), currentLines: 1, incomingLines: 1,
  current: { content: "current", label }, incoming: { content: "incoming", label } };
it.each([{ baseVersion: hunk.baseVersion }, { baseVersion: null }])("preserves the hunk basis $baseVersion", ({ baseVersion }) => {
  const value = { ...hunk, baseVersion };
  expect(assertSchemaAccepts(TextConflictRecordSchema, value)).toEqual(value);
});
it.each(["baseVersion", "currentLines", "incomingLines"])("requires the hunk's %s", (field) => {
  assertSchemaRefuses(TextConflictRecordSchema, { ...hunk, [field]: undefined });
});
it.each(["currentLines", "incomingLines"])("requires a nonnegative integer %s", (field) => {
  assertSchemaRefuses(TextConflictRecordSchema, { ...hunk, [field]: -1 });
  assertSchemaRefuses(TextConflictRecordSchema, { ...hunk, [field]: 0.5 });
  expect(assertSchemaAccepts(TextConflictRecordSchema, { ...hunk, [field]: 0 })).toMatchObject({ [field]: 0 });
});
