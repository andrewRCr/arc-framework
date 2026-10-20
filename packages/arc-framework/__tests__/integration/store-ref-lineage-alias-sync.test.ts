/** Concurrent genuine rename evidence remains attached to its generation through terminal synchronization. */
import { expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { LineageRecordSchema, writeLineageRecord } from "../../src/lib/store/kinds/lineage/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const provenance = { verb: "start", lifecycleAction: "activate" };

it.each(["default", "separate"] as const)("unions independently authenticated former names of one terminal generation in %s", async layout => {
  const h = await refSyncFixture(layout);
  const initial = success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "shared-name" } }),
    content: makeMetaFixture("shared-name", { owner: "andrew" }), placement: { kind: "active" }, provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const endRenamed = async (side: typeof h.a, intermediate: string) => {
    let current = success(await side.store.read({ reference: initial.reference }));
    for (const name of [intermediate, "terminal-home"]) {
      const reference = RecordReferenceSchema.parse({ ...current.reference, owner: { ...current.reference.owner, name } });
      success(await side.store.write({ action: "put", reference, expected: current.version,
        content: makeMetaFixture(name, { owner: "andrew" }), placement: { kind: "active" },
        provenance: { verb: "rename", lifecycleAction: "rename" } }));
      current = success(await side.store.read({ reference }));
    }
    const owner = current.reference.owner;
    if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected a generation-bound origin");
    const reference = RecordReferenceSchema.parse({ owner, kind: "lineage/transition" });
    const content = writeLineageRecord(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: owner.name, uid: owner.uid },
      kind: "abandon", successors: [], incoming: [], retiredBranches: [] }));
    success(await side.store.batch({ writes: [
      { action: "put", reference, expected: null, content },
      { action: "remove", reference: current.reference, expected: current.version },
    ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    return reference;
  };
  const terminal = await endRenamed(h.a, "left-name");
  expect(await endRenamed(h.b, "right-name")).toEqual(terminal);
  success(await h.a.store.push());
  const joined = success(await h.b.store.push());
  expect(joined.states).toEqual([]);
  expect(joined.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
  expect(joined.publishes.every(({ status }) => status !== "failed")).toBe(true);
  success(await h.a.store.pull());
  for (const store of [h.a.store, h.b.store]) for (const origin of ["shared-name", "left-name", "right-name"]) {
    expect(success(await store.lookup({ kind: "lineage", origin })).reference).toEqual(terminal);
  }
}, 60_000);
