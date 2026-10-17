import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { makeGitExec } from "../helpers/integration.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";

describe("shared live slug namespace", () => {
  it.each(["work-item/meta", "cohort/document"] as const)("refuses a cross-type create over %s, then admits a free slug", async (kind) => {
    const f = await createRefFixture();
    const existing = await seed(f, f.reference(kind));
    const other = kind === "work-item/meta" ? "cohort/document" : "work-item/meta";
    const reference = RecordReferenceSchema.parse({ kind: other, owner: { type: other === "cohort/document" ? "cohort" : "work-item",
      name: existing.reference.owner.name } });
    const mutation = { action: "put" as const, reference, content: f.content(reference), expected: null,
      ...(other === "work-item/meta" ? { placement: { kind: "active" as const } } : {}), provenance: testProvenance };
    const before = success(await f.store.version());
    expect(await f.store.write(mutation)).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match",
      candidates: expect.arrayContaining([expect.objectContaining({ owner: existing.reference.owner }),
        expect.objectContaining({ owner: expect.objectContaining({ type: reference.owner.type, name: reference.owner.name }) })]),
      remedy: { text: expect.stringMatching(/rename/iu) },
    } });
    expect(success(await f.store.version())).toBe(before);
    const free = RecordReferenceSchema.parse({ ...reference, owner: { ...reference.owner, name: "free-slug" } });
    success(await f.store.write({ ...mutation, reference: free, content: f.content(free) }));
    expect(success(await f.store.read({ reference: free })).reference.owner.name).toBe("free-slug");
  });

  it("refuses a cross-type collision created within one batch", async () => {
    const f = await createRefFixture();
    const work = f.reference("work-item/meta");
    const cohort = RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: work.owner.name } });
    expect(await f.store.batch({ writes: [
      { action: "put", reference: work, content: f.content(work), expected: null, placement: { kind: "active" } },
      { action: "put", reference: cohort, content: f.content(cohort), expected: null },
    ], provenance: testProvenance })).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match", candidates: expect.any(Array) } });
    expect((await makeGitExec(f.root)("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  });

  it("keeps a primary's slug occupied when its blob is unavailable", async () => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    if (primary.reference.owner.type !== "work-item") throw new Error("No work-item owner");
    const git = makeGitExec(f.root);
    const query = `refs/arc/work/${primary.reference.owner.uid}:meta-${primary.reference.owner.name}.md`;
    const oid = (await git("git", ["rev-parse", query])).stdout;
    await removeLooseObject(f.root, oid);
    const reference = RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: primary.reference.owner.name } });
    const mutation = { action: "put" as const, reference, expected: null, content: f.content(reference), provenance: testProvenance };
    expect(await f.store.write(mutation)).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match" } });
    const free = RecordReferenceSchema.parse({ ...reference, owner: { type: "cohort", name: "free-cohort" } });
    success(await f.store.write({ ...mutation, reference: free, content: f.content(free) }));
  });

  it("resolves an existing same-type create and refuses its expected absence", async () => {
    const f = await createRefFixture();
    const reference = f.reference("work-item/meta");
    const original = await seed(f, reference);
    expect(await f.store.write({ action: "put", reference, expected: null, content: f.content(reference, "changed"),
      placement: { kind: "active" }, provenance: testProvenance })).toMatchObject({ status: "refused", refusal: {
      code: "version-conflict", records: [original.reference],
    } });
    expect(success(await f.store.read({ reference })).version).toBe(original.version);
  });

  it.each(["work-item/meta", "cohort/document"] as const)("allows UID-addressed content writes through a planted clash with %s", async (kind) => {
    const f = await createRefFixture();
    const primary = await seed(f, f.reference("work-item/meta"));
    const uid = "abcdef12-1234-4234-8234-123456789abc";
    const owner = { type: kind === "cohort/document" ? "cohort" : "work-item", name: primary.reference.owner.name, uid };
    const other = RecordReferenceSchema.parse({ owner, kind });
    const work = kind === "work-item/meta";
    await plantRef(f.root, `refs/arc/${work ? "work" : "cohort"}/${uid}`, [
      { path: `metadata-${uid}.json`, content: canonicalize({ formatVersion: 1, formats: {}, slug: owner.name,
        ...(work ? { primary: { role: kind, placement: { kind: "active" } } } : {}) }) },
      { path: `${work ? "meta" : "cohort"}-${owner.name}.md`, content: f.content(other) },
    ]);
    const companion = RecordReferenceSchema.parse({ ...primary.reference, kind: "work-item/task-list" });
    success(await f.store.write({ action: "put", reference: companion, expected: null, content: f.content(companion), provenance: testProvenance }));
    expect(success(await f.store.read({ reference: companion })).placement).toEqual({ kind: "active" });
    const content = f.content(primary.reference, "changed");
    const changed = success(await f.store.write({ action: "put", reference: primary.reference, expected: primary.version, content,
      placement: { kind: "active" }, provenance: testProvenance }));
    expect(success(await f.store.read({ reference: primary.reference })).content).toBe(content);
    expect(await f.store.write({ action: "put", reference: primary.reference, expected: changed.version!, content,
      placement: { kind: "backlog", commitment: "planned" }, provenance: testProvenance }))
      .toMatchObject({ status: "refused", refusal: { code: "ambiguous-match" } });
    expect(success(await f.store.read({ reference: primary.reference })).version).toBe(changed.version);
  });
});

