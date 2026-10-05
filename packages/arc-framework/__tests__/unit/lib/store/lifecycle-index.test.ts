/** Identity and completeness behavior of lifecycle queries through faithful public stores. */
import { describe, expect, it } from "vitest";
import { listLifecycleIndex, listHeldLifecycleIndex, isLifecycleSelectedHere } from "../../../../src/lib/store/lifecycle-index.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { parseMetaRecord } from "../../../../src/lib/active/meta-reader.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { OwnerIdentitySchema } from "../../../../src/lib/store/identity.js";
import { success, testProvenance } from "../../../helpers/store/suite-tools.js";

async function referenceStore() {
  const fixture = createReferenceFixture();
  const reference = fixture.reference("work-item/meta");
  success(await fixture.store.write({ action: "put", reference, content: JSON.stringify(parseMetaRecord(makeMetaFixture(reference.owner.name))), expected: null, placement: { kind: "active" }, provenance: testProvenance }));
  const store = fixture.store;
  // Reference's field parser is deliberately JSON; the public record retains exact Markdown bytes supplied here.
  const listed = success(await store.list({ family: "work-item", kind: "work-item/meta" }));
  if (listed.status !== "complete") throw new Error("Expected reference meta");
  const record = listed.records[0];
  if (!record) throw new Error("Expected reference record");
  return { fixture, store, reference: record.reference };
}

describe("lifecycle held-here bridge", () => {
  it("propagates the reference backend's unsupported refusal for held records", async () => {
    const { store } = await referenceStore();
    expect(await listHeldLifecycleIndex(store)).toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "held-here" } });
  });
  it("propagates the same refusal for selected-here agreement", async () => {
    const { store, reference } = await referenceStore();
    expect(await isLifecycleSelectedHere(store, { reference })).toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "held-here" } });
  });
});


describe("selected lifecycle identities and completeness", () => {
  it("resolves by the minted generation rather than object or slug equality", async () => {
    const { store, reference } = await referenceStore();
    const result = success(await listLifecycleIndex(store));
    if (result.status !== "complete") throw new Error("Expected selected work unit");
    const alias = OwnerIdentitySchema.parse({ ...reference.owner, name: "former-name" });
    expect(result.index.get(alias)?.reference).toEqual(reference);
    expect(result.index.get(OwnerIdentitySchema.parse({ type: "work-item", name: reference.owner.name }))).toBeUndefined();
    if (reference.owner.type === "person" || !reference.owner.uid) throw new Error("Expected minted identity");
    const uidAsSlug = OwnerIdentitySchema.parse({ type: "work-item", name: reference.owner.uid });
    expect(result.index.get(uidAsSlug)).toBeUndefined();
    expect(result.index.entries()).toHaveLength(1);
    expect(result.index.entries()[0]?.fields).toEqual(parseMetaRecord(makeMetaFixture(reference.owner.name)));
  });
  it("preserves unreadable-family evidence", async () => {
    const { fixture, store, reference } = await referenceStore();
    await fixture.plant(reference, "family-unreadable");
    const direct = success(await store.list({ family: "work-item", kind: "work-item/meta" }));
    expect(success(await listLifecycleIndex(store))).toEqual(direct);
    expect(direct.status).toBe("unreadable");
  });
  it("retains diagnostics, missed and the saved anchor when no entry can be indexed", async () => {
    const { fixture, store, reference } = await referenceStore();
    await fixture.plant(reference, "malformed");
    const direct = success(await store.list({ family: "work-item", kind: "work-item/meta" }));
    const result = success(await listLifecycleIndex(store));
    expect(result.status).toBe("complete");
    if (result.status !== "complete" || direct.status !== "complete") throw new Error("Expected diagnosed listing");
    expect(result.index.entries()).toEqual([]);
    expect(result.diagnostics).toEqual(direct.diagnostics);
    expect(result.missed).toBe(direct.missed);
    const empty = createReferenceFixture();
    const asOf = await empty.settle();
    expect(success(await listLifecycleIndex(empty.store, { asOf }))).toEqual({ status: "absent", asOf });
  });
});
