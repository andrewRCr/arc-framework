import { describe, expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

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
  it("leaves a ref whose name only resembles a UID out of every scan beside readable items", async () => {
    const f = await createRefReadFixture(format);
    await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: canonicalize(metadata) },
      { path: "meta-alpha.md", content: makeMetaFixture("alpha") }, { path: "extra-alpha.md", content: "kept" }]);
    const resembling = "12345678-1234-0234-8234-123456789abc";
    await plantRef(f.root, `refs/arc/work/${resembling}`, [{ path: `metadata-${resembling}.json`, content: canonicalize({ ...metadata, slug: "beta" }) },
      { path: "extra-beta.md", content: "outside" }]);
    expect(await f.store.list({ family: "work-item" })).toMatchObject({ status: "ok", result: { status: "complete", missed: false,
      records: expect.arrayContaining([expect.objectContaining({ content: "kept" })]) } });
    expect(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("alpha") }))
      .toMatchObject({ status: "ok", result: { reference: { owner: { type: "work-item", name: "alpha", uid } } } });
    const created = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "gamma" }, kind: "work-item/meta" });
    expect(await f.store.write({ action: "put", reference: created, expected: null, content: makeMetaFixture("gamma"),
      placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } })).toMatchObject({ status: "ok" });
  });
  it("reads a name-resolved record again in one process beside directories whose names are not UTF-8 or span lines", async () => {
    const f = await createRefReadFixture(format);
    const planted = await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: canonicalize(metadata) },
      { path: "extra-alpha.md", content: "kept" }]);
    const raw = createExecaRawGitExec(f.root), text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes).trim();
    const nested = text((await raw(["mktree", "-z"], { input: Buffer.from(`100644 blob ${planted.blobs.get("extra-alpha.md")}\tinner.md\0`) })).stdout);
    const rows = [Buffer.from([0x62, 0x61, 0x64, 0xff]), Buffer.from("two\nlines")]
      .map((name) => Buffer.concat([Buffer.from(`040000 tree ${nested}\t`), name, Buffer.from([0])]));
    const tree = text((await raw(["mktree", "-z"], { input: Buffer.concat([(await raw(["ls-tree", "-z", planted.tree])).stdout, ...rows]) })).stdout);
    await raw(["update-ref", ref, text((await raw(["commit-tree", tree, "-p", planted.tip, "-m", "Foreign directories"])).stdout)]);
    const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha" }, kind: "work-item/companion", key: "extra" });
    const first = await f.store.read({ reference });
    expect(first).toMatchObject({ status: "ok", result: { content: "kept" } });
    expect(await f.store.read({ reference })).toEqual(first);
  });
  it("lists an entry whose name is not UTF-8 as one malformed diagnostic and refuses to rewrite its tree", async () => {
    const f = await createRefReadFixture(format);
    const planted = await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: canonicalize(metadata) },
      { path: "extra-alpha.md", content: "kept" }]);
    await plantRef(f.root, otherRef, [{ path: `metadata-${otherUid}.json`, content: canonicalize({ ...metadata, slug: "beta" }) },
      { path: "extra-beta.md", content: "also kept" }]);
    const raw = createExecaRawGitExec(f.root), text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes).trim();
    const name = Buffer.from([0x62, 0x61, 0x64, 0xff, 0x2e, 0x6d, 0x64]);
    const foreign = Buffer.concat([Buffer.from(`100644 blob ${planted.blobs.get("extra-alpha.md")}\t`), name, Buffer.from([0])]);
    const tree = text((await raw(["mktree", "-z"], { input: Buffer.concat([(await raw(["ls-tree", "-z", planted.tree])).stdout, foreign]) })).stdout);
    const tip = text((await raw(["commit-tree", tree, "-p", planted.tip, "-m", "Foreign entry"])).stdout);
    await raw(["update-ref", ref, tip]);
    expect(await f.store.list({ family: "work-item" })).toMatchObject({ status: "ok", result: { status: "complete", missed: true,
      records: expect.arrayContaining([expect.objectContaining({ content: "kept" }), expect.objectContaining({ content: "also kept" })]),
      diagnostics: [{ kind: "malformed", key: "bad\uFFFD.md", condition: expect.stringContaining("UTF-8") }] } });
    const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha", uid }, kind: "work-item/companion", key: "added" });
    await expect(f.store.write({ action: "put", reference, expected: null, content: "added\n",
      provenance: { verb: "edit", lifecycleAction: "save" } })).rejects.toThrow(/not valid UTF-8/u);
    expect(text((await raw(["rev-parse", ref])).stdout)).toBe(tip);
  });
});