describe("lineage origin namespace", () => {
  it("writes, resolves, lists, and removes independent origins in registry metadata", async () => {
    const f = await createRefFixture();
    const reference = f.reference("lineage/transition");
    const other = f.reference("lineage/transition", "two");
    const first = await seed(f, reference);
    const second = await seed(f, other);
    if (first.reference.owner.type !== "work-item" || second.reference.owner.type !== "work-item") throw new Error("No lineage owners");
    const firstUid = first.reference.owner.uid!;
    const secondUid = second.reference.owner.uid!;
    const git = makeGitExec(f.root);
    const metadata = async () => JSON.parse((await git("git", ["show", "refs/arc/project/registry:metadata-registry.json"])).stdout);
    expect((await metadata()).lineage).toEqual({ [firstUid]: reference.owner.name, [secondUid]: other.owner.name });
    expect((await metadata()).slug).toBeUndefined();
    expect(success(await f.store.read({ reference })).reference).toEqual(first.reference);
    expect(await f.store.list({ family: "lineage" })).toMatchObject({ status: "ok", result: { status: "complete", missed: false,
      records: expect.arrayContaining([expect.objectContaining({ reference: first.reference }), expect.objectContaining({ reference: second.reference })]),
    } });
    success(await f.store.write({ action: "remove", reference, expected: first.version, provenance: testProvenance }));
    expect((await metadata()).lineage).toEqual({ [secondUid]: other.owner.name });
    expect(await f.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await f.store.read({ reference: other })).reference).toEqual(second.reference);
  });

  it("keeps an ended UID addressable for lineage while refusing writes on its absent owner ref", async () => {
    const f = await createRefFixture();
    const uid = "abcdef12-1234-4234-8234-123456789abc";
    const owner = { type: "work-item", name: "retired", uid };
    const missing = RecordReferenceSchema.parse({ owner, kind: "work-item/task-list" });
    expect(await f.store.write({ action: "put", reference: missing, expected: null, content: f.content(missing), provenance: testProvenance }))
      .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const reference = RecordReferenceSchema.parse({ owner, kind: "lineage/transition" });
    success(await f.store.write({ action: "put", reference, expected: null, content: f.content(reference), provenance: testProvenance }));
    expect(success(await f.store.read({ reference })).reference).toEqual(reference);
  });

  it("requires a UID when multiple lineage generations share a name", async () => {
    const f = await createRefFixture();
    const first = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: { type: "work-item", name: "retired",
      uid: "abcdef12-1234-4234-8234-123456789abc" } });
    const second = RecordReferenceSchema.parse({ ...first, owner: { ...first.owner, uid: "abcdef34-1234-4234-8234-123456789abc" } });
    for (const reference of [first, second]) success(await f.store.write({ action: "put", reference, expected: null,
      content: f.content(reference), provenance: testProvenance }));
    const byName = RecordReferenceSchema.parse({ kind: first.kind, owner: { type: "work-item", name: first.owner.name } });
    expect(await f.store.read({ reference: byName })).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match", candidates: [first, second] } });
    expect(await f.store.write({ action: "put", reference: byName, expected: null, content: f.content(byName), provenance: testProvenance }))
      .toMatchObject({ status: "refused", refusal: { code: "ambiguous-match", candidates: [first, second] } });
    expect(success(await f.store.read({ reference: second })).reference).toEqual(second);
  });

  it("reads a lineage conflict's owner from its content and refuses a different requested owner", async () => {
    const f = await createRefFixture();
    const reference = RecordReferenceSchema.parse({ kind: "lineage/conflict-record", key: "clash", owner: {
      type: "work-item", name: "retired", uid: "abcdef12-1234-4234-8234-123456789abc",
    } });
    success(await f.store.write({ action: "put", reference, expected: null, content: f.content(reference), provenance: testProvenance }));
    expect(success(await f.store.read({ reference })).reference).toEqual(reference);
    expect(await f.store.list({ family: "lineage" })).toMatchObject({ status: "ok", result: { status: "complete", missed: false,
      records: [expect.objectContaining({ reference })],
    } });
    const wrong = RecordReferenceSchema.parse({ ...reference, owner: { ...reference.owner, uid: "abcdef34-1234-4234-8234-123456789abc" } });
    expect(await f.store.read({ reference: wrong })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
});
