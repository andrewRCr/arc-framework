import { describe, expect, it } from "vitest";
import { RecordReferenceSchema, type RecordReference } from "../../src/lib/store/identity.js";
import { KIND_REGISTRY } from "../../src/lib/store/registry.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { inRepoContent } from "../helpers/store/in-repo-fixture.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";

const uid = "12345678-1234-4234-8234-123456789abc";
const retiredUid = "abcdef12-1234-4234-8234-123456789abc";
const owner = { type: "work-item", name: "alpha", uid } as const;
const metadata = { formatVersion: 1, slug: "alpha", formats: {},
  primary: { role: "work-item/meta", placement: { kind: "active" } } };

describe.each(["files", "reftable"] as const)("registered ref decode (%s)", (format) => {
  it("round-trips every registered ref home through read and list", async () => {
    const f = await createRefReadFixture(format);
    const referenceFixture = createReferenceFixture();
    const groups = new Map<string, Map<string, PlantTreeEntry>>();
    const references: RecordReference[] = [];
    const expected: { kind: string; key?: unknown; owner: { type: string; name: string; uid?: string } }[] = [];
    for (const kind of Object.values(KIND_REGISTRY).filter((kind) => kind.ref)) {
      const origin = kind.family === "lineage";
      const errand = kind.id === "work-item/record";
      const recordOwner = kind.owner === "person" ? { type: "person", name: "andrew" }
        : kind.owner === "project" ? { type: "project", name: "project" }
          : { type: kind.owner, name: origin ? "retired" : errand ? "errand" : "alpha",
            uid: origin ? retiredUid : errand ? "23456789-1234-4234-8234-123456789abc"
              : kind.owner === "cohort" ? "56789012-1234-4234-8234-123456789abc" : uid };
      const key = kind.key === "pass" ? { activity: "design", number: 2 } : kind.id === "claims/groom" ? "groom-one"
        : kind.id === "personal/document" ? "extra.svg" : "one";
      const reference = RecordReferenceSchema.parse({ owner: recordOwner, kind: kind.id, ...(kind.key === null ? {} : { key }) });
      references.push(reference);
      expected.push({ kind: kind.id, ...(kind.key === null ? {} : { key }), owner: {
        type: recordOwner.type, name: recordOwner.name, ...("uid" in recordOwner ? { uid: recordOwner.uid } : {}),
      } });
      const home = expandStoredPath(reference);
      let entries = groups.get(home.ref);
      if (!entries) { entries = new Map(); groups.set(home.ref, entries); }
      const groupMetadata = { formatVersion: 1, formats: {}, ...(kind.owner === "cohort" ? { slug: "alpha" }
        : home.ref.startsWith("refs/arc/work/") ? { slug: recordOwner.name, primary: {
          role: errand ? "work-item/record" : "work-item/meta", placement: { kind: "active" } } }
          : home.ref === "refs/arc/project/registry" ? { lineage: { [retiredUid]: "retired" } } : {}) };
      entries.set(home.metadataPath, { path: home.metadataPath, content: canonicalize(groupMetadata) });
      const producer = PRODUCTION_REGISTRATIONS.some((registration) => registration.kind === kind.id)
        || kind.id === "review/candidate" || kind.id === "review/integration-boundary" || kind.family === "claims";
      const content = kind.id === "project-registry/identity" ? canonicalize({ projectId: "34567890-1234-4234-8234-123456789abc" })
        : producer && !kind.id.endsWith("/conflict-record") ? inRepoContent(reference) : referenceFixture.content(reference);
      entries.set(home.path, { path: home.path, content });
    }
    for (const [ref, entries] of groups) await plantRef(f.root, ref, [...entries.values()]);
    const reads = await Promise.allSettled(references.map((reference) => f.store.read({ reference })));
    const decoded = reads.map((result) => result.status === "fulfilled" && result.value.status === "ok" ? result.value.result.reference : result);
    expect(decoded).toMatchObject(expected);
    for (const family of new Set(references.map((reference) => KIND_REGISTRY[reference.kind].family))) {
      const listed = await f.store.list({ family });
      expect(listed, family).toMatchObject({ status: "ok", result: { status: "complete", diagnostics: [], missed: false } });
      if (listed.status !== "ok" || listed.result.status !== "complete") throw new Error("No complete listing");
      expect(listed.result.records.map((record) => record.reference.kind).sort()).toEqual(
        references.filter((reference) => KIND_REGISTRY[reference.kind].family === family).map((reference) => reference.kind).sort());
    }
  });
  it("keeps paired spec halves and hyphenated companion names distinct", async () => {
    const f = await createRefReadFixture(format);
    await plantRef(f.root, `refs/arc/work/${uid}`, [{ path: `metadata-${uid}.json`, content: canonicalize(metadata) },
      ...["spec-alpha-prd.md", "spec-alpha-rfc.md", "notes-extra-alpha.md"].map((path) => ({ path, content: "design" }))]);
    const listed = await f.store.list({ family: "work-item" });
    expect(listed).toMatchObject({ status: "ok", result: { status: "complete", records: expect.arrayContaining([
      expect.objectContaining({ reference: expect.objectContaining({ kind: "work-item/companion", key: "spec-prd" }) }),
      expect.objectContaining({ reference: expect.objectContaining({ kind: "work-item/companion", key: "spec-rfc" }) }),
      expect.objectContaining({ reference: expect.objectContaining({ kind: "work-item/companion", key: "notes-extra" }) }),
    ]), diagnostics: [], missed: false } });
    for (const key of ["spec-prd", "spec-rfc", "notes-extra"]) expect(await f.store.read({
      reference: RecordReferenceSchema.parse({ owner, kind: "work-item/companion", key }),
    })).toMatchObject({ status: "ok", result: { content: "design" } });
  });
  it("diagnoses fixed forms naming another slug or UID beside valid records", async () => {
    const f = await createRefReadFixture(format);
    const bad = ["meta-beta.md", `errand-${retiredUid}.json`, `review/candidate-${retiredUid}.json`];
    await plantRef(f.root, `refs/arc/work/${uid}`, [{ path: `metadata-${uid}.json`, content: canonicalize(metadata) },
      { path: "extra-alpha.md", content: "kept" }, ...bad.map((path) => ({ path, content: "{}" }))]);
    const listed = await f.store.list({ family: "work-item" });
    expect(listed).toMatchObject({ status: "ok", result: { status: "complete", records: [expect.objectContaining({ content: "kept" })],
      diagnostics: expect.arrayContaining(bad.map((key) => expect.objectContaining({ key, kind: "key-mismatch" }))), missed: true } });
  });
  it("diagnoses a personal path naming another person beside valid records", async () => {
    const f = await createRefReadFixture(format);
    await plantRef(f.root, "refs/arc/user/andrew/personal", [
      { path: "andrew/metadata-andrew.json", content: canonicalize({ formatVersion: 1, formats: {} }) },
      { path: "andrew/extra.txt", content: "kept" }, { path: "bea/extra.txt", content: "wrong owner" },
    ]);
    expect(await f.store.list({ family: "personal" })).toMatchObject({ status: "ok", result: { status: "complete",
      records: [expect.objectContaining({ content: "kept" })],
      diagnostics: [expect.objectContaining({ key: "bea/extra.txt", kind: "key-mismatch" })], missed: true } });
  });
  it("keeps raw companions while diagnosing unknown review and reserved subtree paths", async () => {
    const f = await createRefReadFixture(format);
    const valid = ["diagram.svg", "sub/notes.md", "README-alpha.md", "lineage/note.svg"];
    const bad = ["review/unknown.json", "conflicts/notes.md", "receipts/notes.md"];
    await plantRef(f.root, `refs/arc/work/${uid}`, [{ path: `metadata-${uid}.json`, content: canonicalize(metadata) },
      ...valid.map((path) => ({ path, content: "kept" })), ...bad.map((path) => ({ path, content: "{}" }))]);
    const listed = await f.store.list({ family: "work-item" });
    expect(listed).toMatchObject({ status: "ok", result: { status: "complete", records: expect.arrayContaining(valid.map((key) =>
      expect.objectContaining({ reference: expect.objectContaining({ kind: "work-item/companion", key }) }))),
      diagnostics: expect.arrayContaining(bad.map((key) => expect.objectContaining({ key, kind: "malformed" }))), missed: true } });
    if (listed.status !== "ok" || listed.result.status !== "complete") throw new Error("No listing");
    expect(listed.result.records).toHaveLength(valid.length);
  });
  it("diagnoses a root review file that cannot encode a companion reference", async () => {
    const f = await createRefReadFixture(format);
    await plantRef(f.root, `refs/arc/work/${uid}`, [{ path: `metadata-${uid}.json`, content: canonicalize(metadata) },
      { path: "review", content: "invalid" }, { path: "extra-alpha.md", content: "kept" }]);
    expect(await f.store.list({ family: "work-item" })).toMatchObject({ status: "ok", result: { status: "complete",
      records: [expect.objectContaining({ content: "kept" })],
      diagnostics: [expect.objectContaining({ key: "review", kind: "malformed" })], missed: true } });
  });
  it("diagnoses an unregistered cohort path instead of turning it into a companion", async () => {
    const f = await createRefReadFixture(format);
    await plantRef(f.root, `refs/arc/cohort/${uid}`, [{ path: `metadata-${uid}.json`, content: canonicalize({ formatVersion: 1, slug: "alpha", formats: {} }) },
      { path: "cohort-alpha.md", content: "# Cohort\n" }, { path: "diagram.svg", content: "unknown" }]);
    expect(await f.store.list({ family: "cohort" })).toMatchObject({ status: "ok", result: { status: "complete",
      records: [expect.objectContaining({ reference: expect.objectContaining({ kind: "cohort/document" }) })],
      diagnostics: [expect.objectContaining({ key: "diagram.svg", kind: "malformed" })], missed: true } });
  });
  it("rejects control characters, multi-segment IDs, and reserved role keys", async () => {
    const f = await createRefReadFixture(format);
    const workPaths = ["sub/bad\nnotes.md", "cohort-alpha.md", `review/evidence-bad/key-${uid}.json`,
      `review/adversarial-pass-bad/act-2-${uid}.json`];
    await plantRef(f.root, `refs/arc/work/${uid}`, [{ path: `metadata-${uid}.json`, content: canonicalize(metadata) },
      { path: "extra-alpha.md", content: "kept" }, ...workPaths.map((path) => ({ path, content: "{}" }))]);
    expect(await f.store.list({ family: "work-item" })).toMatchObject({ status: "ok", result: { status: "complete",
      records: [expect.objectContaining({ content: "kept" })], diagnostics: expect.arrayContaining(workPaths.map((key) =>
        expect.objectContaining({ key, kind: "malformed" }))), missed: true } });
  });
  it("rejects derived and machine-local personal keys while keeping nested status documents", async () => {
    const f = await createRefReadFixture(format);
    const personalPaths = ["andrew/STATUS.USER.md", "andrew/.internal/note.txt", "andrew/work/.internal/note.txt",
      "andrew/conflicts/note.txt", "andrew/receipts/note.txt"];
    await plantRef(f.root, "refs/arc/user/andrew/personal", [
      { path: "andrew/metadata-andrew.json", content: canonicalize({ formatVersion: 1, formats: {} }) },
      { path: "andrew/scratch/STATUS.USER.md", content: "kept" }, ...personalPaths.map((path) => ({ path, content: "{}" })),
    ]);
    expect(await f.store.list({ family: "personal" })).toMatchObject({ status: "ok", result: { status: "complete",
      records: [expect.objectContaining({ content: "kept" })], diagnostics: expect.arrayContaining(personalPaths.map((key) =>
        expect.objectContaining({ key, kind: "malformed" }))), missed: true } });
  });
});
