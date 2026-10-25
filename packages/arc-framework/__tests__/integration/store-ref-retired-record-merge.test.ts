/** Repeated late-write reconciliation keeps primary-less retained records and holds undecodable sides. */
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema, ConflictRecordSchema, HistoryRefSchema } from "../../src/lib/store/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { createRefSyncCheckout, refSyncFixture } from "../helpers/store/ref-sync.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("retired record merges in %s", layout => {
  it.each([
    { sameKey: false, completed: false, missingWitness: false },
    { sameKey: true, completed: false, missingWitness: false },
    { sameKey: true, completed: true, missingWitness: false },
    { sameKey: true, completed: false, missingWitness: true },
  ])("merges retained companions (same key $sameKey, archived writer $completed, missing witness $missingWitness)", async ({ sameKey, completed, missingWitness }) => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("late-write"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "late-write" } }),
      placement: { kind: "active" }, provenance: testProvenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const owner = made.reference.owner;
    if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected an allocated owner");
    const root = join(h.a.root, "third-clone");
    await h.a.exec("git", ["clone", "--no-hardlinks", h.origin, root]);
    for (const [key, value] of [["arc.identity", "andrew"], ["user.name", "Third clone"], ["user.email", "third@example.com"],
      ...layout === "default" ? [["remote.origin.arc-state", "push"]] : []]) {
      await h.a.exec("git", ["-C", root, "config", key!, value!]);
    }
    const third = await createRefSyncCheckout(root, layout, h.origin);
    success(await third.store.pull());
    const before = success(await h.a.store.read({ reference: made.reference }));
    const companion = RecordReferenceSchema.parse({ owner, kind: "work-item/companion", key: "late-only" });
    const quarter = ArchiveQuarterSchema.parse("2026-q4");
    if (completed) {
      success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version, content: before.content,
        placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
      success(await h.a.store.write({ action: "put", reference: companion, expected: null,
        content: "Created only by the late writer.\n", provenance: testProvenance }));
    } else success(await h.a.store.batch({ writes: [
      { action: "put", reference: before.reference, expected: before.version, content: `${before.content}\nLate.\n`, placement: { kind: "active" } },
      { action: "put", reference: companion, expected: null, content: "Created only by the late writer.\n" },
    ], provenance: testProvenance }));
    const ending = success(await h.b.store.read({ reference: made.reference }));
    success(await h.b.store.batch({ writes: [
      { action: "put", reference: RecordReferenceSchema.parse({ owner, kind: "lineage/transition" }), expected: null,
        content: JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: owner.name, uid: owner.uid },
          kind: "abandon", successors: [], incoming: [] })) },
      { action: "remove", reference: ending.reference, expected: ending.version },
    ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    success(await h.b.store.push()); success(await h.a.store.pull()); success(await h.a.store.push());
    const original = success(await third.store.read({ reference: made.reference }));
    success(await third.store.batch({ writes: [
      { action: "put", reference: original.reference, expected: original.version,
        content: `${original.content}\nThird late.\n`, placement: { kind: "active" } },
      ...sameKey ? [{ action: "put" as const, reference: companion, expected: null, content: "Created independently by the third clone.\n" }] : [],
    ], provenance: testProvenance }));
    const history = `refs/arc/history/work/${owner.uid}`;
    if (missingWitness) {
      const parent = (await h.a.git(["rev-parse", history])).stdout.trim(), entries = await capturedEntries(h.a, history);
      const planted = await plantRef(h.a.root, history, [...entries, { path: "unwitnessed-late-write.md", content: "No accepted placement witness.\n" }],
        { parents: [parent], gitDir: h.a.gitDir });
      await h.a.git(["push", h.remoteName, `${history}:${history}`]);
      const before = (await third.git(["rev-parse", `refs/arc/work/${owner.uid}`])).stdout;
      expect(success(await third.store.pull()).pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({
        kind: "namespace-corrupt", ref: history, condition: expect.stringContaining("placement"),
        remedy: { text: expect.stringMatching(/remove.*source ref.*retry/iu) },
      }));
      expect((await third.git(["rev-parse", `refs/arc/work/${owner.uid}`])).stdout).toBe(before);
      expect((await h.a.git(["show", `${history}:unwitnessed-late-write.md`])).stdout).toBe("No accepted placement witness.");
      await plantRef(h.a.root, history, entries, { parents: [planted.tip], gitDir: h.a.gitDir });
      await h.a.git(["push", h.remoteName, `${history}:${history}`]);
    }
    const pulled = success(await third.store.pull());
    expect(pulled.pulls.every(({ status }) => status !== "failed")).toBe(true);
    expect(pulled.pulls.flatMap(({ notices }) => notices).some(({ kind }) => kind === "namespace-corrupt")).toBe(false);
    expect((await third.git(["show", `${history}:late-only-late-write.md`])).stdout).toBe("Created only by the late writer.");
    expect(await third.store.read({ reference: made.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const paths = (await third.git(["ls-tree", "-r", "--name-only", history])).stdout.split("\n").filter(path => path.startsWith("conflicts/"));
    const readConflicts = async (side: typeof third) => Promise.all(paths.map(async path =>
      ConflictRecordSchema.parse(JSON.parse((await side.git(["show", `${history}:${path}`])).stdout))));
    const conflicts = await readConflicts(third);
    if (sameKey) {
      const clash = conflicts.find(({ record }) => record.kind === companion.kind && record.key === companion.key);
      expect(clash).toMatchObject({ record: companion, location: { kind: "record" }, base: null });
      if (clash?.location.kind !== "record") throw new Error("Expected whole retained-record conflict");
      expect([clash.current, clash.incoming]).toEqual(expect.arrayContaining([
        expect.objectContaining({ value: expect.objectContaining({ content: "Created only by the late writer.\n", placement: completed ? { kind: "completed", quarter, sequence: "01" } : { kind: "active" } }),
          label: expect.objectContaining({ actor: h.a.carry().actor }) }),
        expect.objectContaining({ value: expect.objectContaining({ content: "Created independently by the third clone.\n", placement: { kind: "active" } }),
          label: expect.objectContaining({ actor: third.carry().actor }) }),
      ]));
    }
    expect(success(await third.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    success(await h.b.store.pull({ history: [HistoryRefSchema.parse(history)] }));
    expect(await readConflicts(h.b)).toEqual(conflicts);
    expect((await h.b.git(["show", `${history}:late-only-late-write.md`])).stdout).toBe("Created only by the late writer.");
  }, 60_000);

  it("holds an undecodable merge side and continues after its source is repaired", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("alpha"),
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } }),
      placement: { kind: "active" }, provenance: testProvenance }));
    if (made.reference.owner.type !== "work-item" || !made.reference.owner.uid) throw new Error("Expected an allocated owner");
    const ref = `refs/arc/work/${made.reference.owner.uid}`;
    success(await h.a.store.push()); success(await h.b.store.pull());
    success(await h.b.store.write({ action: "put", expected: null, content: "local\n", provenance: testProvenance,
      reference: RecordReferenceSchema.parse({ owner: made.reference.owner, kind: "work-item/companion", key: "local" }) }));
    const original = (await h.a.git(["rev-parse", ref])).stdout;
    const rows = (await h.a.git(["ls-tree", "-r", original])).stdout.split("\n").filter(Boolean);
    const entries: PlantTreeEntry[] = rows.map(row => {
      const [header, path = ""] = row.split("\t");
      return { path, oid: header?.split(" ")[2] ?? "", mode: "100644" };
    });
    const corrupt = await plantRef(h.a.root, ref, [...entries, { path: "bad-alpha.md", content: new Uint8Array([255]) }],
      { parents: [original], gitDir: h.a.gitDir });
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    const local = (await h.b.git(["rev-parse", ref])).stdout;
    expect(success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({
      kind: "namespace-corrupt", ref,
    }));
    expect((await h.b.git(["rev-parse", ref])).stdout).toBe(local);
    await plantRef(h.a.root, ref, [...entries, { path: "bad-alpha.md", content: "repaired\n" }],
      { parents: [corrupt.tip], gitDir: h.a.gitDir });
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    expect(success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
    expect(success(await h.b.store.read({ reference: RecordReferenceSchema.parse({ owner: made.reference.owner,
      kind: "work-item/companion", key: "bad" }) })).content).toBe("repaired\n");
  });
});
