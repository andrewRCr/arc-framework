import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { refSyncFixture, type RefSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const ownQuarter = ArchiveQuarterSchema.parse("2027-q1"), remoteQuarter = ArchiveQuarterSchema.parse("2026-q4");
const provenance = { verb: "archive", lifecycleAction: "archive" };

async function stateRefs(side: RefSyncFixture["a"]): Promise<string> {
  return (await side.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout
    .split("\n").filter(row => !row.startsWith("refs/arc/tmp/")).join("\n");
}

describe.each(["default", "separate"] as const)("logical withdrawal namespace in %s", layout => {
  it("holds a restored logical parent beside a later child until forward repair", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "collision-inverse" }, kind: "work-item/meta" }),
      content: makeMetaFixture("collision-inverse"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    const parent = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "removed" });
    const child = RecordReferenceSchema.parse({ ...parent, key: "removed/later" });
    const home = expandStoredPath(parent);
    success(await h.a.store.write({ action: "put", reference: parent, expected: null, content: "Original parent.\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const primary = success(await h.a.store.read({ reference: made.reference })), original = success(await h.a.store.read({ reference: parent }));
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: primary.reference, expected: primary.version, content: primary.content, placement: { kind: "completed", quarter: ownQuarter } },
      { action: "remove", reference: parent, expected: original.version },
    ], provenance }));
    success(await h.a.store.write({ action: "put", reference: child, expected: null, content: "Retained child.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
    const remote = success(await h.b.store.read({ reference: made.reference }));
    success(await h.b.store.write({ action: "put", reference: remote.reference, expected: remote.version, content: remote.content,
      placement: { kind: "completed", quarter: remoteQuarter }, provenance }));
    success(await h.b.store.push());
    if (made.reference.owner.type !== "work-item" || !made.reference.owner.uid) throw new Error("Expected a minted owner");
    const history = `refs/arc/history/work/${made.reference.owner.uid}`, locked = new Set<string>();
    const snapshots: { refs: string; afterRefs: string; objects: string; afterObjects: string }[] = [];
    const observing = createRefStore({ ...h.a.ports, lock: async (ref, wait) => {
      const release = await h.a.ports.lock(ref, wait);
      locked.add(ref);
      const complete = ref === home.ref && locked.has(history) && locked.has(`refs/arc/archive/${ownQuarter}`);
      const refs = complete ? await stateRefs(h.a) : "", objects = complete ? (await h.a.git(["count-objects", "-v"])).stdout : "";
      return async () => {
        if (complete) snapshots.push({ refs, objects, afterRefs: await stateRefs(h.a), afterObjects: (await h.a.git(["count-objects", "-v"])).stdout });
        locked.delete(ref);
        await release();
      };
    } });
    const notices = success(await observing.pull()).pulls.flatMap(({ notices }) => notices);
    expect(notices).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: home.ref,
      condition: expect.stringContaining("removed"), remedy: { text: expect.stringMatching(/repair|rename|remove/iu) } }));
    expect(notices).not.toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    expect(snapshots.length).toBeGreaterThan(0);
    for (const snapshot of snapshots) {
      expect(snapshot.afterRefs).toBe(snapshot.refs);
      expect(snapshot.afterObjects).toBe(snapshot.objects);
    }
    const retained = success(await h.a.store.read({ reference: child }));
    expect(retained.content).toBe("Retained child.\n");
    expect(await h.a.store.read({ reference: parent })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    success(await h.a.store.write({ action: "remove", reference: child, expected: retained.version, provenance: { verb: "save", lifecycleAction: "save" } }));
    expect(success(await h.a.store.pull()).pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
    expect(success(await h.a.store.read({ reference: parent })).content).toBe("Original parent.\n");
    expect(success(await h.a.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
  });
});
