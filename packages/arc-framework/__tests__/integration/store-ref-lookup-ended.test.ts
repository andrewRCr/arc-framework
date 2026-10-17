import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update, testProvenance } from "../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { makeGitExec } from "../helpers/integration.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");

describe("lookup across live and completed generations", () => {
  it("finds a completed owner by its current and former names", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("work-item/meta"));
    const renamed = RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, record, record.content), reference: renamed }));
    const live = success(await f.store.read({ reference: renamed }));
    success(await f.store.write({ ...update(f, live, live.content), placement: { kind: "completed", quarter } }));
    for (const slug of [record.reference.owner.name, renamed.owner.name])
      expect(success(await f.store.lookup({ kind: "slug", slug }))).toEqual({ reference: renamed });
  });
  it("ranks live current, live former, completed current, and completed former names", async () => {
    const f = await createRefFixture();
    const target = SlugSchema.parse("target");
    const reference = RecordReferenceSchema.parse({ ...f.reference("work-item/meta"), owner: { type: "work-item", name: target } });
    const former = await seed(f, reference);
    const renamed = RecordReferenceSchema.parse({ ...former.reference, owner: { ...former.reference.owner, name: "ended-former" } });
    success(await f.store.write({ ...update(f, former, former.content), reference: renamed }));
    const renamedRecord = success(await f.store.read({ reference: renamed }));
    success(await f.store.write({ ...update(f, renamedRecord, renamedRecord.content), placement: { kind: "completed", quarter } }));
    expect(success(await f.store.lookup({ kind: "slug", slug: target })).reference).toEqual(renamed);
    const completed = await seed(f, reference);
    success(await f.store.write({ ...update(f, completed, completed.content), placement: { kind: "completed", quarter } }));
    expect(success(await f.store.lookup({ kind: "slug", slug: target })).reference).toEqual(completed.reference);
    const liveFormer = await seed(f, reference);
    const liveRenamed = RecordReferenceSchema.parse({ ...liveFormer.reference, owner: { ...liveFormer.reference.owner, name: "live-former" } });
    success(await f.store.write({ ...update(f, liveFormer, liveFormer.content), reference: liveRenamed }));
    expect(success(await f.store.lookup({ kind: "slug", slug: target })).reference).toEqual(liveRenamed);
    const next = await seed(f, f.reference("work-item/meta", "next"));
    const current = RecordReferenceSchema.parse({ ...next.reference, owner: { ...next.reference.owner, name: target } });
    success(await f.store.write({ ...update(f, next, next.content), reference: current }));
    expect(success(await f.store.lookup({ kind: "slug", slug: target })).reference).toEqual(current);
  });

  it.each(["current", "former"] as const)("names all ambiguous completed %s-slug holders", async (tier) => {
    const f = await createRefFixture();
    const target = SlugSchema.parse("shared");
    const references = [];
    for (const name of ["one", "two"]) {
      let record = await seed(f, RecordReferenceSchema.parse({ ...f.reference("work-item/meta"), owner: { type: "work-item", name: target } }));
      if (tier === "former") {
        const renamed = RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name } });
        success(await f.store.write({ ...update(f, record, record.content), reference: renamed }));
        record = success(await f.store.read({ reference: renamed }));
      }
      success(await f.store.write({ ...update(f, record, record.content), placement: { kind: "completed", quarter } }));
      references.push(record.reference);
    }
    expect(await f.store.lookup({ kind: "slug", slug: target })).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match", candidates: expect.arrayContaining(references) } });
  });

  it("uses the same latest completed folder as read when an older copy survives", async () => {
    const f = await createRefFixture(), git = makeGitExec(f.root), oldQuarter = ArchiveQuarterSchema.parse("2026-q3");
    const oldRef = `refs/arc/archive/${oldQuarter}`;
    const record = await seed(f, f.reference("work-item/meta"), undefined, { kind: "active" }, {
      branches: [{ repository: "repo", ref: "feat/old", linkedAs: "created", excluded: [] }],
    });
    success(await f.store.write({ ...update(f, record, record.content), placement: { kind: "completed", quarter: oldQuarter } }));
    const oldTip = (await git("git", ["rev-parse", oldRef])).stdout;
    const closed = success(await f.store.read({ reference: record.reference }));
    success(await f.store.write({ ...update(f, closed, closed.content), placement: { kind: "active" } }));
    const reopened = success(await f.store.read({ reference: record.reference }));
    const renamed = RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name: "latest" } });
    success(await f.store.write({ ...update(f, reopened, reopened.content), reference: renamed,
      links: { branches: [{ repository: "repo", ref: "feat/latest", linkedAs: "created", excluded: [] }] } }));
    const live = success(await f.store.read({ reference: renamed }));
    success(await f.store.write({ ...update(f, live, live.content), placement: { kind: "completed", quarter } }));
    await git("git", ["update-ref", oldRef, oldTip]);
    const readable = success(await f.store.read({ reference: record.reference }));
    expect(success(await f.store.lookup({ kind: "slug", slug: record.reference.owner.name })).reference).toEqual(readable.reference);
    expect(success(await f.store.lookup({ kind: "ref", repository: "repo", ref: "feat/latest" })).reference).toEqual(readable.reference);
    expect(await f.store.lookup({ kind: "ref", repository: "repo", ref: "feat/old" })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });

  it.each(["abandon", "decompose"] as const)("exposes a retired %s origin through lineage alone", async (kind) => {
    const f = await createRefFixture();
    const origin = await seed(f, f.reference("work-item/meta"));
    const successor = kind === "decompose" ? await seed(f, f.reference("work-item/meta", "successor")) : undefined;
    const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: origin.reference.owner });
    const content = JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: origin.reference.owner.name, uid: "uid" in origin.reference.owner ? origin.reference.owner.uid : undefined },
      kind, successors: successor ? [{ name: successor.reference.owner.name, uid: "uid" in successor.reference.owner ? successor.reference.owner.uid : undefined }] : [], incoming: [], ...(kind === "decompose" ? { outgoing: [] } : {}) }));
    success(await f.store.batch({ writes: [{ action: "put", reference: lineage, expected: null, content },
      { action: "remove", reference: origin.reference, expected: origin.version }], provenance: testProvenance }));
    expect(await f.store.lookup({ kind: "slug", slug: origin.reference.owner.name })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await f.store.lookup({ kind: "lineage", origin: origin.reference.owner.name })).reference).toEqual(lineage);
  });

  it("keeps mixed completed, Errand, and identity-claim lookup within four Git processes", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, record, record.content), placement: { kind: "completed", quarter } }));
    const errand = await seed(f, f.reference("work-item/record", "errand"));
    const claim = await seed(f, f.reference("claims/groom"));
    let processes = 0;
    const store = createRefStore({ ...f.ports, rawExec: async (...args) => { processes += 1; return f.ports.rawExec(...args); } });
    expect(success(await store.lookup({ kind: "slug", slug: record.reference.owner.name })).reference).toEqual(record.reference);
    expect(processes).toBe(4);
    expect(success(await store.lookup({ kind: "claim", claim: { kind: "errand", slug: errand.reference.owner.name, claimId: "1".repeat(32) } })).reference).toEqual(errand.reference);
    expect(processes).toBe(5);
    expect(success(await store.lookup({ kind: "claim", claim: { kind: "groom", slug: SlugSchema.parse(String(claim.reference.key)), claimId: "1".repeat(32) } })).reference).toEqual(claim.reference);
    expect(processes).toBe(6);
  });

});
