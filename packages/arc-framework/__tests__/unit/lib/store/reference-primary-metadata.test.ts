/** Role changes preserve logical placement while reading the actual role's format. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { RecordReferenceSchema, StoreRecordSchema } from "../../../../src/lib/store/index.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success, testProvenance, update } from "../../../helpers/store/suite-tools.js";

describe("primary role metadata", () => {
  it("uses the actual role's parser and supported format through either current or historical handle", async () => {
    const fixture = createReferenceFixture({}, {
      "work-item/record": { formatVersion: 1,
        parser: (content) => ({ success: true, data: { role: "errand", content } }) },
      "work-item/meta": { formatVersion: 2,
        parser: (content) => ({ success: true, data: { role: "work-unit", content } }) },
    });
    const store = fixture.store;
    const created = success(await store.write({ action: "put", reference: fixture.reference("work-item/record"),
      expected: null, content: "errand", placement: { kind: "active" }, provenance: testProvenance }));
    const before = success(await store.version());
    const meta = RecordReferenceSchema.parse({ ...created.reference, kind: "work-item/meta" });
    success(await store.write({ action: "put", reference: meta, expected: created.version!, content: "work-unit",
      placement: { kind: "active" }, provenance: testProvenance }));
    const after = success(await store.version());
    for (const reference of [created.reference, meta]) {
      for (const asOf of [undefined, after]) expect(success(await store.read({ reference, asOf }))).toMatchObject({
        reference: meta, formatVersion: 2, fields: { role: "work-unit", content: "work-unit" },
      });
      expect(success(await store.read({ reference, asOf: before }))).toMatchObject({
        reference: created.reference, formatVersion: 1, fields: { role: "errand", content: "errand" },
      });
    }
  });

  it("applies the destination role's existing completed-placement metadata on the same UID", async () => {
    const fixture = createReferenceFixture();
    const original = await seed(fixture, fixture.reference("work-item/record"));
    const completed = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
    success(await fixture.store.write({ ...update(fixture, original), placement: completed }));
    const archived = StoreRecordSchema.parse(success(await fixture.store.read({ reference: original.reference })));
    const meta = RecordReferenceSchema.parse({ ...archived.reference, kind: "work-item/meta" });
    success(await fixture.store.write({ ...update(fixture, archived, fixture.content(meta)), reference: meta,
      placement: completed }));
    const promoted = StoreRecordSchema.parse(success(await fixture.store.read({ reference: original.reference })));
    expect(promoted.reference).toEqual(meta);
    expect(promoted.placement).toEqual({ ...completed, sequence: "01" });
    success(await fixture.store.write({ ...update(fixture, promoted, fixture.content(original.reference)),
      reference: original.reference, placement: completed }));
    const restored = StoreRecordSchema.parse(success(await fixture.store.read({ reference: meta })));
    expect(restored.reference).toEqual(original.reference);
    expect(restored.placement).toEqual(completed);
    const listing = success(await fixture.store.list({ family: "work-item", owner: original.reference.owner }));
    expect(listing).toMatchObject({ status: "complete", records: [restored], diagnostics: [], missed: false });
  });
});
