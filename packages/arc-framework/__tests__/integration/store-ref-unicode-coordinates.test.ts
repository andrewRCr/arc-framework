import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { withOpaqueReview } from "../helpers/store/opaque-review.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";

describe.each(["default", "separate"] as const)("distinct record coordinates in %s", layout => {
  it("keeps a newer-format fault local to its exact Unicode coordinate", async () => {
    const f = await createRefFixture({}, layout), provenance = { verb: "review", lifecycleAction: "save" };
    const primary = f.reference("work-item/meta");
    const owner = success(await f.store.write({ action: "put", reference: primary, expected: null, content: f.content(primary),
      placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    const references = ["cafe\u0301", "caf\u00e9"].map(key => RecordReferenceSchema.parse({ owner: owner.reference.owner, kind: "review/evidence", key }));
    const [damaged, healthy] = references;
    if (!damaged || !healthy) throw new Error("Expected two exact Unicode coordinates");
    for (const reference of references) success(await f.store.write({ action: "put", reference, expected: null, content: f.content(reference), provenance }));
    const saved = success(await f.store.read({ reference: healthy }));
    await f.plant(damaged, "unknown-format-version");
    expect(await f.store.read({ reference: damaged })).toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", condition: expect.stringContaining("newer") } });
    expect(success(await f.store.read({ reference: healthy }))).toEqual(saved);
    expect(success(await f.store.list({ family: "review", owner: owner.reference.owner }))).toMatchObject({
      status: "complete", missed: true, diagnostics: [expect.objectContaining({ kind: "unknown-format-version" })] });
  });

  it.each((["review/evidence", "review/adversarial-pass"] as const).flatMap(kind =>
    (["ascii", "unicode"] as const).map(spelling => ({ kind, spelling }))))("keeps independent $spelling $kind additions with identical bytes", async ({ kind, spelling }) => {
    const h = withOpaqueReview(await refSyncFixture(layout));
    const made = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "coordinate-owner" } }),
      content: makeMetaFixture("coordinate-owner"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const keys = spelling === "ascii" ? ["first", "second"] : ["caf\u00e9", "cafe\u0301"];
    const references = keys.map(key => RecordReferenceSchema.parse({ owner: made.reference.owner, kind,
      key: kind === "review/adversarial-pass" ? { activity: key, number: 1 } : key }));
    const [first, second] = references;
    if (!first || !second) throw new Error("Expected two distinct coordinates");
    const content = JSON.stringify({ evidence: "Same readable machine-record bytes" });
    const provenance = { verb: "review", lifecycleAction: "save" };
    success(await h.a.store.write({ action: "put", reference: first, expected: null, content, provenance }));
    success(await h.b.store.write({ action: "put", reference: second, expected: null, content, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    for (const reference of references) {
      expect(await h.b.store.read({ reference })).toMatchObject({ status: "ok", result: { reference, content: expect.stringContaining("Same readable") } });
    }
  }, 60_000);

  it.each(["review/evidence", "review/adversarial-pass"] as const)("isolates current and saved formats for distinct %s keys", async kind => {
    // The pass kind carries the composite key here; its production create-only rule would refuse the rewrite and removal.
    const f = await createRefFixture({ [kind]: { formatVersion: 2,
      ...kind === "review/adversarial-pass" ? { writerRule: "single-writer" as const } : {} } }, layout);
    const owner = success(await f.store.write({ action: "put", reference: f.reference("work-item/meta"), expected: null,
      content: f.content(f.reference("work-item/meta")), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    const refs = ["caf\u00e9", "cafe\u0301"].map(activity => RecordReferenceSchema.parse({ owner: owner.reference.owner, kind,
      key: kind === "review/adversarial-pass" ? { activity, number: 1 } : activity }));
    const [first, second] = refs;
    if (!first || !second || !f.ports.registry) throw new Error("Expected record definitions");
    const provenance = { verb: "review", lifecycleAction: "save" };
    const firstWritten = success(await f.store.write({ action: "put", reference: first, expected: null, content: f.content(first), provenance }));
    const initial = createRefStore({ ...f.ports, registry: { ...f.ports.registry, [kind]: { ...f.ports.registry[kind], formatVersion: 1 } } });
    success(await initial.write({ action: "put", reference: second, expected: null, content: f.content(second), provenance }));
    const snapshot = success(await f.store.version());
    for (const asOf of [undefined, snapshot]) {
      expect(success(await f.store.read({ reference: first, asOf }))).toMatchObject({ formatVersion: 2, version: firstWritten.version });
      expect(success(await f.store.read({ reference: second, asOf })).formatVersion).toBe(1);
    }
    const prior = success(await f.store.read({ reference: second }));
    success(await f.store.write({ action: "put", reference: second, expected: prior.version, content: prior.content, provenance }));
    expect(success(await f.store.read({ reference: second })).formatVersion).toBe(2);
    expect(success(await f.store.read({ reference: first })).version).toBe(firstWritten.version);
    const removed = success(await f.store.read({ reference: second }));
    success(await f.store.write({ action: "remove", reference: second, expected: removed.version, provenance }));
    expect(success(await f.store.read({ reference: first }))).toMatchObject({ formatVersion: 2, version: firstWritten.version });
    expect(success(await f.store.read({ reference: second, asOf: snapshot })).formatVersion).toBe(1);
  }, 60_000);

  it("persists ASCII format coordinates that retain exact scalar spelling and validation", async () => {
    const f = await createRefFixture({ "review/evidence": { formatVersion: 2 } }, layout);
    const primary = f.reference("work-item/meta"), provenance = { verb: "review", lifecycleAction: "save" };
    const owner = success(await f.store.write({ action: "put", reference: primary, expected: null,
      content: f.content(primary), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    const reference = (key: string) => RecordReferenceSchema.parse({ owner: owner.reference.owner, kind: "review/evidence", key });
    const keys = ["plain", "caf\u00e9", "cafe\u0301", "emoji-\u{1f600}", "backslash-\\u00e9"];
    for (const key of keys) success(await f.store.write({ action: "put", reference: reference(key), expected: null,
      content: f.content(reference(key)), provenance }));
    const home = expandStoredPath(owner.reference);
    const metadata = JSON.parse((await f.ports.exec("git", [...f.gitDir ? [`--git-dir=${f.gitDir}`] : [],
      "show", `${home.ref}:${home.metadataPath}`], { cwd: f.root })).stdout) as { formats: Record<string, number> };
    const coordinates = Object.keys(metadata.formats).filter(key => (JSON.parse(key) as { kind: string }).kind === "review/evidence");
    expect(coordinates).toHaveLength(keys.length);
    for (const coordinate of coordinates) expect(coordinate).toMatch(/^[\u0020-\u007e]*$/u);
    expect(coordinates.map(key => (JSON.parse(key) as { key: string }).key).sort()).toEqual([...keys].sort());
    expect(coordinates).toContain('{"key":"plain","kind":"review/evidence"}');
    const before = success(await f.store.version());
    for (const key of ["broken-\ud800", "broken-\udc00-tail"]) {
      expect(await f.store.write({ action: "put", reference: reference(key), expected: null, content: "{}", provenance }))
        .toMatchObject({ status: "refused", refusal: { code: "record-malformed", class: "recoverable", rule: "store.key",
          condition: expect.stringContaining("well-formed Unicode"), remedy: { text: expect.stringContaining("well-formed") } } });
      const pass = RecordReferenceSchema.parse({ owner: owner.reference.owner, kind: "review/adversarial-pass", key: { activity: key, number: 1 } });
      expect(await f.store.write({ action: "put", reference: pass, expected: null, content: "{}", provenance }))
        .toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "store.key" } });
    }
    expect(success(await f.store.version())).toBe(before);
    success(await f.store.write({ action: "put", reference: reference("repaired"), expected: null, content: f.content(reference("repaired")), provenance }));
  }, 60_000);
});
