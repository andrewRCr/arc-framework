/** Conflict addresses preserve ID remainders and intentionally match every named generation. */
import { expect, it } from "vitest";
import { RecordReferenceSchema } from "../../../src/lib/store/identity.js";
import { formatConflictToken, parseConflictToken } from "../../../src/lib/status/conflict-token.js";
it.each(["one", "nested/conflict/id"])("round-trips the complete conflict ID %s", key => {
  const owner = { type: "work-item", name: "demo" };
  const reference = RecordReferenceSchema.parse({ kind: "work-item/conflict-record", owner, key });
  expect(formatConflictToken(reference)).toBe(`work-item/work-item/demo/${key}`);
  expect(parseConflictToken(formatConflictToken(reference))).toEqual(reference);
});
