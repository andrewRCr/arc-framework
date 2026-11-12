import { describe, expect, it } from "vitest";
import { retainedConflictFixture } from "../helpers/store/retained-conflicts.js";
import { success } from "../helpers/store/suite-tools.js";
import { PullNoticeSchema, RecordReferenceSchema, type WriteInput } from "../../src/lib/store/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

const provenance = { verb: "resolve", lifecycleAction: "resolve" };

describe.each(["default", "separate"] as const)("retained conflict removal in the %s layout", (layout) => {
  it("keeps stale removals and indirect resolutions atomic without admitting other retired writes", async () => {
    const h = await retainedConflictFixture(layout, "abandon");
    const reference = h.conflicts[0]!, other = h.conflicts[1]!;
    const basis = success(await h.a.store.history({ reference }))[0]!;
    const otherBasis = success(await h.a.store.history({ reference: other }))[0]!;
    if (!basis.version || !otherBasis.version) throw new Error("Expected both current conflict versions");
    const paired = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "untouched" } });
    const put = { action: "put" as const, reference: paired, expected: null, content: makeMetaFixture("untouched"), placement: { kind: "active" as const } };
    const before = (await h.a.git(["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout;
    expect(await h.a.store.batch({ writes: [put, { action: "remove", reference, expected: otherBasis.version, resolves: [reference] }], provenance }))
      .toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
    expect(await h.a.store.batch({ writes: [{ ...put, resolves: [reference] }], provenance }))
      .toMatchObject({ status: "refused", refusal: { code: "not-found", condition: expect.stringContaining("explicit removal") } });
    expect(await h.a.store.batch({ writes: [{ action: "remove", reference, expected: basis.version, resolves: [reference, other] }], provenance }))
      .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await h.a.store.write({ action: "remove", reference, expected: null, provenance } as unknown as WriteInput))
      .toMatchObject({ status: "refused", refusal: { code: "record-malformed" } });
    expect(await h.a.store.write({ action: "put", reference, expected: basis.version, content: basis.content!, provenance }))
      .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await h.a.store.write({ action: "put", reference: h.primary, expected: null, content: makeMetaFixture("retained"), placement: { kind: "active" }, provenance }))
      .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect((await h.a.git(["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"])).stdout).toBe(before);
    success(await h.a.store.batch({ writes: [put, { action: "remove", reference, expected: basis.version, resolves: [reference] }], provenance }));
    expect(success(await h.a.store.read({ reference: paired })).content).toBe(makeMetaFixture("untouched"));
  }, 60_000);

  it("reports work-item and review conflicts with executable exact inspection remedies", async () => {
    const h = await retainedConflictFixture(layout, "abandon");
    const notice = h.pulled.pulls.flatMap(({ notices }) => notices).find(({ kind }) => kind === "ended-with-conflicts");
    expect(notice).toMatchObject({ conflicts: expect.arrayContaining(h.conflicts),
      condition: expect.stringContaining("retained"), remedy: { argv: expect.arrayContaining(["arc", "store", "conflict"]),
        text: expect.stringContaining("--discard") } });
    if (notice?.kind !== "ended-with-conflicts") throw new Error("Expected an ended conflict notice");
    expect(notice.conflicts).toHaveLength(3);
    const [first] = notice.conflicts;
    expect(notice).toMatchObject({ remedy: { argv: ["arc", "store", "conflict", "uid" in first!.owner ? first!.owner.uid : "", first!.kind, first!.key] } });
    expect(PullNoticeSchema.safeParse(notice).success).toBe(true);
  }, 60_000);

  it.each(["abandon", "decompose"] as const)("removes only the explicit conflict while keeping the %s retired and publishing the resolution", async (kind) => {
    const h = await retainedConflictFixture(layout, kind);
    expect(h.conflicts).toHaveLength(3);
    const reference = h.conflicts.find(({ kind }) => kind === "work-item/conflict-record")!;
    const basis = success(await h.a.store.history({ reference }))[0]!;
    expect(basis.version).not.toBeNull();
    if (!basis.version) throw new Error("Expected the current conflict version");
    const paired = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "paired" } });
    const result = success(await h.a.store.batch({ writes: [
      { action: "remove", reference, expected: basis.version, resolves: [reference] },
      { action: "put", reference: paired, expected: null, content: makeMetaFixture("paired"), placement: { kind: "active" } },
    ], provenance }));
    expect(success(await h.a.store.history({ reference }))[0]).toMatchObject({ content: null, version: null,
      provenance: { verb: "resolve", lifecycleAction: "resolve", batchId: result.batchId } });
    expect(success(await h.a.store.read({ reference: paired })).content).toBe(makeMetaFixture("paired"));
    expect(await h.a.store.read({ reference: h.primary })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await h.a.store.read({ reference: h.companion })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await h.a.store.read({ reference: h.lineage })).content).toBe(h.lineageContent);
    if (kind === "decompose") expect(success(await h.a.store.read({ reference: h.child })).content).toBe(makeMetaFixture("successor"));
    for (const other of h.conflicts.filter((conflict) => conflict.key !== reference.key)) {
      expect(success(await h.a.store.history({ reference: other }))[0]?.version).toEqual(expect.any(String));
    }
    success(await h.a.store.push()); success(await h.b.store.pull({ history: [h.history as `refs/arc/history/work/${string}`] }));
    expect(success(await h.b.store.history({ reference }))[0]).toMatchObject({ content: null, version: null });
  }, 60_000);
});
