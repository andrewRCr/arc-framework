import { describe, expect, it } from "vitest";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { inRepoContent } from "../helpers/store/in-repo-fixture.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";

const uid = "12345678-1234-4234-8234-123456789abc";
const owner = { type: "work-item", name: "alpha", uid } as const;
const ref = `refs/arc/work/${uid}`;
const metadata = { formatVersion: 1, slug: "alpha", formats: {},
  primary: { role: "work-item/meta", placement: { kind: "active" } } };
const good = RecordReferenceSchema.parse({ owner, kind: "review/evidence", key: "good" });
const future = RecordReferenceSchema.parse({ owner, kind: "review/evidence", key: "future" });

describe.each(["files", "reftable"] as const)("ref diagnostics (%s)", (format) => {
  it("keeps readable records beside each malformed, missing, newer, and mismatched entry", async () => {
    const f = await createRefReadFixture(format);
    const lostPath = `review/terminus-lost-${uid}.json`;
    const wrongPath = "review/evidence-wrong-abcdef12-1234-4234-8234-123456789abc.json";
    const planted = await plantRef(f.root, ref, [
      { path: `metadata-${uid}.json`, content: canonicalize({ ...metadata,
        formats: { [canonicalize({ kind: future.kind, key: future.key })]: 2 } }) },
      { path: `review/evidence-good-${uid}.json`, content: "{}" },
      { path: `review/evidence-future-${uid}.json`, content: "{}" },
      { path: `review/outcome-bad-${uid}.json`, content: "not JSON" },
      { path: lostPath, content: '{"lost":true}' },
      { path: "review/unknown.json", content: "{}" }, { path: wrongPath, content: "{}" },
    ]);
    await removeLooseObject(f.root, planted.blobs.get(lostPath)!);
    expect(await f.store.list({ family: "review" })).toMatchObject({ status: "ok", result: { status: "complete",
      records: [expect.objectContaining({ reference: good })], missed: true,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ kind: "unreadable", key: lostPath }),
        expect.objectContaining({ kind: "malformed", key: `review/outcome-bad-${uid}.json` }),
        expect.objectContaining({ kind: "malformed", key: "review/unknown.json" }),
        expect.objectContaining({ kind: "unknown-format-version", key: `review/evidence-future-${uid}.json` }),
        expect.objectContaining({ kind: "key-mismatch", key: wrongPath }),
      ]),
    } });
  });
  it("refuses a newer format and reads it after rebuilding with a supporting registry", async () => {
    const f = await createRefReadFixture(format);
    await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: canonicalize({ ...metadata,
      formats: { [canonicalize({ kind: future.kind, key: future.key })]: 2 } }) },
      { path: `review/evidence-future-${uid}.json`, content: "{}" }]);
    expect(await f.store.read({ reference: future })).toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", class: "recoverable", reference: future, rule: expect.stringContaining("format"),
      remedy: { text: expect.stringMatching(/merge base|rebuild/u) },
    } });
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    const repaired = createRefStore({ ...f.ports, registry: { ...registry,
      "review/evidence": { ...registry["review/evidence"], formatVersion: 2 },
    } });
    expect(await repaired.read({ reference: future })).toMatchObject({ status: "ok", result: { reference: future, formatVersion: 2 } });
    expect(await repaired.list({ family: "review" })).toMatchObject({ status: "ok", result: { status: "complete",
      records: [expect.objectContaining({ reference: future, formatVersion: 2 })], diagnostics: [], missed: false } });
  });

  it("returns canonical never-projected JSON while preserving JSON-named personal prose", async () => {
    const f = await createRefReadFixture(format);
    const bytes = '{ "z": "cafe\\u0301", "a": 1 }';
    await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: canonicalize(metadata) },
      { path: `review/evidence-good-${uid}.json`, content: bytes }]);
    const personal = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "notes.json" });
    await plantRef(f.root, "refs/arc/user/andrew/personal", [{ path: "andrew/metadata-andrew.json", content: canonicalize({ formatVersion: 1, formats: {} }) },
      { path: "andrew/notes.json", content: bytes }]);
    expect(await f.store.read({ reference: good })).toMatchObject({ status: "ok", result: { content: '{"a":1,"z":"café"}' } });
    expect(await f.store.list({ family: "review" })).toMatchObject({ status: "ok", result: { status: "complete",
      records: [expect.objectContaining({ content: '{"a":1,"z":"café"}' })], diagnostics: [], missed: false } });
    expect(await f.store.read({ reference: personal })).toMatchObject({ status: "ok", result: { content: bytes } });
  });

  it("caps projected records by UTF-8 bytes and admits larger never-projected records", async () => {
    const f = await createRefReadFixture(format);
    const boundary = "😀".repeat(1024 * 1024 / 4);
    const large = boundary + "😀";
    const machine = canonicalize({ text: large });
    await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: canonicalize(metadata) },
      { path: "boundary-alpha.md", content: boundary }, { path: "large-alpha.md", content: large },
      { path: `review/evidence-good-${uid}.json`, content: machine }]);
    expect(await f.store.list({ family: "work-item" })).toMatchObject({ status: "ok", result: { status: "complete",
      records: [expect.objectContaining({ content: boundary })], missed: true,
      diagnostics: [expect.objectContaining({ kind: "oversized", key: "large-alpha.md" })] } });
    expect(await f.store.read({ reference: good })).toMatchObject({ status: "ok", result: { content: machine } });
    expect(await f.store.list({ family: "review" })).toMatchObject({ status: "ok", result: { status: "complete",
      records: [expect.objectContaining({ content: machine })], diagnostics: [], missed: false } });
  });

  it.each(format === "files" ? ["loose", "packed"] : ["table"])("reports missing tips and root trees beside readable and empty refs (%s)", async (storage) => {
    const f = await createRefReadFixture(format);
    await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: canonicalize(metadata) },
      { path: "extra-alpha.md", content: "kept" }]);
    const missingTipRef = "refs/arc/work/abcdef12-1234-4234-8234-123456789abc";
    const missingTreeRef = "refs/arc/work/abcdef34-1234-4234-8234-123456789abc";
    const emptyRef = "refs/arc/work/abcdef56-1234-4234-8234-123456789abc";
    const missingTip = await plantRef(f.root, missingTipRef, [{ path: "unique-tip", content: "tip" }]);
    const missingTree = await plantRef(f.root, missingTreeRef, [{ path: "unique-tree", content: "tree" }]);
    await plantRef(f.root, emptyRef, []);
    if (storage === "packed") await f.exec("git", ["pack-refs", "--all"]);
    await removeLooseObject(f.root, missingTip.tip);
    await removeLooseObject(f.root, missingTree.tree);
    const listing = await f.store.list({ family: "work-item" });
    expect(listing).toMatchObject({ status: "ok", result: { status: "complete",
      records: [expect.objectContaining({ content: "kept" })], missed: true,
      diagnostics: expect.arrayContaining([expect.objectContaining({ kind: "unreadable", key: missingTipRef }),
        expect.objectContaining({ kind: "unreadable", key: missingTreeRef })]) } });
    if (listing.status !== "ok" || listing.result.status !== "complete") throw new Error("No complete listing");
    expect(listing.result.diagnostics).toHaveLength(2);

  });

  it("keeps parser failures and parsed owner mismatches beside valid lineage records", async () => {
    const f = await createRefReadFixture(format);
    const wrongUid = "abcdef12-1234-4234-8234-123456789abc";
    const validUid = "abcdef34-1234-4234-8234-123456789abc";
    const wrong = RecordReferenceSchema.parse({ owner: { ...owner, name: "wrong", uid: wrongUid }, kind: "lineage/transition" });
    const valid = RecordReferenceSchema.parse({ owner: { ...owner, name: "valid", uid: validUid }, kind: "lineage/transition" });
    await plantRef(f.root, "refs/arc/project/registry", [{ path: "metadata-registry.json", content: canonicalize({
      formatVersion: 1, formats: {}, lineage: { [uid]: "alpha", [wrongUid]: "expected", [validUid]: "valid" },
    }) }, { path: `lineage/${uid}.json`, content: '{"invalid":true}' },
      { path: `lineage/${wrongUid}.json`, content: inRepoContent(wrong) },
      { path: `lineage/${validUid}.json`, content: inRepoContent(valid) }]);
    expect(await f.store.list({ family: "lineage" })).toMatchObject({ status: "ok", result: { status: "complete",
      records: [expect.objectContaining({ reference: valid })], missed: true, diagnostics: expect.arrayContaining([
        expect.objectContaining({ kind: "malformed", key: `lineage/${uid}.json` }),
        expect.objectContaining({ kind: "key-mismatch", key: `lineage/${wrongUid}.json` }),
      ]) } });
  });

  it("reports a lineage origin UID mismatch even when its name matches, and reads the repaired entry", async () => {
    const f = await createRefReadFixture(format);
    const foreignUid = "abcdef12-1234-4234-8234-123456789abc";
    const reference = RecordReferenceSchema.parse({ owner, kind: "lineage/transition" });
    const path = `lineage/${uid}.json`;
    const content = (originUid: string) => canonicalize(LineageRecordSchema.parse({ ...JSON.parse(inRepoContent(reference)),
      origin: { name: owner.name, uid: originUid } }));
    const entries = (content: string) => [{ path: "metadata-registry.json", content: canonicalize({ formatVersion: 1, formats: {}, lineage: { [uid]: owner.name } }) },
      { path, content }];
    const planted = await plantRef(f.root, "refs/arc/project/registry", entries(content(foreignUid)));
    expect(await f.store.list({ family: "lineage" })).toMatchObject({ status: "ok", result: { status: "complete", records: [], missed: true,
      diagnostics: [expect.objectContaining({ kind: "key-mismatch", key: path })],
    } });
    await plantRef(f.root, "refs/arc/project/registry", entries(content(uid)), { parents: [planted.tip] });
    expect(await f.store.read({ reference })).toMatchObject({ status: "ok", result: { reference } });
  });

});
