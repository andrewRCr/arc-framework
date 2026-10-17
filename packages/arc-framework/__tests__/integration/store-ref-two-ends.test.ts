import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";
import { ConflictRecordSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";

const publishedQuarter = ArchiveQuarterSchema.parse("2026-q4"), ownQuarter = ArchiveQuarterSchema.parse("2027-q1");
const archiveProvenance = { verb: "archive", lifecycleAction: "archive" };

async function endsFixture(layout: "default" | "separate") {
  const h = await refSyncFixture(layout);
  const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("two-ends"),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "two-ends" } }),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  if (!("uid" in made.reference.owner)) throw new Error("The ended item needs a UID");
  const live = `refs/arc/work/${made.reference.owner.uid}`, history = live.replace("refs/arc/", "refs/arc/history/");
  const archive = async (side: typeof h.a, quarter: typeof ownQuarter) => {
    const before = success(await side.store.read({ reference: made.reference }));
    return success(await side.store.write({ action: "put", reference: before.reference, expected: before.version,
      content: before.content, placement: { kind: "completed", quarter }, provenance: archiveProvenance }));
  };
  const uid = made.reference.owner.uid;
  const transition = RecordReferenceSchema.parse({ owner: made.reference.owner, kind: "lineage/transition" });
  const retire = async (side: typeof h.a, snapshot: boolean) => {
    const before = success(await side.store.read({ reference: made.reference }));
    const content = JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2,
      origin: { name: made.reference.owner.name, uid }, kind: "abandon", successors: [], incoming: [],
      ...snapshot ? { retiredBranches: [] } : {} }));
    success(await side.store.batch({ writes: [
      { action: "put", reference: transition, expected: null, content },
      { action: "remove", reference: before.reference, expected: before.version },
    ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    return success(await side.store.read({ reference: transition })).content;
  };
  return { ...h, reference: made.reference, transition, live, history, archive, retire };
}

describe.each(["default", "separate"] as const)("two ends in the %s layout", (layout) => {
  it.each([false, true])("withdraws its unpublished archive while keeping the first published archive (reopened: %s)", async (reopened) => {
    const h = await endsFixture(layout);
    if (reopened) {
      await h.archive(h.a, publishedQuarter); success(await h.a.store.push()); success(await h.b.store.pull());
      for (const side of [h.a, h.b]) {
        const closed = success(await side.store.read({ reference: h.reference }));
        success(await side.store.write({ action: "put", reference: closed.reference, expected: closed.version, content: closed.content,
          placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
      }
    }
    await h.archive(h.a, ownQuarter); await h.archive(h.b, publishedQuarter);
    success(await h.b.store.push());
    const published = (await h.remote("git", ["rev-parse", h.history])).stdout;
    const result = success(await h.a.store.push());
    expect(result.publishes.every(({ status }) => status !== "failed")).toBe(true);
    expect(result.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: h.reference.owner,
      condition: expect.any(String), remedy: { text: expect.any(String) } }));
    expect(success(await h.a.store.read({ reference: h.reference })).placement).toMatchObject({ kind: "completed", quarter: publishedQuarter });
    expect((await h.a.git(["ls-tree", "--name-only", `refs/arc/archive/${ownQuarter}`])).stdout).toBe("");
    expect((await h.remote("git", ["ls-tree", "--name-only", `refs/arc/archive/${ownQuarter}`])).stdout).toBe("");
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
    const final = (await h.remote("git", ["rev-parse", h.history])).stdout;
    await h.a.git(["merge-base", "--is-ancestor", published, final]);
    const settled = success(await h.a.store.pull());
    expect(settled.pulls.flatMap(({ notices }) => notices)).toEqual([]);
  });
  it.each([
    { own: "archive", published: "abandon" }, { own: "abandon", published: "archive" }, { own: "abandon", published: "abandon" },
  ] as const)("withdraws $own against published $published including its unpublished lineage", async ({ own, published }) => {
    const h = await endsFixture(layout);
    if (own === "archive") await h.archive(h.a, ownQuarter); else await h.retire(h.a, false);
    const accepted = published === "archive" ? (await h.archive(h.b, publishedQuarter), undefined) : await h.retire(h.b, true);
    success(await h.b.store.push());
    const result = success(await h.a.store.push());
    expect(result.publishes.every(({ status }) => status !== "failed")).toBe(true);
    expect(result.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: h.reference.owner }));
    expect(result.pulls.flatMap(({ notices }) => notices).some(({ kind }) => kind === "ended-twice")).toBe(false);
    if (published === "archive") {
      expect(success(await h.a.store.read({ reference: h.reference })).placement).toMatchObject({ kind: "completed", quarter: publishedQuarter });
      expect(await h.a.store.read({ reference: h.transition })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    } else {
      expect(await h.a.store.read({ reference: h.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      expect(success(await h.a.store.read({ reference: h.transition })).content).toBe(accepted);
    }
    if (own === "archive") expect((await h.a.git(["ls-tree", "--name-only", `refs/arc/archive/${ownQuarter}`])).stdout).toBe("");
    const registryPaths = (await h.a.git(["ls-tree", "-r", "--name-only", "refs/arc/project/registry"])).stdout;
    expect(registryPaths).not.toContain("conflicts/");
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", h.live])).stdout).toBe("");
    expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
  });

  it("withdraws a preceding unpublished lineage without undoing another record in its batch", async () => {
    const h = await endsFixture(layout), current = success(await h.a.store.read({ reference: h.reference }));
    const companion = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "kept-before-end.md" });
    const content = JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2,
      origin: { name: h.reference.owner.name, uid: "uid" in h.reference.owner ? h.reference.owner.uid : undefined },
      kind: "abandon", successors: [], incoming: [] }));
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: h.transition, expected: null, content },
      { action: "put", reference: companion, expected: null, content: "A separate concern preceding the end.\n" },
    ], provenance: { verb: "abandon", lifecycleAction: "prepare-abandon" } }));
    success(await h.a.store.write({ action: "remove", reference: current.reference, expected: current.version,
      provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    await h.archive(h.b, publishedQuarter); success(await h.b.store.push());
    const result = success(await h.a.store.push());
    expect(result.publishes.every(({ status }) => status !== "failed")).toBe(true);
    expect(result.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    expect(await h.a.store.read({ reference: h.transition })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await h.a.store.read({ reference: companion })).content).toBe("A separate concern preceding the end.\n");
    expect(success(await h.a.store.read({ reference: h.reference })).placement).toMatchObject({ kind: "completed", quarter: publishedQuarter });
    expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
  });

  it("withdraws an unpublished cohort close against the published close", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: { type: "cohort", name: "two-closes" }, kind: "cohort/document" }),
      content: "# Two Closes\n\n**Purpose:** Close once.\n", provenance: archiveProvenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    for (const [side, quarter] of [[h.a, ownQuarter], [h.b, publishedQuarter]] as const) {
      const current = success(await side.store.read({ reference: made.reference }));
      success(await side.store.write({ action: "put", reference: current.reference, expected: current.version,
        content: current.content, placement: { kind: "completed", quarter }, provenance: archiveProvenance }));
    }
    success(await h.b.store.push());
    const result = success(await h.a.store.push());
    expect(result.publishes.every(({ status }) => status !== "failed")).toBe(true);
    expect(result.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: made.reference.owner }));
    expect(success(await h.a.store.read({ reference: made.reference })).placement).toMatchObject({ kind: "completed", quarter: publishedQuarter });
    expect((await h.a.git(["ls-tree", "--name-only", `refs/arc/archive/${ownQuarter}`])).stdout).toBe("");
    expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
  });

  it("retains writes made before and after the withdrawn end as late writes", async () => {
    const h = await endsFixture(layout), base = success(await h.a.store.read({ reference: h.reference }));
    const before = `${base.content}\nA write before the end.\n`, after = `${before}\nA write after the end.\n`;
    success(await h.a.store.write({ action: "put", reference: h.reference, expected: base.version, content: before,
      placement: { kind: "active" }, provenance: { verb: "save", lifecycleAction: "save" } }));
    await h.archive(h.a, ownQuarter);
    const ended = success(await h.a.store.read({ reference: h.reference }));
    success(await h.a.store.write({ action: "put", reference: h.reference, expected: ended.version, content: after,
      placement: { kind: "completed", quarter: ownQuarter }, provenance: { verb: "save", lifecycleAction: "save" } }));
    const remote = success(await h.b.store.read({ reference: h.reference })), published = `${remote.content}\nAccepted published end.\n`;
    success(await h.b.store.write({ action: "put", reference: remote.reference, expected: remote.version, content: published,
      placement: { kind: "completed", quarter: publishedQuarter }, provenance: archiveProvenance }));
    success(await h.b.store.push());
    const result = success(await h.a.store.push());
    expect(result.publishes.every(({ status }) => status !== "failed")).toBe(true);
    expect(result.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    const current = success(await h.a.store.read({ reference: h.reference }));
    expect(current.content).toBe(published);
    expect(current.conflicts).toHaveLength(1);
    const conflict = ConflictRecordSchema.parse(JSON.parse(success(await h.a.store.read({ reference: current.conflicts[0]! })).content));
    expect(conflict).toMatchObject({ current: { value: { content: published } }, incoming: { value: { content: after } } });
    const log = success(await h.a.store.history({ reference: h.reference }));
    expect(log.map(({ content }) => content)).toEqual(expect.arrayContaining([before, after, published]));
    expect((await h.a.git(["ls-tree", "--name-only", `refs/arc/archive/${ownQuarter}`])).stdout).toBe("");
  });

  it("keeps decomposition children as independent items after withdrawing the origin's end", async () => {
    const h = await endsFixture(layout), primary = success(await h.a.store.read({ reference: h.reference }));
    const child = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "surviving-child" }, kind: "work-item/meta" });
    const lineage = JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2,
      origin: { name: h.reference.owner.name, uid: "uid" in h.reference.owner ? h.reference.owner.uid : undefined },
      kind: "decompose", successors: [{ name: child.owner.name }], incoming: [], outgoing: [] }));
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: h.transition, expected: null, content: lineage },
      { action: "remove", reference: primary.reference, expected: primary.version },
      { action: "put", reference: child, expected: null, content: makeMetaFixture("surviving-child"),
        placement: { kind: "backlog", commitment: "provisional" } },
    ], provenance: { verb: "decompose", lifecycleAction: "decompose" } }));
    const created = success(await h.a.store.read({ reference: child }));
    await h.archive(h.b, publishedQuarter); success(await h.b.store.push());
    const result = success(await h.a.store.push());
    expect(result.publishes.every(({ status }) => status !== "failed")).toBe(true);
    expect(result.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    expect(success(await h.a.store.read({ reference: child }))).toMatchObject({ version: created.version, reference: created.reference,
      content: created.content, placement: { kind: "backlog", commitment: "provisional" } });
    expect(await h.a.store.read({ reference: h.transition })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: child })).reference).toEqual(created.reference);
  });

});
