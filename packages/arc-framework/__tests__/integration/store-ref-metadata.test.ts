import { describe, expect, it } from "vitest";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { inRepoContent } from "../helpers/store/in-repo-fixture.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";

const uid = "12345678-1234-4234-8234-123456789abc";
const owner = { type: "work-item", name: "alpha", uid } as const;
const ref = `refs/arc/work/${uid}`;
const reference = RecordReferenceSchema.parse({ owner, kind: "work-item/companion", key: "extra" });
const metadata = { formatVersion: 1, slug: "alpha", formats: {},
  primary: { role: "work-item/meta", placement: { kind: "active" } } };

describe.each(["files", "reftable"] as const)("ref metadata (%s)", (format) => {
  it("refuses unknown metadata fields and versions and resumes after forward repair", async () => {
    const f = await createRefReadFixture(format);
    const badForms = [{ ...metadata, unknown: true }, { ...metadata, primary: { ...metadata.primary, unknown: true } },
      { ...metadata, formatVersion: 2 }];
    const outcomes: { read: unknown; list: unknown; repairedRead: unknown; repairedList: unknown }[] = [];
    let prior: string | undefined;
    for (const bad of badForms) {
      const corrupt = await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: canonicalize(bad) },
        { path: "extra-alpha.md", content: "kept" }], { parents: prior ? [prior] : [] });
      const observed = await Promise.allSettled([f.store.read({ reference }), f.store.list({ family: "work-item" })]);
      const repaired = await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: canonicalize(metadata) },
        { path: "extra-alpha.md", content: "kept" }], { parents: [corrupt.tip] });
      prior = repaired.tip;
      outcomes.push({ read: observed[0].status === "fulfilled" ? observed[0].value : observed[0].reason,
        list: observed[1].status === "fulfilled" ? observed[1].value : observed[1].reason,
        repairedRead: await f.store.read({ reference }), repairedList: await f.store.list({ family: "work-item" }) });
    }
    expect(outcomes).toMatchObject(badForms.map(() => ({
      read: { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: ref,
        remedy: { text: expect.stringMatching(/repair|commit/iu) } } },
      list: { status: "ok", result: { status: "unreadable", condition: expect.stringContaining(ref) } },
      repairedRead: { status: "ok", result: { content: "kept" } },
      repairedList: { status: "ok", result: { status: "complete", diagnostics: [], missed: false } },
    })));
  });
  it("keeps canonical composite format keys through a rename and defaults only unlisted records", async () => {
    const f = await createRefReadFixture(format);
    const pass = RecordReferenceSchema.parse({ owner, kind: "review/adversarial-pass", key: { activity: "design-review", number: 2 } });
    const unlisted = RecordReferenceSchema.parse({ owner, kind: "review/evidence", key: "unlisted" });
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    const store = createRefStore({ ...f.ports, registry: { ...registry,
      "review/adversarial-pass": { ...registry["review/adversarial-pass"], formatVersion: 2 },
      "review/evidence": { ...registry["review/evidence"], formatVersion: 2 },
    } });
    const formats = { [canonicalize({ kind: pass.kind, key: pass.key })]: 2,
      [canonicalize({ kind: unlisted.kind, key: "another" })]: 2 };
    const records = [{ path: `review/adversarial-pass-design-review-2-${uid}.json`, content: "{}" },
      { path: `review/evidence-unlisted-${uid}.json`, content: "{}" }];
    const planted = await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: canonicalize({ ...metadata, formats }) }, ...records]);
    expect(await store.read({ reference: unlisted })).toMatchObject({ status: "ok", result: { formatVersion: 1 } });
    expect(await store.read({ reference: pass })).toMatchObject({ status: "ok", result: { formatVersion: 2, reference: pass } });
    await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: canonicalize({ ...metadata, slug: "beta", formerSlugs: ["alpha"], formats }) },
      ...records], { parents: [planted.tip] });
    expect(await store.read({ reference: pass })).toMatchObject({ status: "ok", result: { formatVersion: 2,
      reference: { owner: { ...owner, name: "beta" }, key: pass.key } } });
    expect(await store.list({ family: "review" })).toMatchObject({ status: "ok", result: { status: "complete", records: expect.arrayContaining([
      expect.objectContaining({ formatVersion: 2, reference: expect.objectContaining({ key: pass.key }) }),
      expect.objectContaining({ formatVersion: 1, reference: expect.objectContaining({ key: "unlisted" }) }),
    ]), diagnostics: [], missed: false } });
  });
  it("reads surviving records using a removed primary's metadata", async () => {
    const f = await createRefReadFixture(format);
    const placement = { kind: "backlog", commitment: "planned" };
    const links = { branches: [{ repository: "code", ref: "refs/heads/feat/alpha", linkedAs: "created", excluded: [] }] };
    await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: canonicalize({ ...metadata,
      primary: { role: "work-item/meta", placement, links } }) }, { path: "extra-alpha.md", content: "survived" }]);
    expect(await f.store.read({ reference })).toMatchObject({ status: "ok", result: { reference, content: "survived", placement } });
    const listing = await f.store.list({ family: "work-item" });
    expect(listing).toMatchObject({ status: "ok", result: { status: "complete", records: [expect.objectContaining({ placement })],
      diagnostics: [], missed: false } });
    if (listing.status !== "ok" || listing.result.status !== "complete") throw new Error("No complete listing");
    expect(listing.result.records[0]).not.toHaveProperty("links");
  });
  it("names each lineage origin by its own UID entry in registry metadata", async () => {
    const f = await createRefReadFixture(format);
    const secondUid = "abcdef12-1234-4234-8234-123456789abc";
    const references = [RecordReferenceSchema.parse({ owner: { ...owner, name: "retired-one" }, kind: "lineage/transition" }),
      RecordReferenceSchema.parse({ owner: { ...owner, uid: secondUid, name: "retired-two" }, kind: "lineage/transition" })];
    await plantRef(f.root, "refs/arc/project/registry", [{ path: "metadata-registry.json", content: canonicalize({
      formatVersion: 1, formats: {}, lineage: { [uid]: "retired-one", [secondUid]: "retired-two" },
    }) }, ...references.map((reference) => ({ path: expandStoredPath(reference).path, content: inRepoContent(reference) }))]);
    expect(await f.store.list({ family: "lineage" })).toMatchObject({ status: "ok", result: { status: "complete", records:
      references.map((reference) => expect.objectContaining({ reference })), diagnostics: [], missed: false } });
    for (const reference of references) expect(await f.store.read({ reference })).toMatchObject({ status: "ok", result: { reference } });
  });
  it("canonicalizes metadata keys before applying a record's format annotation", async () => {
    const f = await createRefReadFixture(format);
    const pass = RecordReferenceSchema.parse({ owner, kind: "review/adversarial-pass", key: { activity: "café", number: 2 } });
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    const store = createRefStore({ ...f.ports, registry: { ...registry,
      "review/adversarial-pass": { ...registry["review/adversarial-pass"], formatVersion: 2 },
    } });
    const key = canonicalize({ kind: pass.kind, key: pass.key }).normalize("NFD");
    await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: JSON.stringify({ ...metadata, formats: { [key]: 2 } }) },
      { path: `review/adversarial-pass-café-2-${uid}.json`, content: "{}" }]);
    expect(await store.read({ reference: pass })).toMatchObject({ status: "ok", result: { formatVersion: 2 } });
    expect(await store.list({ family: "review" })).toMatchObject({ status: "ok", result: { status: "complete",
      records: [expect.objectContaining({ formatVersion: 2, reference: pass })], diagnostics: [], missed: false } });
  });
});
