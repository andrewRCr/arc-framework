/** Authenticated retired-owner metadata may describe every record-free merge-side shape. */
import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { HistoryRefSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { LineageRecordSchema, writeLineageRecord } from "../../src/lib/store/kinds/lineage/index.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("retired record-free merge in %s", layout => {
  it.each(["metadata", "manifest-root", "manifest-child"] as const)("merges a divergent authenticated %s side and retains its removal", async shape => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "retired" } }),
      expected: null, content: makeMetaFixture("retired"), placement: { kind: "active" }, provenance: testProvenance }));
    const current = success(await h.a.store.read({ reference: made.reference })), owner = current.reference.owner;
    if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected an authenticated origin");
    const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner });
    const content = writeLineageRecord(LineageRecordSchema.parse({ schemaVersion: 2, kind: "abandon", origin: { name: owner.name, uid: owner.uid }, successors: [], incoming: [] }));
    success(await h.a.store.batch({ writes: [{ action: "put", reference: lineage, expected: null, content },
      { action: "remove", reference: current.reference, expected: current.version }], provenance: testProvenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const home = expandStoredPath(current.reference, { history: true }), base = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
    await h.b.git(["fetch", h.remoteName, `${home.ref}:${home.ref}`]);
    const local = await plantRef(h.a.root, home.ref, [{ path: shape === "metadata" ? home.metadataPath
      : shape === "manifest-root" ? home.manifestPath.slice(0, -1) : home.manifestPath + "retained", content: "Auxiliary bytes\n" }],
    { parents: [base], message: "Local record-free retired state", gitDir: h.a.gitDir });
    const incoming = await plantRef(h.b.root, home.ref, [], { parents: [base], message: "Incoming empty retired state", gitDir: h.b.gitDir });
    await h.b.git(["push", h.remoteName, `${incoming.tip}:${home.ref}`]);
    const pulled = success(await h.a.store.pull({ history: [HistoryRefSchema.parse(home.ref)] }));
    expect(pulled.pulls.flatMap(({ notices }) => notices)).toEqual([]);
    const merged = (await h.a.git(["rev-list", "--parents", "-n", "1", home.ref])).stdout.trim().split(" ");
    expect(merged.slice(1)).toEqual([local.tip, incoming.tip]);
    expect(await h.a.store.read({ reference: current.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await h.a.store.read({ reference: lineage })).content).toBe(content);
    expect(success(await h.a.store.history({ reference: current.reference })).map(({ content }) => content)).toEqual([null, current.content]);
  }, 60_000);
  it("retains the retired-owner prerequisite for synthetic metadata and retries after real metadata repair", async () => {
    const h = await refSyncFixture(layout);
    const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "unclaimed", uid: "12345678-1234-4234-8234-123456789abc" } });
    const home = expandStoredPath(reference), base = await plantRef(h.a.root, home.ref, [], { gitDir: h.a.gitDir });
    await h.a.git(["push", h.remoteName, `${base.tip}:${home.ref}`]);
    await h.b.git(["fetch", h.remoteName, `${home.ref}:${home.ref}`]);
    const local = await plantRef(h.a.root, home.ref, [{ path: home.manifestPath + "retained", content: "Auxiliary bytes\n" }],
      { parents: [base.tip], message: "Local unclaimed record-free state", gitDir: h.a.gitDir });
    const incoming = await plantRef(h.b.root, home.ref, [], { parents: [base.tip], message: "Incoming unclaimed record-free state", gitDir: h.b.gitDir });
    await h.b.git(["push", h.remoteName, `${incoming.tip}:${home.ref}`]);
    const pulled = success(await h.a.store.pull());
    expect(pulled.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref }));
    expect((await h.a.git(["rev-parse", home.ref])).stdout.trim()).toBe(local.tip);
    const metadata = { formatVersion: 1, formats: {}, slug: "unclaimed" };
    await h.a.git(["push", h.remoteName, `${local.tip}:refs/testing/unclaimed-local`]);
    await h.b.git(["fetch", h.remoteName, "refs/testing/unclaimed-local"]);
    const repaired = await plantRef(h.b.root, home.ref, [{ path: home.metadataPath, content: JSON.stringify(metadata) }],
      { parents: [local.tip, incoming.tip], gitDir: h.b.gitDir });
    await h.b.git(["push", h.remoteName, `${repaired.tip}:${home.ref}`]);
    expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
    expect((await h.a.git(["rev-parse", home.ref])).stdout.trim()).toBe(repaired.tip);
  }, 60_000);
});
