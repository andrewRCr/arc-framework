import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { HistoryRefSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), provenance = { verb: "archive", lifecycleAction: "archive" };

describe.each(["default", "separate"] as const)("pending ends in the %s layout", (layout) => {
  it("applies all held items' pending ends while leaving a never-held item's history unfetched", async () => {
    const h = await refSyncFixture(layout);
    const create = async (name: string) => success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
      content: makeMetaFixture(name), placement: { kind: "active" }, provenance }));
    const first = await create("first"), second = await create("second");
    success(await h.a.store.push()); success(await h.b.store.pull());
    const cold = await create("cold");
    const records = [];
    for (const made of [first, second, cold]) records.push(success(await h.a.store.read({ reference: made.reference })));
    success(await h.a.store.batch({ writes: records.map((record) => ({ action: "put" as const, reference: record.reference,
      expected: record.version, content: record.content, placement: { kind: "completed" as const, quarter } })), provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    for (const made of [first, second, cold]) {
      if (!("uid" in made.reference.owner)) throw new Error("The item needs a UID");
      const live = `refs/arc/work/${made.reference.owner.uid}`, history = live.replace("refs/arc/", "refs/arc/history/");
      expect((await h.b.git(["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
      expect((await h.b.git(["for-each-ref", "--format=%(refname)", history])).stdout).toBe(made === cold ? "" : history);
      expect(success(await h.b.store.read({ reference: made.reference })).placement?.kind).toBe("completed");
    }
  });
  it("fetches published lineage's end when the held history contains an unpublished archive", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("two-ends"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "two-ends" } }),
      placement: { kind: "active" }, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const current = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: current.reference, expected: current.version,
      content: current.content, placement: { kind: "completed", quarter }, provenance }));
    const remote = success(await h.b.store.read({ reference: made.reference }));
    success(await h.b.store.batch({ writes: [
      { action: "put", expected: null, reference: RecordReferenceSchema.parse({ kind: "lineage/transition", owner: made.reference.owner }),
        content: JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: made.reference.owner.name,
          uid: "uid" in made.reference.owner ? made.reference.owner.uid : undefined }, kind: "abandon", successors: [], incoming: [] })) },
      { action: "remove", reference: remote.reference, expected: remote.version },
    ], provenance }));
    success(await h.b.store.push());
    if (!("uid" in made.reference.owner)) throw new Error("The item needs a UID");
    const history = `refs/arc/history/work/${made.reference.owner.uid}`;
    const published = (await h.remote("git", ["rev-parse", history])).stdout;
    success(await h.a.store.pull());
    const merged = (await h.a.git(["rev-parse", history])).stdout;
    await h.a.git(["merge-base", "--is-ancestor", published, merged]);
  });
  it("never pushes a locally live item while its published end's history is missing", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("missing"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "missing" } }),
      placement: { kind: "active" }, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const before = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version,
      content: before.content, placement: { kind: "completed", quarter }, provenance }));
    success(await h.a.store.push());
    if (!("uid" in made.reference.owner)) throw new Error("The item needs a UID");
    const live = `refs/arc/work/${made.reference.owner.uid}`, history = live.replace("refs/arc/", "refs/arc/history/");
    await h.remote("git", ["update-ref", "-d", history]);
    success(await h.b.store.pull()); success(await h.b.store.push());
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", live])).stdout).toBe(live);
  });
  it("does not mistake a folder refresh for a new end when history lacks only the later write", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("refresh"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "refresh" } }),
      placement: { kind: "active" }, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const before = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version,
      content: before.content, placement: { kind: "completed", quarter }, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    if (!("uid" in made.reference.owner)) throw new Error("The item needs a UID");
    const history = `refs/arc/history/work/${made.reference.owner.uid}`;
    const old = (await h.b.git(["rev-parse", history])).stdout;
    const closed = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: closed.reference, expected: closed.version,
      content: `${closed.content}\nLater completed write.\n`, placement: { kind: "completed", quarter }, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    expect((await h.b.git(["rev-parse", history])).stdout).toBe(old);
    expect(success(await h.b.store.read({ reference: made.reference })).content).toContain("Later completed write.");
  });

  it("keeps unpublished live writes in a conflict when a published end arrives", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("unpublished"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "unpublished" } }),
      placement: { kind: "active" }, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const local = success(await h.b.store.read({ reference: made.reference }));
    success(await h.b.store.write({ action: "put", reference: local.reference, expected: local.version,
      content: `${local.content}\nUnpublished write.\n`, placement: { kind: "active" }, provenance }));
    const before = success(await h.a.store.read({ reference: made.reference }));
    const content = `${before.content}\nPublished end.\n`;
    success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version,
      content, placement: { kind: "completed", quarter }, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const observed = success(await h.b.store.read({ reference: made.reference }));
    expect(observed.content).toBe(content);
    expect(observed.placement?.kind).toBe("completed");
    expect(observed.conflicts).toHaveLength(1);
  });
  it.each([false, true])("reads a second end from its folder against the pre-pull history (requested ahead: %s)", async (ahead) => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("cycle"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "cycle" } }),
      placement: { kind: "active" }, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const archive = async () => {
      const before = success(await h.a.store.read({ reference: made.reference }));
      success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version,
        content: before.content, placement: { kind: "completed", quarter }, provenance }));
    };
    await archive(); success(await h.a.store.push()); success(await h.b.store.pull());
    if (!("uid" in made.reference.owner)) throw new Error("The item needs a UID");
    const live = `refs/arc/work/${made.reference.owner.uid}`, history = HistoryRefSchema.parse(live.replace("refs/arc/", "refs/arc/history/"));
    const first = (await h.b.git(["rev-parse", history])).stdout;
    const closed = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: closed.reference, expected: closed.version,
      content: closed.content, placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
    await archive(); success(await h.a.store.push());
    const second = (await h.remote("git", ["rev-parse", history])).stdout;
    expect(second).not.toBe(first);
    success(await h.b.store.pull(ahead ? { history: [history] } : {}));
    expect((await h.b.git(["rev-parse", history])).stdout).toBe(second);
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
    expect(success(await h.b.store.read({ reference: made.reference })).placement?.kind).toBe("completed");
  });

  it.each(["lineage first", "primary first"] as const)("waits for both lineage and primary removal (%s)", async (order) => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("lineage"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "lineage" } }),
      placement: { kind: "active" }, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: made.reference.owner });
    const writeLineage = async () => success(await h.a.store.write({ action: "put", reference: lineage, expected: null,
      content: JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: made.reference.owner.name, uid: "uid" in made.reference.owner ? made.reference.owner.uid : undefined },
        kind: "abandon", successors: [], incoming: [] })), provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    const removePrimary = async () => {
      const before = success(await h.a.store.read({ reference: made.reference }));
      success(await h.a.store.write({ action: "remove", reference: before.reference, expected: before.version,
        provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    };
    if (order === "lineage first") await writeLineage(); else await removePrimary();
    success(await h.a.store.push());
    if (!("uid" in made.reference.owner)) throw new Error("The item needs a UID");
    const live = `refs/arc/work/${made.reference.owner.uid}`, history = live.replace("refs/arc/", "refs/arc/history/");
    for (let n = 0; n < 2; n++) success(await h.b.store.pull());
    success(await h.b.store.push());
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe(live);
    if (order === "lineage first") await removePrimary(); else await writeLineage();
    success(await h.a.store.push()); success(await h.b.store.pull());
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
    expect((await h.b.git(["rev-parse", history])).stdout).toBe((await h.remote("git", ["rev-parse", history])).stdout);
    expect(await h.b.store.read({ reference: made.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
  it.each(["work", "cohort"] as const)("applies a published %s folder to a locally live item and never restores its live ref", async (family) => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: family === "work" ? "work-item/meta" : "cohort/document",
        owner: { type: family === "work" ? "work-item" : "cohort", name: "pending" } }),
      content: family === "work" ? makeMetaFixture("pending") : "# Pending\n\n**Purpose:** Retain the cohort.\n",
      ...family === "work" ? { placement: { kind: "active" as const } } : {}, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const before = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version,
      content: before.content, placement: { kind: "completed", quarter }, provenance }));
    success(await h.a.store.push());
    if (!("uid" in made.reference.owner)) throw new Error("The item needs a UID");
    const live = `refs/arc/${family}/${made.reference.owner.uid}`, history = live.replace("refs/arc/", "refs/arc/history/");
    success(await h.b.store.pull());
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
    expect((await h.b.git(["rev-parse", history])).stdout).toBe((await h.remote("git", ["rev-parse", history])).stdout);
    expect(success(await h.b.store.read({ reference: made.reference })).placement?.kind).toBe("completed");
    success(await h.b.store.push());
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
    expect(success(await h.b.store.pull()).pulls.every(({ status }) => status === "noop")).toBe(true);
  });
});
