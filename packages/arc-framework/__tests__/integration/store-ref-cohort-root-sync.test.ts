/** A history refresh cannot rename a cohort over another generation's complete archive root. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { HistoryRefSchema, RecordReferenceSchema, type StoreRecord } from "../../src/lib/store/index.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), provenance = { verb: "archive", lifecycleAction: "archive" };

describe.each(["default", "separate"] as const)("cohort root ownership during sync in %s", layout => {
  it("holds a retained rename into another owner root and resumes after a forward unique-name repair", async () => {
    const h = await refSyncFixture(layout);
    const createCohort = async (name: string) => {
      const made = success(await h.a.store.write({ action: "put", expected: null, content: `# ${name}\n\n**Purpose:** Retained cohort.\n`,
        reference: RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name } }), provenance }));
      return success(await h.a.store.read({ reference: made.reference }));
    };
    const first = await createCohort("first"), second = await createCohort("second");
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
    const kept = success(await h.a.store.read({ reference: first.reference }));
    if (!("uid" in second.reference.owner)) throw new Error("Expected stored cohort UID");
    const history = HistoryRefSchema.parse(`refs/arc/history/cohort/${second.reference.owner.uid}`);
    success(await h.a.store.push()); success(await h.b.store.pull({ history: [history] }));
    const entries = await capturedEntries(h.b, history), parent = (await h.b.git(["rev-parse", history])).stdout.trim();
    const metadataPath = `metadata-${second.reference.owner.uid}.json`;
    const metadata = JSON.parse((await h.b.git(["show", `${history}:${metadataPath}`])).stdout) as object;
    const renamed = (name: string) => entries.map(entry => entry.path === metadataPath
      ? { path: metadataPath, content: JSON.stringify({ ...metadata, slug: name }) }
      : entry.path === "cohort-second.md" ? { ...entry, path: `cohort-${name}.md` } : entry);
    const broken = await plantRef(h.b.root, history, renamed("first"), { parents: [parent], gitDir: h.b.gitDir });
    await h.b.git(["push", h.remoteName, `${history}:${history}`]);
    const refs = async () => (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    const before = await refs();
    const pulled = success(await h.a.store.pull({ history: [history] }));
    expect(pulled.pulls.flatMap(pull => pull.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: history,
      condition: expect.stringMatching(/destination root/iu), remedy: { text: expect.stringMatching(/rename.*retry/iu) } }));
    expect(await refs()).toBe(before);
    expect(success(await h.a.store.read({ reference: first.reference }))).toEqual(kept);
    await plantRef(h.b.root, history, renamed("repaired"), { parents: [broken.tip], gitDir: h.b.gitDir });
    await h.b.git(["push", h.remoteName, `${history}:${history}`]);
    const repaired = success(await h.a.store.pull({ history: [history] }));
    expect(repaired.pulls.flatMap(pull => pull.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    expect(success(await h.a.store.read({ reference: second.reference }))).toMatchObject({ reference: { owner: { name: "repaired" } },
      placement: { kind: "completed", quarter, sequence: "01", closeout: "a" } });
    expect(success(await h.a.store.read({ reference: first.reference }))).toEqual(kept);
  }, 90_000);
});
