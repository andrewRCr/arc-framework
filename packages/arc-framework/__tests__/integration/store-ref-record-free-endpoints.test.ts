/** One record-free membership rule governs public readers, history, changes and fetched endpoints. */
import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath, type StoredRecordHome } from "../../src/lib/store/stored-path.js";

const shapes = ["empty", "metadata", "manifest-root", "manifest-child"] as const;
function entries(home: StoredRecordHome, shape: typeof shapes[number]) {
  return shape === "empty" ? [] : [{ path: shape === "metadata" ? home.metadataPath
    : shape === "manifest-root" ? home.manifestPath.slice(0, -1) : home.manifestPath + "retained", content: "Auxiliary bytes\n" }];
}

describe.each(["default", "separate"] as const)("record-free endpoints in %s", layout => {
  it.each(shapes)("reads, histories and compares a %s endpoint without inventing records", async shape => {
    const f = await createRefFixture({}, layout), reference = f.reference("personal/document"), home = expandStoredPath(reference);
    const from = await f.settle();
    await plantRef(f.root, home.ref, entries(home, shape), { gitDir: f.gitDir });
    expect(await f.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect.soft(await f.store.history({ reference })).toEqual({ status: "ok", result: [] });
    expect(await f.store.changes({ from, to: await f.settle(), references: [reference] })).toEqual({ status: "ok", result: [] });
  });

  it.each(shapes)("fetches a %s endpoint and permits a repaired first record", async shape => {
    const h = await refSyncFixture(layout);
    const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "first.md" });
    const home = expandStoredPath(reference), planted = await plantRef(h.origin, home.ref, entries(home, shape), { gitDir: h.origin });
    const pulled = success(await h.a.store.pull());
    expect(pulled.pulls.flatMap(({ notices }) => notices)).toEqual([]);
    expect((await h.a.git(["rev-parse", home.ref])).stdout.trim()).toBe(planted.tip);
    expect(await h.a.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "First real record.\n", provenance: testProvenance }));
    expect(success(await h.a.store.read({ reference })).content).toBe("First real record.\n");
  });

  it("refuses a real record without metadata and admits a repaired endpoint", async () => {
    const h = await refSyncFixture(layout);
    const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "damaged.md" });
    const home = expandStoredPath(reference);
    const damaged = await plantRef(h.origin, home.ref, [{ path: home.path, content: "Missing required metadata.\n" }], { gitDir: h.origin });
    const refused = success(await h.a.store.pull());
    expect(refused.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref }));
    expect((await h.a.git(["for-each-ref", "--format=%(refname)", home.ref])).stdout).toBe("");
    const repaired = await plantRef(h.origin, home.ref, entries(home, "manifest-child"), { parents: [damaged.tip], gitDir: h.origin });
    expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
    expect((await h.a.git(["rev-parse", home.ref])).stdout.trim()).toBe(repaired.tip);
  });

  it("refuses an unavailable tree and retries after its objects are restored", async () => {
    const f = await createRefFixture({}, layout), reference = f.reference("personal/document"), home = expandStoredPath(reference);
    const planted = await plantRef(f.root, home.ref, entries(home, "manifest-child"), { gitDir: f.gitDir });
    await removeLooseObject(f.root, planted.tree, f.gitDir);
    expect(await f.store.history({ reference })).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", condition: expect.stringContaining("unavailable locally") } });
    await plantRef(f.root, home.ref, entries(home, "manifest-child"), { gitDir: f.gitDir });
    expect(await f.store.history({ reference })).toEqual({ status: "ok", result: [] });
  });

  it.each(["empty", "manifest-root", "manifest-child"] as const)("reports no-record retired %s history without corrupting its authenticated lineage", async shape => {
    const f = await createRefFixture({}, layout), requested = f.reference("work-item/meta");
    const made = success(await f.store.write({ action: "put", reference: requested, expected: null,
      content: f.content(requested), placement: { kind: "active" }, provenance: testProvenance }));
    const current = success(await f.store.read({ reference: made.reference }));
    const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: current.reference.owner });
    success(await f.store.batch({ writes: [{ action: "put", reference: lineage, expected: null, content: f.content(lineage) },
      { action: "remove", reference: current.reference, expected: current.version }], provenance: testProvenance }));
    const home = expandStoredPath(current.reference, { history: true });
    await plantRef(f.root, home.ref, entries(home, shape), { gitDir: f.gitDir });
    expect(await f.store.history({ reference: current.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await f.store.read({ reference: lineage })).content).toBe(f.content(lineage));
    await plantRef(f.root, home.ref, [{ path: home.path, content: current.content }], { gitDir: f.gitDir });
    expect(await f.store.history({ reference: current.reference })).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt" } });
    await plantRef(f.root, home.ref, entries(home, shape), { gitDir: f.gitDir });
    expect(await f.store.history({ reference: current.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
});
