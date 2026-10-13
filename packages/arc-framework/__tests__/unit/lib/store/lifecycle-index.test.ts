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


describe("lifecycle record rejection evidence", () => {
  it.each(["Unknown", null])("diagnoses an unrecognized State and resumes after repair: %s", async state => {
    const { fixture, store, reference } = await referenceStore();
    const fields = parseMetaRecord(makeMetaFixture(reference.owner.name));
    const previous = success(await store.read({ reference }));
    success(await store.write({ action: "put", reference, expected: previous.version, placement: { kind: "active" },
      content: JSON.stringify({ ...fields, state }), provenance: testProvenance }));
    const asOf = await fixture.settle();

    const result = success(await listLifecycleIndex(store, { asOf }));

    expect(result).toMatchObject({ status: "complete", asOf, missed: true,
      diagnostics: [expect.objectContaining({ kind: "malformed", key: `work-item/meta:${reference.owner.name}` })] });
    if (result.status !== "complete") throw new Error("Expected rejected record evidence");
    expect(result.index.entries()).toEqual([]);
    expect(result.diagnostics[0]?.condition).toContain(reference.owner.name);
    expect(result.diagnostics[0]?.condition).toContain(`State ${JSON.stringify(state)}`);
    expect(result.diagnostics[0]?.remedy.text).toMatch(/Repair.*then.*retry/);
    const broken = success(await store.read({ reference }));
    success(await store.write({ action: "put", reference, expected: broken.version, placement: { kind: "active" },
      content: JSON.stringify(fields), provenance: testProvenance }));
    const repaired = success(await listLifecycleIndex(store));
    expect(repaired).toMatchObject({ status: "complete", missed: false, diagnostics: [] });
    if (repaired.status !== "complete") throw new Error("Expected repaired record");
    expect(repaired.index.get(reference.owner)?.fields).toEqual(fields);
  });
  it("diagnoses unparseable fields without inventing a lifecycle entry, then resumes after repair", async () => {
    const { store, reference } = await referenceStore();
    const previous = success(await store.read({ reference }));
    success(await store.write({ action: "put", reference, expected: previous.version, placement: { kind: "active" },
      content: "{}", provenance: testProvenance }));

    const result = success(await listLifecycleIndex(store));

    expect(result).toMatchObject({ status: "complete", missed: true,
      diagnostics: [expect.objectContaining({ kind: "malformed", key: `work-item/meta:${reference.owner.name}` })] });
    if (result.status !== "complete") throw new Error("Expected rejected record evidence");
    expect(result.index.entries()).toEqual([]);
    expect(result.diagnostics[0]?.condition).toContain(reference.owner.name);
    expect(result.diagnostics[0]?.condition).toContain("missing metadata H1");
    expect(result.diagnostics[0]?.remedy.text).toMatch(/Repair.*then.*retry/);
    const broken = success(await store.read({ reference }));
    success(await store.write({ action: "put", reference, expected: broken.version, placement: { kind: "active" },
      content: JSON.stringify(parseMetaRecord(makeMetaFixture(reference.owner.name))), provenance: testProvenance }));
    expect(success(await listLifecycleIndex(store))).toMatchObject({ status: "complete", missed: false, diagnostics: [] });
  });
});
