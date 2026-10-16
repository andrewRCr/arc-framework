import { describe, expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { plantRef } from "../helpers/store/ref-plant.js";

const uid = "12345678-1234-4234-8234-123456789abc";
const otherUid = "abcdef12-1234-4234-8234-123456789abc";
const ref = `refs/arc/work/${uid}`;
const otherRef = `refs/arc/work/${otherUid}`;
const metadata = { formatVersion: 1, slug: "alpha", formats: {},
  primary: { role: "work-item/meta", placement: { kind: "active" } } };

describe.each(["files", "reftable"] as const)("ref namespace diagnostics (%s)", (format) => {
  it("distinguishes an absent family from one whose every ref is unreadable", async () => {
    const f = await createRefReadFixture(format);
    const absent = await f.store.list({ family: "work-item" });
    await plantRef(f.root, ref, [{ path: "extra-alpha.md", content: "requires metadata" }]);
    const unreadable = await f.store.list({ family: "work-item" });
    expect({ absent, unreadable }).toMatchObject({ absent: { status: "ok", result: { status: "absent" } },
      unreadable: { status: "ok", result: { status: "unreadable", condition: expect.stringContaining(ref),
        remedy: { text: expect.stringMatching(/repair|commit/iu) } } } });
  });
  it("keeps missing or unparseable metadata local to its ref and resumes after forward repair", async () => {
    const f = await createRefReadFixture(format);
    await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: canonicalize(metadata) },
      { path: "extra-alpha.md", content: "kept" }]);
    const broken = await plantRef(f.root, otherRef, [{ path: "extra-beta.md", content: "restored" }]);
    const missing = await f.store.list({ family: "work-item" });
    const invalid = await plantRef(f.root, otherRef, [{ path: `metadata-${otherUid}.json`, content: "invalid JSON" },
      { path: "extra-beta.md", content: "restored" }], { parents: [broken.tip] });
    const unparseable = await f.store.list({ family: "work-item" });
    await plantRef(f.root, otherRef, [{ path: `metadata-${otherUid}.json`, content: canonicalize({ ...metadata, slug: "beta" }) },
      { path: "extra-beta.md", content: "restored" }], { parents: [invalid.tip] });
    const repaired = await f.store.list({ family: "work-item" });
    for (const listing of [missing, unparseable]) expect(listing).toMatchObject({ status: "ok", result: { status: "complete",
      records: [expect.objectContaining({ content: "kept" })], missed: true,
      diagnostics: [expect.objectContaining({ kind: "unreadable", key: otherRef })] } });
    expect(repaired).toMatchObject({ status: "ok", result: { status: "complete", missed: false, diagnostics: [],
      records: expect.arrayContaining([expect.objectContaining({ content: "kept" }), expect.objectContaining({ content: "restored" })]) } });
  });
  it("diagnoses records under a metadata filename naming a different UID", async () => {
    const f = await createRefReadFixture(format);
    await plantRef(f.root, ref, [{ path: `metadata-${otherUid}.json`, content: canonicalize(metadata) },
      { path: "extra-alpha.md", content: "ambiguous owner" }]);
    await plantRef(f.root, otherRef, [{ path: `metadata-${otherUid}.json`, content: canonicalize({ ...metadata, slug: "beta" }) },
      { path: "extra-beta.md", content: "kept" }]);
    expect(await f.store.list({ family: "work-item" })).toMatchObject({ status: "ok", result: { status: "complete",
      records: [expect.objectContaining({ content: "kept" })], missed: true,
      diagnostics: [expect.objectContaining({ kind: "key-mismatch", key: "extra-alpha.md" })] } });
  });
  it("reports metadata lacking its owner's slug without throwing or losing other refs", async () => {
    const f = await createRefReadFixture(format);
    await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: canonicalize({ formatVersion: 1, formats: {}, primary: metadata.primary }) },
      { path: "extra-alpha.md", content: "unresolved owner" }]);
    await plantRef(f.root, otherRef, [{ path: `metadata-${otherUid}.json`, content: canonicalize({ ...metadata, slug: "beta" }) },
      { path: "extra-beta.md", content: "kept" }]);
    const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha", uid }, kind: "work-item/companion", key: "extra" });
    const observed = await Promise.allSettled([f.store.list({ family: "work-item" }), f.store.read({ reference })]);
    expect(observed).toMatchObject([{ status: "fulfilled", value: { status: "ok", result: { status: "complete",
      records: [expect.objectContaining({ content: "kept" })], missed: true,
      diagnostics: [expect.objectContaining({ kind: "unreadable", key: ref })] } } },
    { status: "fulfilled", value: { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: ref } } }]);
  });

});
