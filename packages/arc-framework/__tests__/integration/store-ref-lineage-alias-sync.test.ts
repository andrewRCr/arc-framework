/** Concurrent genuine rename evidence remains attached to its generation through terminal synchronization. */
import { expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { LineageRecordSchema, writeLineageRecord } from "../../src/lib/store/kinds/lineage/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";

const provenance = { verb: "start", lifecycleAction: "activate" };

it.each((["default", "separate"] as const).flatMap(layout => (["rename", "archive"] as const).flatMap(contribution =>
  [{ lateWrite: false, proofLoss: false }, { lateWrite: true, proofLoss: false }, { lateWrite: true, proofLoss: true }]
    .map(scenario => ({ layout, contribution, ...scenario })))))(
  "preserves a sibling's later retirement when its $contribution batch is withdrawn in $layout (late write: $lateWrite, proof loss: $proofLoss)", async ({ layout, contribution, lateWrite, proofLoss }) => {
  const h = await refSyncFixture(layout);
  success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } }),
    content: '{"projectId":"34567890-1234-4234-8234-123456789abc"}', provenance }));
  const start = async (name: string) => success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
    content: makeMetaFixture(name, { owner: "andrew" }), placement: { kind: "active" }, provenance }));
  const ending = await start("ending-item"), sibling = await start("sibling-before");
  success(await h.a.store.push()); success(await h.b.store.pull());
  const before = success(await h.a.store.read({ reference: sibling.reference }));
  const item = success(await h.a.store.read({ reference: ending.reference }));
  const renamed = contribution === "rename" ? RecordReferenceSchema.parse({ ...before.reference,
    owner: { ...before.reference.owner, name: "sibling-after" } }) : before.reference;
  success(await h.a.store.batch({ writes: [
    { action: "put", reference: item.reference, expected: item.version, content: item.content,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2027-q1") } },
    { action: "put", reference: renamed, expected: before.version, content: makeMetaFixture(renamed.owner.name, { owner: "andrew" }),
      placement: contribution === "rename" ? { kind: "active" } : { kind: "completed", quarter: ArchiveQuarterSchema.parse("2027-q1") } },
  ], provenance: { verb: "archive", lifecycleAction: "archive" } }));
  if (contribution === "archive") {
    const closed = success(await h.a.store.read({ reference: renamed }));
    success(await h.a.store.write({ action: "put", reference: closed.reference, expected: closed.version, content: closed.content,
      placement: { kind: "active" }, provenance: { verb: "reopen", lifecycleAction: "reopen" } }));
  }
  const current = success(await h.a.store.read({ reference: renamed }));
  const owner = current.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected terminal sibling UID");
  const terminal = RecordReferenceSchema.parse({ owner, kind: "lineage/transition" });
  success(await h.a.store.batch({ writes: [
    { action: "put", reference: terminal, expected: null, content: writeLineageRecord(LineageRecordSchema.parse({ schemaVersion: 2,
      origin: { name: owner.name, uid: owner.uid }, kind: "abandon", successors: [], incoming: [] })) },
    { action: "remove", reference: current.reference, expected: current.version },
  ], provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
  expect(success(await h.a.store.lookup({ kind: "lineage", origin: "sibling-before" })).reference).toEqual(terminal);
  const history = `refs/arc/history/work/${owner.uid}`;
  const retirement = (await h.a.git(["rev-parse", history])).stdout.trim();
  if (lateWrite) {
    const late = success(await h.b.store.read({ reference: sibling.reference }));
    success(await h.b.store.batch({ writes: [
      { action: "put", reference: late.reference, expected: late.version, content: `${late.content}\nLate primary edit.\n`, placement: { kind: "active" } },
      { action: "put", reference: RecordReferenceSchema.parse({ owner: late.reference.owner, kind: "work-item/companion", key: "late-only" }),
        expected: null, content: "Retained late record.\n" },
    ], provenance: { verb: "save", lifecycleAction: "save" } }));
    success(await h.b.store.push()); success(await h.a.store.pull());
    expect((await h.a.git(["for-each-ref", "--format=%(refname)", `refs/arc/work/${owner.uid}`])).stdout).toBe("");
    expect((await h.a.git(["ls-tree", "-r", "--name-only", history])).stdout).toContain("conflicts/");
  }
  const retainedTree = (await h.a.git(["rev-parse", `${history}^{tree}`])).stdout;
  const competing = success(await h.b.store.read({ reference: ending.reference }));
  success(await h.b.store.write({ action: "put", reference: competing.reference, expected: competing.version, content: competing.content,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  success(await h.b.store.push());
  if (proofLoss) {
    const scope = h.a.gitDir ? [`--git-dir=${h.a.gitDir}`] : [];
    const bytes = (await h.a.ports.rawExec([...scope, "cat-file", "commit", retirement], { objectAccess: "local-only" })).stdout;
    const ownRefs = [history, `refs/arc/history/work/${"uid" in ending.reference.owner ? ending.reference.owner.uid : ""}`,
      "refs/arc/archive/2027-q1"];
    const affected = async () => (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", ...ownRefs])).stdout;
    const before = await affected();
    let damaged = false;
    const racing = createRefStore({ ...h.a.ports, lock: async (ref, wait) => {
      const release = await h.a.ports.lock(ref, wait);
      if (!damaged && ref === "refs/arc/archive/2027-q1") {
        damaged = true; await removeLooseObject(h.a.root, retirement, h.a.gitDir);
      }
      return release;
    } });
    try {
      const held = success(await racing.pull()).pulls.flatMap(({ notices }) => notices);
      expect(damaged).toBe(true);
      expect(held).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: history,
        remedy: { text: expect.stringMatching(/restore|fetch/iu) } }));
      expect(held.some(({ kind }) => kind === "end-withdrawn")).toBe(false);
      expect(await affected()).toBe(before);
    } finally {
      const restored = await h.a.ports.rawExec([...scope, "hash-object", "-t", "commit", "-w", "--stdin"],
        { input: bytes, objectAccess: "local-only" });
      expect(new TextDecoder().decode(restored.stdout).trim()).toBe(retirement);
    }
  }
  const pulled = success(await h.a.store.pull());
  expect(pulled.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
  expect(success(await h.a.store.read({ reference: terminal })).reference).toEqual(terminal);
  expect(await h.a.store.read({ reference: current.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect((await h.a.git(["for-each-ref", "--format=%(refname)", `refs/arc/work/${owner.uid}`])).stdout).toBe("");
  expect((await h.a.git(["rev-parse", `${history}^{tree}`])).stdout).toBe(retainedTree);
  expect(success(await h.a.store.lookup({ kind: "lineage", origin: "sibling-before" })).reference).toEqual(terminal);
  const pushed = success(await h.a.store.push());
  expect(pushed.publishes.filter(({ status }) => status === "failed"), JSON.stringify(pushed)).toEqual([]);
  success(await h.b.store.pull());
  for (const store of [h.a.store, h.b.store]) {
    expect(success(await store.lookup({ kind: "lineage", origin: "sibling-before" })).reference).toEqual(terminal);
  }
}, 60_000);

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

it.each(["default", "separate"] as const)("does not treat lineage beside an archive as a later retirement in %s", async layout => {
  const h = await lineageBesideLive(layout);
  const lineage = success(await h.a.store.read({ reference: h.lineage.reference }));
  success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } }),
    content: '{"projectId":"34567890-1234-4234-8234-123456789abc"}', provenance }));
  const ending = success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "competing" } }),
    content: makeMetaFixture("competing", { owner: "andrew" }), placement: { kind: "active" }, provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const sibling = success(await h.a.store.read({ reference: h.made.reference }));
  const current = success(await h.a.store.read({ reference: ending.reference }));
  success(await h.a.store.batch({ writes: [current, sibling].map(item => ({ action: "put" as const,
    reference: item.reference, expected: item.version, content: item.content,
    placement: { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2027-q1") } })),
  provenance: { verb: "archive", lifecycleAction: "archive" } }));
  const competing = success(await h.b.store.read({ reference: ending.reference }));
  success(await h.b.store.write({ action: "put", reference: competing.reference, expected: competing.version,
    content: competing.content, placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  success(await h.b.store.push());
  const pulled = success(await h.a.store.pull());
  expect(pulled.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-withdrawn" }));
  expect(success(await h.a.store.read({ reference: h.made.reference }))).toMatchObject({ content: sibling.content, placement: { kind: "active" } });
  expect((await h.a.git(["for-each-ref", "--format=%(refname)", `refs/arc/work/${h.uid}`])).stdout).toBe(`refs/arc/work/${h.uid}`);
  expect((await h.a.git(["for-each-ref", "--format=%(refname)", `refs/arc/history/work/${h.uid}`])).stdout).toBe("");
  expect(success(await h.a.store.read({ reference: h.lineage.reference })).content).toBe(lineage.content);
  const pushed = success(await h.a.store.push());
  expect(pushed.publishes.filter(({ status }) => status === "failed"), JSON.stringify(pushed)).toEqual([]);
}, 60_000);

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

it.each(["default", "separate"] as const)("keeps the transition record's lineage name beside a one-sided lineage conflict record in %s", async layout => {
  const h = await refSyncFixture(layout);
  const made = success(await h.a.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "beside" } }),
    content: makeMetaFixture("beside", { owner: "andrew" }), placement: { kind: "active" }, provenance }));
  const owner = made.reference.owner;
  if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected a generation-bound item");
  success(await h.a.store.push()); success(await h.b.store.pull());
  const lineage = RecordReferenceSchema.parse({ owner, kind: "lineage/transition" });
  const end = (side: typeof h.a, retiredBranches?: []) => side.store.write({ action: "put", expected: null, reference: lineage,
    content: writeLineageRecord(LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: owner.name, uid: owner.uid }, kind: "abandon",
      successors: [], incoming: [], ...retiredBranches ? { retiredBranches } : {} })), provenance: { verb: "abandon", lifecycleAction: "abandon" } });
  // Clashing transitions leave a lineage conflict record on the side that pulled them and has not pushed since.
  success(await end(h.a)); success(await h.a.store.push());
  success(await end(h.b, []));
  success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference: lineage })).conflicts.length).toBeGreaterThan(0);
  const rename = async (side: typeof h.a, name: string) => {
    const current = success(await side.store.read({ reference: made.reference }));
    const reference = RecordReferenceSchema.parse({ ...current.reference, owner: { ...current.reference.owner, name } });
    success(await side.store.write({ action: "put", reference, expected: current.version, content: makeMetaFixture(name, { owner: "andrew" }),
      placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "rename" } }));
  };
  await rename(h.a, "left-name"); success(await h.a.store.push());
  await rename(h.b, "right-name");
  const pulled = success(await h.b.store.pull());
  expect(pulled.pulls.every(({ status }) => status !== "failed")).toBe(true);
  const item = success(await h.b.store.read({ reference: made.reference }));
  expect(success(await h.b.store.lookup({ kind: "lineage", origin: owner.uid })).reference.owner.name).toBe(item.reference.owner.name);
}, 60_000);
