/** Invalid UID spellings refuse admission and hold corrupt published namespaces without throwing. */
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema, runStoreConflict } from "../../src/lib/store/index.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

const uppercase = "A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D";

describe.each(["default", "separate"] as const)("stored UID admission in %s", layout => {
  it("refuses an uppercase lineage owner without changing state", async () => {
    const f = await createRefFixture({}, layout), reference = f.reference("lineage/transition");
    const invalid = { ...reference, owner: { ...reference.owner, uid: uppercase } } as typeof reference;
    const before = success(await f.store.version());
    expect(await f.store.write({ action: "put", reference: invalid, expected: null,
      content: f.content(reference), provenance: testProvenance }))
      .toMatchObject({ status: "refused", refusal: { code: "record-malformed" } });
    expect(success(await f.store.version())).toBe(before);
  });

  it("refuses an uppercase conflict operand without throwing", async () => {
    const f = await createRefFixture({}, layout);
    expect(await runStoreConflict(f.ports, { uid: uppercase, kind: "work-item/conflict-record", id: "conflict" }))
      .toMatchObject({ status: "refused" });
  });

  it.each(["lineage", "lineageFormerSlugs"] as const)("holds an uppercase %s registry key on pull and push", async field => {
    const h = await refSyncFixture(layout), ref = "refs/arc/project/registry";
    const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } });
    success(await h.a.store.write({ action: "put", reference, expected: null, content: makeMetaFixture("alpha"),
      placement: { kind: "active" }, provenance: testProvenance }));
    success(await h.a.store.write({ action: "put", reference: RecordReferenceSchema.parse({ kind: "project-registry/identity",
      owner: { type: "project", name: "project" } }), expected: null,
      content: '{"projectId":"34567890-1234-4234-8234-123456789abc"}', provenance: testProvenance }));
    success(await h.a.store.push());
    success(await h.b.store.pull());
    const tip = (await h.a.git(["rev-parse", ref])).stdout;
    const metadata = JSON.parse((await h.a.git(["show", `${tip}:metadata-registry.json`])).stdout) as Record<string, unknown>;
    metadata[field] = { [uppercase]: field === "lineage" ? "alpha" : ["alpha"] };
    const rows = (await h.a.git(["ls-tree", "-r", tip])).stdout.split("\n").filter(Boolean);
    const entries: PlantTreeEntry[] = rows.map(row => {
      const [header, path = ""] = row.split("\t"), oid = header?.split(" ")[2] ?? "";
      return path === "metadata-registry.json" ? { path, content: canonicalize(metadata) } : { path, oid, mode: "100644" };
    });
    await plantRef(h.a.root, ref, entries, { parents: [tip], gitDir: h.a.gitDir });
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    const pulled = await h.b.store.pull();
    expect(JSON.stringify(pulled)).toContain("namespace-corrupt");
    expect(JSON.stringify(await h.b.store.push())).toContain("namespace-corrupt");
  });
});
