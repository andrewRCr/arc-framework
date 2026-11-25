/** Companion admission validates the prepared namespace without partial mutation. */
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { BatchInputSchema, ListingOutcomeSchema, RecordReferenceSchema, StoreRecordSchema } from "../../../../src/lib/store/index.js";
import { ReferenceBackend } from "../../../helpers/store/reference-backend.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success, testProvenance } from "../../../helpers/store/suite-tools.js";

describe("reference companion placement admission", () => {
  it.each([false, true])("refuses a new orphan without state or identity allocation; caller UID: %s", async (uid) => {
    const fixture = createReferenceFixture();
    const backend = fixture.store as ReferenceBackend;
    const original = fixture.reference("work-item/task-list");
    const reference = RecordReferenceSchema.parse({ ...original, owner: { ...original.owner, ...(uid ? { uid: randomUUID() } : {}) } });
    const before = structuredClone(backend.state);
    const put = { action: "put" as const, reference, expected: null, content: fixture.content(reference), provenance: testProvenance };
    const refusal = await fixture.store.write(put);
    expect(refusal).toMatchObject({ status: "refused", refusal: { class: "recoverable", condition: expect.stringContaining("primary"), remedy: { text: expect.stringContaining("primary") } } });
    expect(backend.state).toEqual(before);
    expect(await fixture.store.batch({ writes: [put], provenance: testProvenance })).toMatchObject({ status: "refused" });
    expect(backend.state).toEqual(before);
    await seed(fixture, RecordReferenceSchema.parse({ owner: reference.owner, kind: "work-item/meta" }));
    success(await fixture.store.write(put));
    expect(StoreRecordSchema.parse(success(await fixture.reopen().read({ reference }))).placement).toEqual({ kind: "active" });
  });

  it.each([false, true])("retains companion placement after an atomic creation and primary removal; companion first: %s", async (first) => {
    const fixture = createReferenceFixture();
    const primary = fixture.reference("work-item/meta"), companion = fixture.reference("work-item/task-list");
    const putPrimary = { action: "put" as const, reference: primary, expected: null, content: fixture.content(primary), placement: { kind: "active" as const } };
    const putCompanion = { action: "put" as const, reference: companion, expected: null, content: fixture.content(companion) };
    const result = success(await fixture.store.batch(BatchInputSchema.parse({ writes: first ? [putCompanion, putPrimary] : [putPrimary, putCompanion], provenance: testProvenance })));
    const saved = success(await fixture.store.version());
    const canonicalPrimary = result.writes.find((write) => write.reference.kind === primary.kind)!;
    const canonicalCompanion = result.writes.find((write) => write.reference.kind === companion.kind)!;
    const original = StoreRecordSchema.parse(success(await fixture.store.read({ reference: canonicalCompanion.reference })));
    success(await fixture.store.write({ action: "remove", reference: canonicalPrimary.reference, expected: canonicalPrimary.version!, provenance: testProvenance }));
    expect(StoreRecordSchema.parse(success(await fixture.reopen().read({ reference: canonicalCompanion.reference })))).toEqual(original);
    expect(success(await fixture.store.read({ reference: canonicalCompanion.reference, asOf: saved }))).toEqual(original);
    expect(ListingOutcomeSchema.parse(success(await fixture.store.list({ family: "work-item" })))).toMatchObject({ status: "complete", records: [original] });
    expect(success(await fixture.store.history({ reference: canonicalCompanion.reference }))).toMatchObject([{ version: original.version, content: original.content }]);
  });

  it("refuses review companions until their primary exists", async () => {
    const fixture = createReferenceFixture();
    const reference = fixture.reference("review/adversarial-pass");
    const put = { action: "put" as const, reference, expected: null, content: fixture.content(reference), provenance: testProvenance };
    expect(await fixture.store.write(put)).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("primary") } });
    await seed(fixture, RecordReferenceSchema.parse({ owner: reference.owner, kind: "work-item/meta" }));
    success(await fixture.store.write(put));
    expect(StoreRecordSchema.parse(success(await fixture.store.read({ reference }))).placement).toEqual({ kind: "active" });
  });

  it("keeps an absent-primary conflict record valid", async () => {
    const fixture = createReferenceFixture();
    const reference = fixture.reference("work-item/conflict-record");
    success(await fixture.store.write({ action: "put", reference, expected: null, content: fixture.content(reference), provenance: testProvenance }));
    expect(StoreRecordSchema.parse(success(await fixture.store.read({ reference })))).not.toHaveProperty("placement");
  });
});
