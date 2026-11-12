/** Newly authored synchronization commits have their own known-empty creation facts. */
import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

const provenance = { verb: "save", lifecycleAction: "save" };
const personal = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "receipt.md" });

describe.each(["default", "separate"] as const)("native receipt synchronization in %s", layout => {
  it("preserves fast-forward birth facts and gives a newly authored merge its own complete-none envelope", async () => {
    const h = await refSyncFixture(layout);
    const work = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "birth" } }),
      content: makeMetaFixture("birth"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const original = success(await h.a.store.history({ reference: work.reference }));
    expect(success(await h.b.store.history({ reference: work.reference }))).toEqual(original);
    expect(original[0]?.creationReceipt?.createdOwners).toEqual([{ kind: "work-item/meta", owner: work.reference.owner }]);
    const a = success(await h.a.store.write({ action: "put", expected: null, reference: personal, content: "base\n", provenance }));
    if (!a.version) throw new Error("Expected the initial record version");
    success(await h.a.store.push()); success(await h.b.store.pull());
    const b = success(await h.b.store.read({ reference: personal }));
    success(await h.a.store.write({ action: "put", expected: a.version, reference: personal, content: "local\n", provenance }));
    success(await h.b.store.write({ action: "put", expected: b.version, reference: personal, content: "remote\n", provenance }));
    success(await h.b.store.push()); success(await h.a.store.pull());
    const ref = "refs/arc/user/andrew/personal";
    expect((await h.a.git(["rev-list", "--parents", "-1", ref])).stdout.trim().split(" ")).toHaveLength(3);
    const message = (await h.a.git(["show", "-s", "--format=%B", ref])).stdout;
    expect(message).toContain("Arc-Lifecycle-Action: merge");
    const batchId = /^Arc-Batch: (.+)$/mu.exec(message)?.[1];
    const receipt = /^Arc-Creation-Receipt: (.+)$/mu.exec(message)?.[1];
    expect(receipt && JSON.parse(receipt)).toEqual({ schemaVersion: 1, batchId, createdOwners: [] });
  });
});
