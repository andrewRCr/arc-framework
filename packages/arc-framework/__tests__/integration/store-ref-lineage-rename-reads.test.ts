/** Lineage origins keep their authenticated transition names after their live generation is renamed. */
import { expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { LineageRecordSchema, writeLineageRecord } from "../../src/lib/store/kinds/lineage/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";

it.each(["default", "separate"] as const)("reads and lists unchanged lineage after renaming its live origin in %s", async layout => {
  const h = await refSyncFixture(layout);
  const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("original"),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "original" } }),
    placement: { kind: "active" }, provenance: testProvenance }));
  const owner = made.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected an allocated owner");
  const lineage = RecordReferenceSchema.parse({ owner, kind: "lineage/transition" });
  const content = writeLineageRecord(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: owner.name, uid: owner.uid },
    kind: "abandon", successors: [], incoming: [] }));
  success(await h.a.store.write({ action: "put", reference: lineage, content, expected: null, provenance: testProvenance }));
  let current = success(await h.a.store.read({ reference: made.reference }));
  for (const name of ["intermediate", "current"]) {
    const reference = RecordReferenceSchema.parse({ ...current.reference, owner: { ...owner, name } });
    success(await h.a.store.write({ action: "put", reference, expected: current.version, content: makeMetaFixture(name),
      placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "rename" } }));
    current = success(await h.a.store.read({ reference }));
    const expected = RecordReferenceSchema.parse({ ...lineage, owner: current.reference.owner });
    expect(success(await h.a.store.read({ reference: expected })).content).toBe(content);
    expect(await h.a.store.list({ family: "lineage" })).toMatchObject({ status: "ok", result: { status: "complete",
      missed: false, diagnostics: [], records: [expect.objectContaining({ reference: expected, content })] } });
    for (const origin of [owner.uid, "original", name]) {
      expect(success(await h.a.store.lookup({ kind: "lineage", origin })).reference).toEqual(expected);
    }
  }
});
