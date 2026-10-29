/** Quarter composition preserves exclusive roots even when a selected owner holds only metadata. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { HistoryRefSchema, RecordReferenceSchema, type StoreRecord } from "../../src/lib/store/index.js";
import { refSyncFixture, type RefSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), archive = `refs/arc/archive/${quarter}`;
const provenance = { verb: "archive", lifecycleAction: "archive" };
type Checkout = RefSyncFixture["a"];

describe.each(["default", "separate"] as const)("exclusive composed quarter roots in %s", layout => {
  it.each([true, false])("holds and repairs concurrent cohort renames with metadata-only local: %s", async metadataOnlyLocal => {
    const h = await publishedCohorts(layout);
    const first = await rename(h.a, h.first, "third");
    success(await h.a.store.write({ action: "remove", reference: first.reference, expected: first.version,
      provenance: { verb: "remove", lifecycleAction: "save" } }));
    await rename(h.b, h.second, "third");
    const receiver = metadataOnlyLocal ? h.a : h.b, sender = metadataOnlyLocal ? h.b : h.a;
    const senderHistory = metadataOnlyLocal ? h.secondHistory : h.firstHistory;
    await sender.git(["push", "--atomic", h.remoteName, `${archive}:${archive}`, `${senderHistory}:${senderHistory}`]);
    const localMetadata = await retainedMetadata(receiver), incomingMetadata = await retainedMetadata(sender);
    expect(localMetadata).toHaveLength(2); expect(incomingMetadata).toHaveLength(2);
    expect(await paths(h.a)).toContain(`01a_cohort-third/metadata-${h.firstUid}.json`);
    expect(await paths(h.a)).not.toContain("01a_cohort-third/cohort-third.md");
    expect(success(await h.a.store.list({ family: "cohort" }))).toMatchObject({ status: "complete", diagnostics: [] });
    expect(success(await h.b.store.list({ family: "cohort" }))).toMatchObject({ status: "complete", diagnostics: [] });
    const before = await refs(receiver), sourceBefore = await refs(sender);
    const remoteBefore = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    const pulled = success(await receiver.store.pull());
    expect(pulled.pulls.flatMap(row => row.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: archive,
      condition: expect.stringMatching(/exclusive.*01a_cohort-third/iu),
      remedy: { text: expect.stringMatching(/forward.*distinct.*preserv.*metadata.*retry/iu) } }));
    const notice = pulled.pulls.flatMap(row => row.notices).find(row => row.kind === "namespace-corrupt" && row.ref === archive);
    expect(notice?.condition).toContain(h.firstUid); expect(notice?.condition).toContain(h.secondUid);
    for (const { metadata } of [...localMetadata, ...incomingMetadata]) expect(notice?.condition).toContain(metadata.endBatch);
    expect(await refs(receiver)).toBe(before); expect(await refs(sender)).toBe(sourceBefore);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(remoteBefore);
    expect(await retainedMetadata(receiver)).toEqual(localMetadata);
    expect(await retainedMetadata(sender)).toEqual(incomingMetadata);

    await rename(h.b, h.second, "repaired");
    if (sender === h.b) await h.b.git(["push", "--atomic", h.remoteName, `${archive}:${archive}`, `${h.secondHistory}:${h.secondHistory}`]);
    const repaired = success(await receiver.store.pull());
    expect(repaired.pulls.flatMap(row => row.notices).filter(row => row.kind === "namespace-corrupt")).toEqual([]);
    expect(await receiver.store.read({ reference: h.first })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await receiver.store.read({ reference: h.second }))).toMatchObject({ reference: { owner: { name: "repaired", uid: h.secondUid } },
      placement: { kind: "completed", quarter, sequence: "01", closeout: "a" }, content: h.secondContent });
    const retained = await retainedMetadata(receiver);
    expect(retained).toHaveLength(2);
    expect(retained).toContainEqual({ path: `01a_cohort-third/metadata-${h.firstUid}.json`,
      metadata: expect.objectContaining({ slug: "third", endBatch: localMetadata.find(row => row.path.endsWith(`metadata-${h.firstUid}.json`))?.metadata.endBatch }) });
    expect(retained).toContainEqual({ path: `01a_cohort-repaired/metadata-${h.secondUid}.json`,
      metadata: expect.objectContaining({ slug: "repaired", endBatch: localMetadata.find(row => row.path.endsWith(`metadata-${h.secondUid}.json`))?.metadata.endBatch }) });
    expect((await paths(receiver)).filter(path => path.startsWith("01a_cohort-third/"))).toEqual([`01a_cohort-third/metadata-${h.firstUid}.json`]);
    expect(success(await receiver.store.list({ family: "cohort" }))).toMatchObject({ status: "complete", diagnostics: [] });
  }, 90_000);
});

async function publishedCohorts(layout: "default" | "separate") {
  const h = await refSyncFixture(layout);
  const create = async (name: string) => {
    const made = success(await h.a.store.write({ action: "put", expected: null, content: `# ${name}\n\n**Purpose:** Retained cohort.\n`,
      reference: RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name } }), provenance }));
    return success(await h.a.store.read({ reference: made.reference }));
  };
  const first = await create("first"), second = await create("second");
  const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("member", { cohort: "first" }),
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "member" } }),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  let member = success(await h.a.store.read({ reference: made.reference }));
  const end = (record: StoreRecord, content = record.content) => ({ action: "put" as const, reference: record.reference,
    content, expected: record.version, placement: { kind: "completed" as const, quarter } });
  success(await h.a.store.batch({ writes: [end(member), end(first)], provenance }));
  member = success(await h.a.store.read({ reference: member.reference }));
  success(await h.a.store.batch({ writes: [end(member, makeMetaFixture("member", { cohort: "second" }))], provenance }));
  member = success(await h.a.store.read({ reference: member.reference }));
  success(await h.a.store.batch({ writes: [end(member), end(second)], provenance }));
  if (!("uid" in first.reference.owner) || !("uid" in second.reference.owner)) throw new Error("Expected stored cohort UIDs");
  const firstUid = first.reference.owner.uid!, secondUid = second.reference.owner.uid!;
  const firstHistory = HistoryRefSchema.parse(`refs/arc/history/cohort/${firstUid}`);
  const secondHistory = HistoryRefSchema.parse(`refs/arc/history/cohort/${secondUid}`);
  success(await h.a.store.push()); success(await h.b.store.pull({ history: [firstHistory, secondHistory] }));
  return { ...h, first: first.reference, second: second.reference, firstUid, secondUid, firstHistory, secondHistory, secondContent: second.content };
}

async function rename(side: Checkout, reference: StoreRecord["reference"], name: string): Promise<StoreRecord> {
  const current = success(await side.store.read({ reference }));
  const renamed = RecordReferenceSchema.parse({ ...current.reference, owner: { ...current.reference.owner, name } });
  success(await side.store.write({ action: "put", reference: renamed, expected: current.version, content: current.content,
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  return success(await side.store.read({ reference: renamed }));
}
async function refs(side: Checkout): Promise<string> {
  return (await side.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
}
async function paths(side: Checkout): Promise<string[]> {
  return (await side.git(["ls-tree", "-r", "--name-only", archive])).stdout.trim().split("\n");
}
async function retainedMetadata(side: Checkout) {
  return Promise.all((await paths(side)).filter(path => /^\d+[ab]_cohort-[^/]+\/metadata-[^/]+\.json$/u.test(path)).map(async path => ({ path,
    metadata: JSON.parse((await side.git(["show", `${archive}:${path}`])).stdout) as { slug: string; endBatch: string } })));
}
