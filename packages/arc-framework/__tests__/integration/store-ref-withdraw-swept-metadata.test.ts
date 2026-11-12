/** Withdrawing a swept retirement restores primary facts around conflicts from an earlier late-write merge. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { ConflictRecordSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { LineageRecordSchema } from "../../src/lib/store/kinds/lineage/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("swept metadata withdrawal in %s", layout => {
  it("retains earlier conflicts while restoring primary placement for a competing published archive", async () => {
    const h = await refSyncFixture(layout), provenance = { verb: "edit", lifecycleAction: "save" };
    const made = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "swept-metadata" } }),
      content: makeMetaFixture("swept-metadata"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
    const owner = made.reference.owner;
    if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected created work-item identity");
    success(await h.a.store.push()); success(await h.b.store.pull());
    const own = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: RecordReferenceSchema.parse({ kind: "lineage/transition", owner }), expected: null,
        content: JSON.stringify(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: owner.name, uid: owner.uid },
          kind: "abandon", successors: [], incoming: [] })) },
      { action: "remove", reference: own.reference, expected: own.version },
    ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    const remote = success(await h.b.store.read({ reference: made.reference }));
    const content = `${remote.content}\nPublished late primary edit.\n`;
    success(await h.b.store.write({ action: "put", reference: remote.reference, expected: remote.version,
      content, placement: remote.placement, provenance }));
    success(await h.b.store.push());
    expect(success(await h.a.store.pull()).pulls.every(outcome => outcome.status !== "failed")).toBe(true);
    const history = expandStoredPath(made.reference).ref.replace("refs/arc/", "refs/arc/history/");
    const paths = (await h.a.git(["ls-tree", "-r", "--name-only", history])).stdout.split("\n").filter(path => /^conflicts\/[^/]+\.json$/u.test(path));
    expect(paths.length).toBeGreaterThan(0);
    const conflicts = await Promise.all(paths.map(async path => ({ path,
      value: ConflictRecordSchema.parse(JSON.parse((await h.a.git(["show", `${history}:${path}`])).stdout)) })));
    expect(JSON.stringify(conflicts)).toContain("Published late primary edit.");
    const ending = success(await h.b.store.read({ reference: made.reference }));
    const quarter = ArchiveQuarterSchema.parse("2026-q4");
    success(await h.b.store.write({ action: "put", reference: ending.reference, expected: ending.version, content: ending.content,
      placement: { kind: "completed", quarter }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    success(await h.b.store.push());
    const notices = success(await h.a.store.pull()).pulls.flatMap(outcome => outcome.notices);
    expect(notices).toContainEqual(expect.objectContaining({ kind: "end-withdrawn", item: owner }));
    expect(notices.filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    expect(success(await h.a.store.read({ reference: made.reference }))).toMatchObject({ content: own.content, placement: { kind: "completed", quarter } });
    for (const conflict of conflicts) {
      const key = conflict.path.slice("conflicts/".length, -".json".length);
      const record = success(await h.a.store.read({ reference: RecordReferenceSchema.parse({ kind: "work-item/conflict-record", owner, key }) }));
      expect(JSON.parse(record.content)).toEqual(conflict.value);
    }
    expect(success(await h.a.store.push()).publishes.every(outcome => outcome.status !== "failed")).toBe(true);
    expect(success(await h.a.store.pull()).pulls.flatMap(outcome => outcome.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: made.reference }))).toMatchObject({ content: own.content, placement: { kind: "completed", quarter } });
  }, 60_000);
});
