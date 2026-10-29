import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";

const uid = "12345678-1234-4234-8234-123456789abc";
const shapes = ["empty", "metadata", "manifest"] as const;

describe.each(["default", "separate"] as const)("record-free lookup trees in %s", layout => {
  it.each(["read", "write"] as const)("keeps a metadata-only reused generation out of named lineage %s", async mode => {
    const h = await refSyncFixture(layout), store = h.a.store, provenance = { verb: "edit", lifecycleAction: "save" };
    const named = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "reused" } });
    const first = success(await store.write({ action: "put", reference: named, expected: null,
      content: makeMetaFixture("reused"), placement: { kind: "active" }, provenance }));
    const original = success(await store.read({ reference: first.reference }));
    const owner = original.reference.owner;
    if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected an allocated origin");
    const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner });
    const content = JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2, kind: "abandon",
      origin: { name: owner.name, uid: owner.uid }, successors: [], incoming: [] }));
    success(await store.batch({ writes: [{ action: "put", reference: lineage, expected: null, content },
      { action: "remove", reference: original.reference, expected: original.version }], provenance }));
    const second = success(await store.write({ action: "put", reference: named, expected: null,
      content: makeMetaFixture("reused"), placement: { kind: "active" }, provenance }));
    const home = expandStoredPath(second.reference), parent = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
    await plantRef(h.a.root, home.ref, (await capturedEntries(h.a, home.ref)).filter(entry => entry.path !== home.path),
      { parents: [parent], gitDir: h.a.gitDir });
    const reference = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: { type: "work-item", name: "reused" } });
    const asOf = success(await store.version()), saved = success(await store.read({ reference, asOf }));
    expect(saved.reference).toEqual(lineage);
    if (mode === "read") expect(success(await store.read({ reference }))).toMatchObject({ reference: lineage, content: saved.content });
    else expect(success(await store.write({ action: "remove", reference, expected: saved.version, provenance })))
      .toMatchObject({ reference: lineage });
  });

  it.each(shapes)("reads a %s registry tree as absent and permits its first record", async shape => {
    const f = await createRefFixture({}, layout);
    const identity = f.reference("project-registry/identity"), home = expandStoredPath(identity);
    const entries: PlantTreeEntry[] = shape === "empty" ? [] : [{ path: shape === "metadata" ? home.metadataPath : `${home.manifestPath}retained`, content: "Auxiliary bytes\n" }];
    await plantRef(f.root, home.ref, entries, { gitDir: f.gitDir });
    expect(await f.store.lookup({ kind: "lineage", origin: "missing-origin" })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: { type: "work-item", name: "missing-origin" } });
    expect(await f.store.read({ reference: lineage })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const written = success(await f.store.write({ action: "put", reference: identity, expected: null,
      content: f.content(identity), provenance: { verb: "init", lifecycleAction: "save" } }));
    expect(success(await f.store.read({ reference: written.reference })).content).toBe(f.content(identity));
  });

  it.each(shapes)("ignores a %s live tree without an owner record during lookup and creation", async shape => {
    const f = await createRefFixture({}, layout);
    const requested = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "record-free-owner" } });
    const concrete = RecordReferenceSchema.parse({ ...requested, owner: { ...requested.owner, uid } }), home = expandStoredPath(concrete);
    const entries: PlantTreeEntry[] = shape === "empty" ? [] : [{ path: shape === "metadata" ? home.metadataPath : `${home.manifestPath}retained`, content: "Auxiliary bytes\n" }];
    await plantRef(f.root, home.ref, entries, { gitDir: f.gitDir });
    expect(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("record-free-owner") })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const written = success(await f.store.write({ action: "put", reference: requested, expected: null, content: f.content(requested),
      placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    expect(success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("record-free-owner") })).reference).toEqual(written.reference);
  });
});
