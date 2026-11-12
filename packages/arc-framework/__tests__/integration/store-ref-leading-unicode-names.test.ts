import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";
import { ConflictRecordSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRef } from "../helpers/store/ref-plant.js";

describe.each(["default", "separate"] as const)("literal leading Unicode names in %s", layout => {
  it.each(["read", "rewrite", "sync"] as const)("keeps distinct leading-marker names through %s", async mode => {
    const h = await refSyncFixture(layout);
    const primary = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "literal-names" }, kind: "work-item/meta" }),
      content: makeMetaFixture("literal-names"), placement: { kind: "active" },
      provenance: { verb: "start", lifecycleAction: "activate" } }));
    const references = ["\uFEFFkept.svg", "kept.svg"].map(key =>
      RecordReferenceSchema.parse({ owner: primary.reference.owner, kind: "work-item/companion", key }));
    success(await h.a.store.batch({ writes: references.map((reference, index) => ({ action: "put", reference,
      expected: null, content: `Distinct content ${index}\n` })), provenance: testProvenance }));
    if (mode === "rewrite") success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: primary.reference.owner, kind: "work-item/companion", key: "sibling.svg" }),
      content: "An unrelated sibling\n", provenance: testProvenance }));
    if (mode === "sync") { success(await h.a.store.push()); success(await h.b.store.pull()); }
    const store = mode === "sync" ? h.b.store : h.a.store;
    const snapshot = success(await store.version());
    for (const asOf of [undefined, snapshot]) {
      for (const [index, reference] of references.entries()) {
        expect(await store.read({ reference, asOf })).toMatchObject({ status: "ok", result: { reference,
          content: `Distinct content ${index}\n` } });
      }
      const listing = success(await store.list({ family: "work-item", owner: primary.reference.owner,
        kind: "work-item/companion", asOf }));
      expect(listing).toMatchObject({ status: "complete", missed: false, diagnostics: [] });
      if (listing.status !== "complete") throw new Error("No complete companion listing");
      expect(listing.records.map(record => record.reference.key).sort()).toEqual(
        [...references.map(reference => reference.key), ...(mode === "rewrite" ? ["sibling.svg"] : [])].sort());
    }
  }, 60_000);

  it("retains the leading codepoint in open conflict references", async () => {
    const f = await createRefFixture({}, layout), uid = "12345678-1234-4234-8234-123456789abc";
    const owner = { type: "work-item", name: "literal-conflict", uid } as const;
    const reference = RecordReferenceSchema.parse({ owner, kind: "work-item/companion", key: "kept.svg" });
    const conflict = RecordReferenceSchema.parse({ owner, kind: "work-item/conflict-record", key: "\uFEFFdeadbeef" });
    const label = { actor: "andrew@clone", time: "2026-10-16T00:00:00.000Z" };
    const content = ConflictRecordSchema.parse({ record: reference, location: { kind: "hunk", start: 0, end: 1 },
      base: "base", current: { content: "ours", label }, incoming: { content: "theirs", label },
      baseVersion: null, currentLines: 1, incomingLines: 1 });
    await plantRef(f.root, `refs/arc/work/${uid}`, [
      { path: `metadata-${uid}.json`, content: JSON.stringify({ formatVersion: 1, slug: owner.name, formats: {},
        primary: { role: "work-item/meta", placement: { kind: "active" } } }) },
      { path: "kept.svg", content: "ours" }, { path: "conflicts/\uFEFFdeadbeef.json", content: JSON.stringify(content) },
    ], { gitDir: f.gitDir });
    const snapshot = success(await f.store.version());
    for (const asOf of [undefined, snapshot]) {
      expect(await f.store.read({ reference, asOf })).toMatchObject({ status: "ok", result: { conflicts: [conflict] } });
      expect(await f.store.read({ reference: conflict, asOf })).toMatchObject({ status: "ok", result: { reference: conflict } });
    }
  });
});
