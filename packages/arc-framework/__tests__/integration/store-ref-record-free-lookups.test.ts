import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";

const uid = "12345678-1234-4234-8234-123456789abc";
const shapes = ["empty", "metadata", "manifest"] as const;

describe.each(["default", "separate"] as const)("record-free lookup trees in %s", layout => {
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
