/** An unreadable older end journal cannot revive an unrelated unpublished end. */
import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { writeLineageRecord } from "../../src/lib/store/kinds/lineage/index.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";

const ownQuarter = ArchiveQuarterSchema.parse("2027-q1"), remoteQuarter = ArchiveQuarterSchema.parse("2026-q4");
const provenance = { verb: "archive", lifecycleAction: "archive" };

const localQuarter = ownQuarter, publishedQuarter = remoteQuarter;
describe.each(["default", "separate"] as const)("held journal neighbors in %s", layout => {
  it.each(["archive", "abandon"] as const)("keeps an unpublished %s ended beside a held original journal", async end => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "original-journal" }, kind: "work-item/meta" }),
      content: makeMetaFixture("original-journal"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    const other = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "unpublished-neighbor" }, kind: "work-item/meta" }),
      content: makeMetaFixture("unpublished-neighbor"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const primary = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: made.reference, expected: primary.version, content: primary.content,
      placement: { kind: "completed", quarter: localQuarter }, provenance }));
    const quarterRef = `refs/arc/archive/${localQuarter}`;
    const journalRef = quarterRef;
    const originalTree = (await h.a.git(["ls-tree", quarterRef])).stdout.trim().split(/\s+/u)[2];
    if (!originalTree) throw new Error("Expected the original archive folder tree");
    const scope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
    const bytes = (await h.a.ports.rawExec([...scope, "cat-file", "tree", originalTree], { cwd: h.a.root, objectAccess: "local-only" })).stdout;
    const neighbor = success(await h.a.store.read({ reference: other.reference }));
    if (end === "archive") success(await h.a.store.write({ action: "put", reference: neighbor.reference, expected: neighbor.version, content: neighbor.content,
      placement: { kind: "completed", quarter: localQuarter }, provenance }));
    else {
      const owner = neighbor.reference.owner;
      if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected neighbor UID");
      success(await h.a.store.batch({ writes: [
        { action: "remove", reference: neighbor.reference, expected: neighbor.version },
        { action: "put", reference: RecordReferenceSchema.parse({ owner, kind: "lineage/transition" }), expected: null,
          content: writeLineageRecord({ schemaVersion: 2, origin: { name: owner.name, uid: owner.uid }, kind: "abandon", successors: [], incoming: [] }) },
      ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    }
    const companion = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: made.reference.owner, key: "journal-late" });
    success(await h.a.store.write({ action: "put", reference: companion, expected: null, content: "A retained later edit.\n",
      provenance: { verb: "save", lifecycleAction: "save" } }));
    expect((await h.a.git(["ls-tree", quarterRef])).stdout.trim().split(/\s+/u)[2]).not.toBe(originalTree);
    const remote = success(await h.b.store.read({ reference: made.reference }));
    success(await h.b.store.write({ action: "put", reference: made.reference, expected: remote.version, content: remote.content,
      placement: { kind: "completed", quarter: publishedQuarter }, provenance }));
    success(await h.b.store.push());
    const owner = made.reference.owner;
    if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected a minted work item");
    const history = `refs/arc/history/work/${owner.uid}`;
    const before = (await h.a.git(["rev-parse", journalRef])).stdout;
    const ownHistory = (await h.a.git(["rev-parse", history])).stdout;
    const publishedHistory = (await h.remote("git", ["rev-parse", history])).stdout;
    await removeLooseObject(h.a.root, originalTree, h.a.gitDir);
    for (const operation of ["pull", "pull", "push"] as const) {
      const notices = success(await h.a.store[operation]()).pulls.flatMap(({ notices }) => notices);
      expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: journalRef,
        remedy: { text: expect.stringMatching(/restore|fetch/iu) } }));
      expect(notices).not.toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
      expect((await h.a.git(["rev-parse", journalRef])).stdout).toBe(before);
      expect((await h.a.git(["rev-parse", history])).stdout).toBe(ownHistory);
      if (!("uid" in other.reference.owner)) throw new Error("Expected neighbor UID");
      expect((await h.a.git(["for-each-ref", "--format=%(refname)", `refs/arc/work/${other.reference.owner.uid}`])).stdout,
        "The neighbor must remain ended while another journal is held").toBe("");
      expect((await h.remote("git", ["rev-parse", history])).stdout).toBe(publishedHistory);
    }
    await h.a.ports.rawExec([...scope, "hash-object", "-t", "tree", "-w", "--stdin"], { cwd: h.a.root, input: bytes, objectAccess: "local-only" });
    const repaired = success(await h.a.store.pull());
    expect(repaired.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: owner }));
    expect(success(await h.a.store.read({ reference: made.reference })).placement).toMatchObject({ kind: "completed", quarter: publishedQuarter });
    expect(success(await h.a.store.read({ reference: companion })).content).toBe("A retained later edit.\n");
    expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    success(await h.b.store.pull());
    if (end === "archive") expect(success(await h.b.store.read({ reference: neighbor.reference })).placement)
      .toMatchObject({ kind: "completed", quarter: localQuarter });
    else expect(JSON.parse(success(await h.b.store.read({ reference: RecordReferenceSchema.parse({ owner: neighbor.reference.owner, kind: "lineage/transition" }) })).content))
      .toMatchObject({ kind: "abandon" });
  });
});
