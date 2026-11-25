import { describe, expect, it } from "vitest";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { createRefStore } from "../../src/lib/store/create.js";
import type { StoreRecord } from "../../src/lib/store/read.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { inRepoContent } from "../helpers/store/in-repo-fixture.js";

const uid = "12345678-1234-4234-8234-123456789abc";
const owner = { type: "work-item", name: "alpha", uid } as const;
const ref = `refs/arc/work/${uid}`;
const primary = RecordReferenceSchema.parse({ owner, kind: "work-item/meta" });
const companion = RecordReferenceSchema.parse({ owner, kind: "work-item/companion", key: "extra" });
const metadata = { formatVersion: 1, slug: "alpha", formats: {},
  primary: { role: "work-item/meta", placement: { kind: "active" } } };
const entries = [{ path: "meta-alpha.md", content: inRepoContent(primary) }, { path: "extra-alpha.md", content: "kept" }];

function versions(records: readonly StoreRecord[]): Record<string, string> {
  return Object.fromEntries(records.map((record) => [record.reference.kind, record.version]));
}

describe.each(["files", "reftable"] as const)("ref record versions (%s)", (format) => {
  it("moves only the primary's version when only its placement changes", async () => {
    const f = await createRefReadFixture(format);
    const first = await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: canonicalize(metadata) }, ...entries]);
    const before = await f.store.list({ family: "work-item" });
    await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: canonicalize({ ...metadata,
      primary: { ...metadata.primary, placement: { kind: "backlog", commitment: "planned" } } }) }, ...entries], { parents: [first.tip] });
    const after = await f.store.list({ family: "work-item" });
    if (before.status !== "ok" || before.result.status !== "complete" || after.status !== "ok" || after.result.status !== "complete") {
      throw new Error("Expected two complete listings");
    }
    const oldVersions = versions(before.result.records);
    const newVersions = versions(after.result.records);
    expect(newVersions[primary.kind]).not.toBe(oldVersions[primary.kind]);
    expect(newVersions[companion.kind]).toBe(oldVersions[companion.kind]);
    for (const reference of [primary, companion]) {
      expect(await f.store.read({ reference })).toMatchObject({ status: "ok", result: { version: newVersions[reference.kind] } });
    }
    expect(after.result.records).toHaveLength(2);
    expect(after.result.diagnostics).toEqual([]);
  });
  it("keeps one version across distinct tips and read times at equal bytes and metadata", async () => {
    const f = await createRefReadFixture(format);
    let tick = 0;
    const store = createRefStore({ ...f.ports, clock: () => new Date(Date.UTC(2026, 0, 1) + tick++ * 1000) });
    const tree = [{ path: `metadata-${uid}.json`, content: canonicalize(metadata) }, ...entries];
    const first = await plantRef(f.root, ref, tree, { message: "first state" });
    const before = await store.read({ reference: companion });
    const second = await plantRef(f.root, ref, tree, { parents: [first.tip], message: "same state, later commit" });
    const after = await store.read({ reference: companion });
    if (before.status !== "ok" || after.status !== "ok") throw new Error("Expected both reads to succeed");
    expect(second.tip).not.toBe(first.tip);
    expect(after.result.version).toBe(before.result.version);
    expect(await store.list({ family: "work-item" })).toMatchObject({ status: "ok", result: { status: "complete",
      records: expect.arrayContaining([expect.objectContaining({ reference: companion, version: before.result.version })]),
      diagnostics: [], missed: false } });
  });

});
