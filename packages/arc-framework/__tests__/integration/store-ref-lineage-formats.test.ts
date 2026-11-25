import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance } from "../helpers/store/suite-tools.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { createRefStore } from "../../src/lib/store/create.js";

describe.each(["default", "separate"] as const)("independent lineage format versions (%s)", (layout) => {
  it("reads and lists each origin's own format, including an absent initial-version entry", async () => {
    const f = await createRefFixture({ "lineage/transition": { formatVersion: 2 } }, layout);
    const first = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: { type: "work-item", name: "first",
      uid: "abcdef12-1234-4234-8234-123456789abc" } });
    const second = RecordReferenceSchema.parse({ ...first, owner: { ...first.owner, name: "second", uid: "abcdef34-1234-4234-8234-123456789abc" } });
    if (first.owner.type !== "work-item" || second.owner.type !== "work-item") throw new Error("No origins");
    await plantRef(f.root, "refs/arc/project/registry", [
      { path: "metadata-registry.json", content: canonicalize({ formatVersion: 1,
        lineage: { [first.owner.uid!]: first.owner.name, [second.owner.uid!]: second.owner.name },
        formats: { [canonicalize({ kind: second.kind, ownerUid: second.owner.uid })]: 2 } }) },
      { path: `lineage/${first.owner.uid}.json`, content: f.content(first) },
      { path: `lineage/${second.owner.uid}.json`, content: f.content(second) },
    ], { gitDir: f.gitDir });
    expect(success(await f.store.read({ reference: first })).formatVersion).toBe(1);
    expect(success(await f.store.read({ reference: second })).formatVersion).toBe(2);
    expect(await f.store.list({ family: "lineage" })).toMatchObject({ status: "ok", result: { status: "complete", missed: false,
      records: expect.arrayContaining([expect.objectContaining({ reference: first, formatVersion: 1 }),
        expect.objectContaining({ reference: second, formatVersion: 2 })]),
    } });
  });

  it("preserves another origin's format and version across a put and a removal", async () => {
    const f = await createRefFixture({ "lineage/transition": { formatVersion: 2 } }, layout);
    const first = f.reference("lineage/transition");
    const second = f.reference("lineage/transition", "two");
    for (const reference of [first, second]) success(await f.store.write({ action: "put", reference, expected: null,
      content: f.content(reference), provenance: testProvenance }));
    const removed = success(await f.store.read({ reference: first }));
    const retained = success(await f.store.read({ reference: second }));
    expect(removed.formatVersion).toBe(2);
    expect(retained.formatVersion).toBe(2);
    const registry = f.ports.registry;
    if (!registry) throw new Error("No fixture registry");
    const initial = createRefStore({ ...f.ports, registry: { ...registry,
      "lineage/transition": { ...registry["lineage/transition"], formatVersion: 1 } } });
    const third = f.reference("lineage/transition", "three");
    success(await initial.write({ action: "put", reference: third, expected: null, content: f.content(third), provenance: testProvenance }));
    expect(success(await f.store.read({ reference: second }))).toMatchObject({ content: retained.content,
      formatVersion: 2, version: retained.version });
    success(await f.store.write({ action: "remove", reference: removed.reference, expected: removed.version, provenance: testProvenance }));
    expect(success(await f.store.read({ reference: second }))).toMatchObject({ content: retained.content,
      formatVersion: 2, version: retained.version });
    expect(success(await f.store.read({ reference: third })).formatVersion).toBe(1);
    expect(await f.store.read({ reference: removed.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });

  it("isolates an unknown newer format and reads it after a supporting registry retry", async () => {
    const f = await createRefFixture({ "lineage/transition": { formatVersion: 2 } }, layout);
    const first = await seed(f, f.reference("lineage/transition"));
    const second = await seed(f, f.reference("lineage/transition", "two"));
    if (second.reference.owner.type !== "work-item") throw new Error("No lineage origin");
    await f.plant(second.reference, "unknown-format-version");
    expect(await f.store.list({ family: "lineage" })).toMatchObject({ status: "ok", result: { status: "complete", missed: true,
      records: [expect.objectContaining({ reference: first.reference, version: first.version, formatVersion: 2 })],
      diagnostics: [expect.objectContaining({ kind: "unknown-format-version", key: `lineage/${second.reference.owner.uid}.json` })],
    } });
    expect(await f.store.read({ reference: second.reference })).toMatchObject({ status: "refused", refusal: { code: "record-malformed",
      rule: expect.stringContaining("format"), remedy: { text: expect.stringMatching(/merge base|rebuild/u) } } });
    const registry = f.ports.registry;
    if (!registry) throw new Error("No fixture registry");
    const rebuilt = createRefStore({ ...f.ports, registry: { ...registry,
      "lineage/transition": { ...registry["lineage/transition"], formatVersion: 3 } } });
    expect(success(await rebuilt.read({ reference: second.reference }))).toMatchObject({ content: second.content, formatVersion: 3 });
    expect(success(await rebuilt.read({ reference: first.reference }))).toMatchObject({ version: first.version, formatVersion: 2 });
  });
});
