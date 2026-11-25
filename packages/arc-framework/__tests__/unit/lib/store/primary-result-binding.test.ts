/** Primary logical identity does not weaken destination-role and atomic-result binding. */
import { describe, expect, it } from "vitest";
import { OwnerIdentitySchema, recordReferences, RecordVersionSchema } from "../../../../src/lib/store/identity.js";
import { BatchInputSchema, BatchResultSchema, writeResultSchema, type Mutation } from "../../../../src/lib/store/write.js";

const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example", uid: "11111111-1111-4111-8111-111111111111" });
const record = recordReferences["work-item/record"](owner), meta = recordReferences["work-item/meta"](owner);
const version = RecordVersionSchema.parse("current");
const put: Mutation = { action: "put", reference: meta, expected: version, content: "{}", placement: { kind: "active" } };
const provenance = { verb: "promote", lifecycleAction: "promote" };

describe("primary result binding", () => {
  it("requires a put result's requested destination role despite logical primary equality", () => {
    expect(writeResultSchema(put).safeParse({ reference: record, version, conflicts: [] }).success).toBe(false);
    expect(writeResultSchema(put).safeParse({ reference: meta, version, conflicts: [] }).success).toBe(true);
  });
  it("accepts the actual removed role through the other logical primary handle", () => {
    expect(writeResultSchema({ action: "remove", reference: record, expected: version })
      .safeParse({ reference: meta, conflicts: [] }).success).toBe(true);
  });
  it("refuses two primary handles in one UID batch input or result", () => {
    expect(BatchInputSchema.safeParse({ writes: [put, { ...put, reference: record }], provenance }).success).toBe(false);
    expect(BatchResultSchema.safeParse({ batchId: "batch", writes: [{ reference: meta, version, conflicts: [] },
      { reference: record, version, conflicts: [] }] }).success).toBe(false);
  });
  it("keeps UID-less interim primaries distinct in a batch", () => {
    const interim = OwnerIdentitySchema.parse({ type: "work-item", name: "example" });
    expect(BatchInputSchema.safeParse({ writes: [
      { ...put, reference: recordReferences["work-item/meta"](interim) },
      { ...put, reference: recordReferences["work-item/record"](interim) },
    ], provenance }).success).toBe(true);
  });
});
