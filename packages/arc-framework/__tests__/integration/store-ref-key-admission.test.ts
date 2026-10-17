import { describe, expect, it } from "vitest";
import { RecordReferenceSchema, type RecordReference, type Mutation, type StoreResult } from "../../src/lib/store/index.js";
import { createRefFixture, type RefConformanceFixture } from "../helpers/store/ref-fixture.js";
import { makeGitExec } from "../helpers/integration.js";
import { seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";

const document = (key: string) => RecordReferenceSchema.parse({ owner: { type: "person", name: "test-user" }, kind: "personal/document", key });
const put = (reference: RecordReference, content = "text"): Mutation => ({ action: "put", reference, content, expected: null });
const refs = async (fixture: RefConformanceFixture) => (await makeGitExec(fixture.root)("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
async function apply(fixture: RefConformanceFixture, operation: "write" | "batch", mutation: Mutation): Promise<StoreResult<unknown>> {
  return operation === "write" ? fixture.store.write({ ...mutation, provenance: testProvenance })
    : fixture.store.batch({ writes: [put(document("safe-sibling.md")), mutation], provenance: testProvenance });
}

describe("ref key admission", () => {
  for (const operation of ["write", "batch"] as const) {
    it(`refuses reserved keys before resolution through ${operation} and admits a corrected key`, async () => {
      const fixture = await createRefFixture();
      fixture.identity(undefined);
      expect(await apply(fixture, operation, put(document("USER-INBOX.md"))))
        .toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "unhomed-kind", condition: expect.stringContaining("personal/inbox") } });
      fixture.identity("test-user");
      expect(await refs(fixture)).toBe("");
      success(await apply(fixture, operation, put(document("scratch/conflicts"))));
      expect(success(await fixture.store.read({ reference: document("scratch/conflicts") })).content).toBe("text");
    });
    it(`refuses verbatim companion aliases through ${operation} and admits an unclaimed path`, async () => {
      const fixture = await createRefFixture();
      const root = await seed(fixture, fixture.reference("work-item/meta"));
      const companion = (key: string) => RecordReferenceSchema.parse({ owner: root.reference.owner, kind: "work-item/companion", key });
      const before = await refs(fixture);
      for (const key of ["spec", `extra-${root.reference.owner.name}.md`, `spec-${root.reference.owner.name}-prd.md`, "meta-other.md",
        `metadata-${root.reference.owner.type !== "person" ? root.reference.owner.uid : ""}.json`, "review/unknown.json"]) {
        expect(await apply(fixture, operation, put(companion(key))), key).toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "unhomed-kind" } });
        expect(await refs(fixture)).toBe(before);
      }
      success(await apply(fixture, operation, put(companion("sub/conflicts.md"))));
      expect(success(await fixture.store.read({ reference: companion("sub/conflicts.md") })).content).toBe("text");
      for (const key of [`README-${root.reference.owner.name}.md`, "lineage/notes.md", "notes-extra", "spec-prd", "spec-rfc", "extra"]) {
        success(await fixture.store.write({ ...put(companion(key)), provenance: testProvenance }));
        expect(success(await fixture.store.read({ reference: companion(key) })).reference.key).toBe(key);
      }
    });
    it(`refuses malformed keys through ${operation} without changing refs`, async () => {
      const fixture = await createRefFixture();
      const root = await seed(fixture, fixture.reference("work-item/meta"));
      const before = await refs(fixture);
      const malformed = [document("STATUS.USER.md"), document(".internal/notes.md"), document("work/.internal/notes.md"), document("scratch/bad\n.md")];
      for (const key of ["a/b", "a\0b", "a\nb"]) {
        malformed.push(RecordReferenceSchema.parse({ owner: root.reference.owner, kind: "review/evidence", key }));
        malformed.push(RecordReferenceSchema.parse({ owner: root.reference.owner, kind: "review/adversarial-pass", key: { activity: key, number: 1 } }));
      }
      for (const reference of malformed) {
        expect(await apply(fixture, operation, put(reference, reference.kind.startsWith("review/") ? "{}" : "text")))
          .toMatchObject({ status: "refused", refusal: { code: "record-malformed", reference } });
        expect(await refs(fixture)).toBe(before);
      }
      success(await apply(fixture, operation, put(document("scratch/STATUS.USER.md"))));
    });
    it(`refuses either stored file/folder collision through ${operation} and admits replacement after removal`, async () => {
      const fixture = await createRefFixture();
      let record = await seed(fixture, document("scratch/item"), "original");
      for (const target of [document("scratch/item/child.md"), document("scratch/item")]) {
        const before = await refs(fixture);
        expect(await apply(fixture, operation, put(target))).toMatchObject({ status: "refused", refusal: {
          code: "unsupported", case: "unhomed-kind", condition: expect.stringContaining(String(record.reference.key)) } });
        expect(await refs(fixture)).toBe(before);
        expect(success(await fixture.store.read({ reference: record.reference })).content).toBe(record.content);
        success(await fixture.store.batch({ writes: [{ action: "remove", reference: record.reference, expected: record.version }, put(target)], provenance: testProvenance }));
        record = success(await fixture.store.read({ reference: target }));
      }
    });
  }

  it.each([
    ["write", "uid"], ["write", "name"], ["batch", "uid"], ["batch", "name"],
  ] as const)("keeps resolved-owner generic aliases invalid through %s with a %s operand and admits repair", async (operation, handle) => {
    const fixture = await createRefFixture(), root = await seed(fixture, fixture.reference("work-item/meta"));
    const owner = handle === "uid" ? root.reference.owner : fixture.reference("work-item/meta").owner;
    const invalid = RecordReferenceSchema.parse({ owner, kind: "work-item/companion", key: `extra-${owner.name}.md` });
    const before = await refs(fixture);
    expect(await apply(fixture, operation, put(invalid))).toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "unhomed-kind" } });
    expect(await refs(fixture)).toBe(before);
    const corrected = RecordReferenceSchema.parse({ ...invalid, key: "extra" });
    success(await apply(fixture, operation, put(corrected)));
    expect(success(await fixture.store.read({ reference: corrected })).content).toBe("text");
  });

  it.each([
    ["write", "uid"], ["write", "name"], ["batch", "uid"], ["batch", "name"],
  ] as const)("admits a valid old-name-shaped literal path through %s with a %s hint", async (operation, handle) => {
    const fixture = await createRefFixture(), named = fixture.reference("work-item/meta"), root = await seed(fixture, named);
    const renamed = RecordReferenceSchema.parse({ ...root.reference, owner: { ...root.reference.owner, name: "renamed" } });
    success(await fixture.store.write({ ...update(fixture, root, root.content), reference: renamed }));
    const owner = handle === "uid" ? root.reference.owner : named.owner;
    const reference = RecordReferenceSchema.parse({ owner, kind: "work-item/companion", key: `extra-${named.owner.name}.md` });
    success(await apply(fixture, operation, put(reference)));
    expect(success(await fixture.store.read({ reference })).content).toBe("text");
    expect(success(await fixture.store.read({ reference: RecordReferenceSchema.parse({ ...reference, owner: renamed.owner }) })).content).toBe("text");
  });

  it("refuses folder collisions within a batch in either order before requiring personal identity", async () => {
    const fixture = await createRefFixture();
    fixture.identity(undefined);
    const writes = [put(document("scratch/item")), put(document("scratch/item/child.md"))];
    for (const batch of [writes, [...writes].reverse()]) {
      expect(await fixture.store.batch({ writes: batch, provenance: testProvenance }))
        .toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "unhomed-kind" } });
      expect(await refs(fixture)).toBe("");
    }
    fixture.identity("test-user");
    success(await fixture.store.batch({ writes: [writes[0]!, put(document("scratch/other.md"))], provenance: testProvenance }));
  });

  it("refuses direct reads through a companion alias while retaining the owning spec", async () => {
    const fixture = await createRefFixture();
    const record = await seed(fixture, fixture.reference("work-item/spec"), "spec bytes");
    for (const key of ["spec", `spec-${record.reference.owner.name}.md`]) {
      const reference = RecordReferenceSchema.parse({ ...record.reference, kind: "work-item/companion", key });
      expect(await fixture.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "unhomed-kind", condition: expect.stringContaining("work-item/spec") } });
    }
    expect(success(await fixture.store.read({ reference: record.reference })).content).toBe("spec bytes");
  });

  it("serializes racing file and folder puts against the captured tips", async () => {
    const fixture = await createRefFixture();
    const parent = { ...put(document("scratch/item")), provenance: testProvenance };
    const child = { ...put(document("scratch/item/child.md")), provenance: testProvenance };
    const outcomes = await fixture.race(parent, child);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["ok", "refused"]);
    const refusal = outcomes.find((outcome) => outcome.status === "refused");
    expect(refusal).toMatchObject({ refusal: { code: "unsupported", case: "unhomed-kind" } });
    const listing = success(await fixture.store.list({ family: "personal", kind: "personal/document" }));
    expect(listing.status).toBe("complete");
    if (listing.status !== "complete") throw new Error("No complete race result");
    expect(listing.records).toHaveLength(1);
    expect(listing.records[0]?.content).toBe("text");
    expect(listing.diagnostics).toEqual([]);
    success(await fixture.store.write({ ...put(document("scratch/repaired.md")), provenance: testProvenance }));
  });

  it("refuses derived and machine-local reads before resolving identity", async () => {
    const fixture = await createRefFixture();
    fixture.identity(undefined);
    for (const key of ["STATUS.USER.md", ".internal/note.md", "work/.internal/note.md"]) {
      const reference = document(key);
      expect(await fixture.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "record-malformed", reference } });
    }
    fixture.identity("test-user");
    await seed(fixture, document("scratch/STATUS.USER.md"), "kept");
    expect(success(await fixture.store.read({ reference: document("scratch/STATUS.USER.md") })).content).toBe("kept");
  });
});
