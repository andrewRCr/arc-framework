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

async function lineageBesideLive(layout: "default" | "separate") {
  const h = await refSyncFixture(layout);
  const made = success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "beside" } }),
    content: makeMetaFixture("beside", { owner: "andrew" }), placement: { kind: "active" }, provenance }));
  const owner = made.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected a generation-bound item");
  const lineage = success(await h.a.store.write({ action: "put", expected: null, reference: RecordReferenceSchema.parse({ owner, kind: "lineage/transition" }),
    content: writeLineageRecord(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: owner.name, uid: owner.uid },
      kind: "abandon", successors: [], incoming: [] })), provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const rename = async (side: typeof h.a, name: string) => {
    const current = success(await side.store.read({ reference: made.reference }));
    const reference = RecordReferenceSchema.parse({ ...current.reference, owner: { ...current.reference.owner, name } });
    success(await side.store.write({ action: "put", reference, expected: current.version, content: makeMetaFixture(name, { owner: "andrew" }),
      placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "rename" } }));
  };
  return { ...h, made, lineage, uid: owner.uid, rename };
}

it.each(["default", "separate"] as const)("settles concurrent renames of a live item beside its lineage in %s", async layout => {
  const h = await lineageBesideLive(layout);
  await h.rename(h.a, "left-name"); success(await h.a.store.push());
  await h.rename(h.b, "right-name");
  const pulled = success(await h.b.store.pull());
  expect(pulled.pulls.every(({ status }) => status !== "failed")).toBe(true);
  success(await h.b.store.push()); success(await h.a.store.pull());
  for (const store of [h.a.store, h.b.store]) {
    const item = success(await store.read({ reference: h.made.reference }));
    expect(success(await store.lookup({ kind: "lineage", origin: h.uid })).reference.owner.name).toBe(item.reference.owner.name);
  }
}, 60_000);

it.each(["default", "separate"] as const)("withdraws one item's lineage end without touching other owners' lineage in %s", async layout => {
  const h = await refSyncFixture(layout);
  const start = async (name: string) => {
    const made = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
      content: makeMetaFixture(name, { owner: "andrew" }), placement: { kind: "active" }, provenance }));
    const owner = made.reference.owner;
    if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected a generation-bound item");
    return { reference: made.reference, uid: owner.uid, origin: { name: owner.name, uid: owner.uid },
      lineage: RecordReferenceSchema.parse({ owner, kind: "lineage/transition" }) };
  };
  const abandonment = (owner: { name: string; uid: string }, retiredBranches?: []) => writeLineageRecord(LineageRecordSchema.parse({
    schemaVersion: 2, origin: { name: owner.name, uid: owner.uid }, kind: "abandon", successors: [], incoming: [], ...retiredBranches ? { retiredBranches } : {} }));
  const ended = await start("ended-twice"), renamed = await start("renamed-holder"), clashing = await start("clashing-holder");
  success(await h.a.store.write({ action: "put", expected: null, reference: renamed.lineage, content: abandonment(renamed.origin),
    provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
  const holder = success(await h.a.store.read({ reference: renamed.reference }));
  const current = RecordReferenceSchema.parse({ ...holder.reference, owner: { ...holder.reference.owner, name: "renamed-later" } });
  success(await h.a.store.write({ action: "put", reference: current, expected: holder.version, content: makeMetaFixture("renamed-later", { owner: "andrew" }),
    placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "rename" } }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const abandon = async (side: typeof h.a) => {
    const item = success(await side.store.read({ reference: ended.reference }));
    success(await side.store.batch({ writes: [
      { action: "put", reference: ended.lineage, expected: null, content: abandonment(ended.origin) },
      { action: "remove", reference: item.reference, expected: item.version },
    ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
  };
  success(await h.a.store.write({ action: "put", expected: null, reference: clashing.lineage, content: abandonment(clashing.origin),
    provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
  await abandon(h.a); success(await h.a.store.push());
  success(await h.b.store.write({ action: "put", expected: null, reference: clashing.lineage, content: abandonment(clashing.origin, []),
    provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
  await abandon(h.b);
  const pulled = success(await h.b.store.pull());
  expect(pulled.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
  expect(success(await h.b.store.lookup({ kind: "lineage", origin: renamed.uid })).reference.owner.name).toBe("renamed-later");
  expect(success(await h.b.store.read({ reference: clashing.lineage })).conflicts?.length ?? 0).toBeGreaterThan(0);
}, 60_000);

it.each(["default", "separate"] as const)("settles a rename against a lineage removal beside a live item in %s", async layout => {
  const h = await lineageBesideLive(layout);
  await h.rename(h.a, "renamed"); success(await h.a.store.push());
  const lineage = success(await h.b.store.read({ reference: h.lineage.reference }));
  success(await h.b.store.write({ action: "remove", reference: lineage.reference, expected: lineage.version,
    provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
  const pulled = success(await h.b.store.pull());
  expect(pulled.pulls.every(({ status }) => status !== "failed")).toBe(true);
  success(await h.b.store.push());
  const settled = success(await h.a.store.pull());
  expect(settled.pulls.flatMap(({ notices }) => notices).some(({ kind }) => kind === "end-pending")).toBe(false);
  for (const store of [h.a.store, h.b.store]) {
    expect(success(await store.read({ reference: h.made.reference }))).toMatchObject({ reference: { owner: { name: "renamed" } }, placement: { kind: "active" } });
    expect(await store.lookup({ kind: "lineage", origin: h.uid })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }
}, 60_000);
