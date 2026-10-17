import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), laterQuarter = ArchiveQuarterSchema.parse("2027-q1");

async function doubleFixture(layout: "default" | "separate", snapshot = false) {
  const h = await refSyncFixture(layout);
  const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("doubled"),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "doubled" } }),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const lineage = RecordReferenceSchema.parse({ owner: made.reference.owner, kind: "lineage/transition" });
  const content = JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2,
    origin: { name: made.reference.owner.name, uid: "uid" in made.reference.owner ? made.reference.owner.uid : undefined },
    kind: "abandon", successors: [], incoming: [], ...snapshot ? { retiredBranches: [] } : {} }));
  const place = async (side: typeof h.a, placement: { kind: "active" } | { kind: "completed"; quarter: typeof quarter }) => {
    const record = success(await side.store.read({ reference: made.reference }));
    success(await side.store.write({ action: "put", reference: record.reference, expected: record.version, content: record.content,
      placement, provenance: placement.kind === "active" ? { verb: "reopen", lifecycleAction: "reopen" } : { verb: "archive", lifecycleAction: "archive" } }));
  };
  return { ...h, reference: made.reference, lineage, content, place };
}

describe.each(["default", "separate"] as const)("published double ends in the %s layout", (layout) => {
  it("keeps both published archives after a mirror erases the first, until reopening clears every quarter", async () => {
    const h = await doubleFixture(layout);
    await h.place(h.a, { kind: "completed", quarter }); success(await h.a.store.push());
    const erased = (await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim().split("\n");
    for (const ref of erased) await h.remote("git", ["update-ref", "-d", ref]);
    await h.place(h.b, { kind: "completed", quarter: laterQuarter });
    expect(success(await h.b.store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
    for (let attempt = 0; attempt < 2; attempt++) {
      const notices = success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices);
      expect(notices).toContainEqual(expect.objectContaining({ kind: "ended-twice", item: h.reference.owner }));
      expect(notices.some(({ kind }) => kind === "end-withdrawn" || kind === "end-pending")).toBe(false);
      expect((await h.a.git(["ls-tree", "-r", "--name-only", `refs/arc/archive/${quarter}`])).stdout).toContain(`metadata-${"uid" in h.reference.owner ? h.reference.owner.uid : ""}.json`);
      expect((await h.a.git(["ls-tree", "-r", "--name-only", `refs/arc/archive/${laterQuarter}`])).stdout).toContain(`metadata-${"uid" in h.reference.owner ? h.reference.owner.uid : ""}.json`);
    }
    success(await h.a.store.push());
    expect(success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "ended-twice" }));
    const uid = "uid" in h.reference.owner ? h.reference.owner.uid : "", history = `refs/arc/history/work/${uid}` as const;
    await h.a.git(["fetch", "--refmap=", "--no-tags", "--no-filter", h.remoteName,
      `+${history}:refs/arc-remotes/${h.remoteName}/history/work/${uid}`]);
    success(await h.a.store.pull({ history: [history] }));
    await h.place(h.a, { kind: "active" });
    for (const heldQuarter of [quarter, laterQuarter]) {
      expect((await h.a.git(["ls-tree", "-r", "--name-only", `refs/arc/archive/${heldQuarter}`])).stdout).not.toContain(`metadata-${"uid" in h.reference.owner ? h.reference.owner.uid : ""}.json`);
    }
    await h.place(h.a, { kind: "completed", quarter: laterQuarter }); success(await h.a.store.push());
    for (const side of [h.a, h.b]) for (let attempt = 0; attempt < 2; attempt++) {
      expect(success(await side.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
      expect(success(await side.store.read({ reference: h.reference })).placement).toMatchObject({ kind: "completed", quarter: laterQuarter });
    }
  });

  it.each([["one clone", false], ["two clones", false], ["one clone", true], ["two clones", true]] as const)(
    "reports published lineage beside an archive from %s with branch snapshot %s until the named repair", async (mode, snapshot) => {
    const h = await doubleFixture(layout, snapshot);
    if (mode === "one clone") success(await h.a.store.write({ action: "put", reference: h.lineage, expected: null, content: h.content,
      provenance: { verb: "abandon", lifecycleAction: "prepare-abandon" } }));
    await h.place(h.a, { kind: "completed", quarter }); success(await h.a.store.push());
    if (mode === "two clones") {
      success(await h.b.store.write({ action: "put", reference: h.lineage, expected: null, content: h.content,
        provenance: { verb: "abandon", lifecycleAction: "prepare-abandon" } }));
      success(await h.b.store.push());
    }
    for (const side of [h.a, h.b]) for (let attempt = 0; attempt < 2; attempt++) {
      const result = success(await side.store.pull());
      expect(result.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "ended-twice", item: h.reference.owner,
        condition: expect.stringContaining("lineage"), remedy: { text: expect.stringMatching(/lineage.*reopen.*once/isu) } }));
      expect(result.pulls.flatMap(({ notices }) => notices).some(({ kind }) => kind === "end-pending")).toBe(false);
    }
    const lineage = success(await h.a.store.read({ reference: h.lineage }));
    success(await h.a.store.write({ action: "remove", reference: h.lineage, expected: lineage.version,
      provenance: { verb: "resolve", lifecycleAction: "resolve-end" } }));
    await h.place(h.a, { kind: "active" }); await h.place(h.a, { kind: "completed", quarter: laterQuarter });
    expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    for (const side of [h.a, h.b]) {
      expect(success(await side.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
      expect(success(await side.store.read({ reference: h.reference })).placement).toMatchObject({ kind: "completed", quarter: laterQuarter });
    }
  });
});
