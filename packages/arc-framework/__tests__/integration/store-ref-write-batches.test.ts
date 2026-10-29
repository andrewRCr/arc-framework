import { describe, expect, it } from "vitest";
import { createRefStore } from "../../src/lib/store/create.js";
import { createRefLockFactory } from "../../src/lib/store/default-ports.js";
import { OwnerIdentitySchema, RecordReferenceSchema, type OwnerIdentity, type RecordReference } from "../../src/lib/store/identity.js";
import type { WritePlacement } from "../../src/lib/store/placement.js";
import { createRefFixture, type RefConformanceFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance } from "../helpers/store/suite-tools.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { plantRef } from "../helpers/store/ref-plant.js";

const provenance = { verb: "test-batch", lifecycleAction: "update" };

async function fixture(format: "files" | "reftable") {
  const f = await createRefReadFixture(format);
  const primary = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha" }, kind: "work-item/meta" });
  const seeded = await f.store.write({ action: "put", reference: primary, expected: null,
    content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance });
  if (seeded.status !== "ok" || seeded.result.reference.owner.type !== "work-item") throw new Error("No seeded owner");
  const work = RecordReferenceSchema.parse({ ...seeded.result.reference, kind: "work-item/companion", key: "batch" });
  const personal = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "batch.txt" });
  const native = createRefLockFactory(f.ports);
  const ports = { ...f.ports, lock: (ref: string) => native(ref, 2_000) };
  return { ...f, ports, work, personal, workRef: `refs/arc/work/${seeded.result.reference.owner.uid}`,
    store: createRefStore(ports) };
}

describe.each(["files", "reftable"] as const)("atomic ref batches (%s)", (format) => {
  it("lands a work-item record and a newly created personal ref together", async () => {
    const f = await fixture(format);
    const result = await f.store.batch({ provenance, writes: [f.work, f.personal].map((reference) => ({
      action: "put", reference, expected: null, content: "one batch",
    })) });
    expect(result).toMatchObject({ status: "ok", result: { writes: [{ reference: f.work }, { reference: f.personal }] } });
    expect(await f.store.read({ reference: f.work })).toMatchObject({ status: "ok", result: { content: "one batch" } });
    expect(await f.store.read({ reference: f.personal })).toMatchObject({ status: "ok", result: { content: "one batch" } });
  });
  it("lands neither mutation when another writer defeats the new personal ref's expected absence", async () => {
    const f = await fixture(format);
    const before = (await f.exec("git", ["rev-parse", f.workRef])).stdout;
    let compete = true;
    const store = createRefStore({ ...f.ports, execInput: async (args, input, options) => {
      if (compete && args.includes("update-ref")) {
        compete = false;
        await plantRef(f.root, "refs/arc/user/andrew/personal", [
          { path: "andrew/metadata-andrew.json", content: canonicalize({ formatVersion: 1, formats: {} }) },
          { path: "andrew/batch.txt.andrew", content: "competing writer" },
        ]);
      }
      return f.ports.execInput(args, input, options);
    } });
    expect(await store.batch({ provenance, writes: [f.work, f.personal].map((reference) => ({
      action: "put", reference, expected: null, content: "must not land",
    })) })).toMatchObject({ status: "refused", refusal: { code: "version-conflict", records: [f.personal] } });
    expect((await f.exec("git", ["rev-parse", f.workRef])).stdout).toBe(before);
    expect(await store.read({ reference: f.work })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await store.read({ reference: f.personal })).toMatchObject({ status: "ok", result: { content: "competing writer" } });
  });
  it("commits overlapping batches named in opposite ref orders without losing either batch", async () => {
    const f = await fixture(format);
    const other = createRefStore(f.ports);
    const secondWork = RecordReferenceSchema.parse({ ...f.work, key: "second" });
    const secondPersonal = RecordReferenceSchema.parse({ ...f.personal, key: "second.txt" });
    const results = await Promise.all([
      f.store.batch({ provenance, writes: [f.work, f.personal].map((reference) => ({ action: "put", reference, expected: null, content: "first" })) }),
      other.batch({ provenance, writes: [secondPersonal, secondWork].map((reference) => ({ action: "put", reference, expected: null, content: "second" })) }),
    ]);
    expect(results.map((result) => result.status)).toEqual(["ok", "ok"]);
    for (const reference of [f.work, f.personal]) expect(await f.store.read({ reference })).toMatchObject({ status: "ok", result: { content: "first" } });
    for (const reference of [secondPersonal, secondWork]) expect(await f.store.read({ reference })).toMatchObject({ status: "ok", result: { content: "second" } });
  }, 15_000);
});

describe.each(["default", "separate"] as const)("one canonical record per ref batch (%s)", (layout) => {
  const twice = { status: "refused", refusal: { code: "record-malformed", condition: expect.stringContaining("at most once") } };
  const put = (f: RefConformanceFixture, reference: RecordReference, placement?: WritePlacement) => ({ action: "put" as const, reference,
    expected: null, content: f.content(reference), ...(placement ? { placement } : {}) });

  it("refuses one new owner's meta and record together, and writes either alone", async () => {
    const f = await createRefFixture({}, layout);
    const meta = f.reference("work-item/meta", "dual");
    const record = RecordReferenceSchema.parse({ ...meta, kind: "work-item/record" });
    const before = await f.settle();
    expect(await f.store.batch({ provenance: testProvenance, writes: [put(f, meta, { kind: "active" }), put(f, record, { kind: "active" })] })).toMatchObject(twice);
    expect(await f.settle()).toBe(before);
    success(await f.store.write({ ...put(f, record, { kind: "active" }), provenance: testProvenance }));
  });

  it("refuses a name handle and a UID handle for one record together, and writes it once", async () => {
    const f = await createRefFixture({}, layout);
    const root = await seed(f, f.reference("work-item/meta", "mixed"));
    const extra = (owner: OwnerIdentity) => RecordReferenceSchema.parse({ owner, kind: "work-item/companion", key: "extra" });
    const byName = extra(OwnerIdentitySchema.parse({ type: "work-item", name: root.reference.owner.name }));
    const before = await f.settle();
    expect(await f.store.batch({ provenance: testProvenance, writes: [put(f, byName), put(f, extra(root.reference.owner))] })).toMatchObject(twice);
    expect(await f.settle()).toBe(before);
    success(await f.store.write({ ...put(f, byName), provenance: testProvenance }));
    expect(success(await f.store.read({ reference: extra(root.reference.owner) })).content).toBe(f.content(byName));
  });
});

