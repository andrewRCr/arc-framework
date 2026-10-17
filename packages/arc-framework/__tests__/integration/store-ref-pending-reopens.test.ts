import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), provenance = { verb: "archive", lifecycleAction: "archive" };

describe.each(["default", "separate"] as const)("pending reopens in the %s layout", (layout) => {
  it("treats a live ref restored beside lineage as a reopen retaining the end's removals", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("restored-live"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "restored-live" } }),
      placement: { kind: "active" }, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    if (!("uid" in made.reference.owner)) throw new Error("The item needs a UID");
    const live = `refs/arc/work/${made.reference.owner.uid}`, history = live.replace("refs/arc/", "refs/arc/history/");
    const original = (await h.a.git(["rev-parse", live])).stdout;
    const current = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.batch({ writes: [
      { action: "put", expected: null, reference: RecordReferenceSchema.parse({ kind: "lineage/transition", owner: made.reference.owner }),
        content: JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: made.reference.owner.name,
          uid: made.reference.owner.uid }, kind: "abandon", successors: [], incoming: [] })) },
      { action: "remove", reference: current.reference, expected: current.version },
    ], provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    await h.a.git(["push", h.remoteName, `${original}:${live}`]);
    success(await h.b.store.pull());
    expect(await h.b.store.read({ reference: made.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", live])).stdout).toBe(live);
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", history])).stdout).toBe("");
    expect((await h.b.git(["ls-tree", "--name-only", live])).stdout).not.toContain("meta-restored-live.md");
  });
  it.each([false, true])("applies a remote reopen from held history even beside new lineage (%s)", async (lineage) => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("reopen"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "reopen" } }),
      placement: { kind: "active" }, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const before = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version,
      content: before.content, placement: { kind: "completed", quarter }, provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const closed = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: closed.reference, expected: closed.version,
      content: closed.content, placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
    if (lineage) {
      const owner = made.reference.owner;
      success(await h.a.store.write({ action: "put", expected: null,
        reference: RecordReferenceSchema.parse({ kind: "lineage/transition", owner }),
        content: JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: owner.name,
          uid: "uid" in owner ? owner.uid : undefined }, kind: "abandon", successors: [], incoming: [] })), provenance }));
    }
    success(await h.a.store.push()); success(await h.b.store.pull());
    if (!("uid" in made.reference.owner)) throw new Error("The item needs a UID");
    const live = `refs/arc/work/${made.reference.owner.uid}`, history = live.replace("refs/arc/", "refs/arc/history/");
    expect(success(await h.b.store.read({ reference: made.reference })).placement).toEqual({ kind: "active" });
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", history])).stdout).toBe("");
    for (let n = 0; n < 2; n++) success(await h.b.store.pull());
    success(await h.b.store.push());
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe(live);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", history])).stdout).toBe("");
  });
});
