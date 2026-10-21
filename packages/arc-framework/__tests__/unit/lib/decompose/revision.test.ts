import { storedCutMapFixture } from "../../../fixtures/stored-cut-map.js";
/** Revision approval binds exact current-cut differences while preserving authoring. */
import { expect, it } from "vitest";
import { observedDecomposeWrite } from "../../../helpers/store/decompose-batch.js";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import { DecomposeRevisionReportSchema } from "../../../../src/lib/decompose/revision-report.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { runStoreDecomposeFinish } from "../../../../src/lib/decompose/finish.js";
import { createCountingStore } from "../../../helpers/store/counting-store.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { runStoreDecomposeRevisionStarter } from "../../../../src/lib/decompose/revision-starter.js";
import { DecomposeRevisionStarterReportSchema } from "../../../../src/lib/decompose/revision-starter-report.js";
import { sortByCanonicalBytes } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { OwnerIdentitySchema, recordReferences, sameReference, type RecordReference } from "../../../../src/lib/store/identity.js";
import { recordPut, readLifecycleMetaFields, readWorkUnit } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaNextAction, writeMetaDependsOn } from "../../../../src/lib/store/kinds/meta/writers.js";
import { writeCutMapRecord } from "../../../../src/lib/store/kinds/cut-map/index.js";

it("previews only the stored-map replacement for unchanged decisions without writing", async () => {
  const h = await createDecomposeTerminalFixture();
  const stored = lifecycleSuccess(await h.store.read({ reference: h.applied.storedMap }));
  const before = lifecycleSuccess(await h.store.version());
  const result = await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" });
  expect(result.status).toBe("ok");
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect(DecomposeRevisionReportSchema.parse(result.result)).toMatchObject({ kind: "preview", mode: "revise", removals: [],
    members: ["member-a", "member-b"], writes: [{ action: "put", reference: stored.reference, expected: stored.version,
      content: writeCutMapRecord(storedCutMapFixture(h.map)) }] });
  expect(result.result.kind === "preview" && result.result.writes).toHaveLength(1);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

async function preview(h: Awaited<ReturnType<typeof createDecomposeTerminalFixture>>, map = h.map) {
  const result = await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" });
  expect(result.status).toBe("ok");
  if (result.status === "refused" || result.result.kind !== "preview") throw new Error(JSON.stringify(result));
  return result.result;
}

it("applies matching approval as one versioned revision without unrelated writes", async () => {
  const h = await createDecomposeTerminalFixture();
  const plan = await preview(h);
  const before = structuredClone([...h.store.state.records.entries()]);
  const result = await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" }, { applyAuthority: plan.applyAuthority });
  expect(result).toMatchObject({ status: "ok", result: { kind: "revised", origin: h.map.machine.origin, members: ["member-a", "member-b"], removals: [] } });
  const history = lifecycleSuccess(await h.store.history({ reference: h.applied.storedMap }));
  expect(history[0]).toMatchObject({ content: writeCutMapRecord(storedCutMapFixture(h.map)), provenance: { verb: "decompose", lifecycleAction: "revise" } });
  const otherRecords = (entries: typeof before) => entries.filter(([, record]) => record.reference.kind !== "work-item/cut-map");
  expect(otherRecords([...h.store.state.records.entries()])).toEqual(otherRecords(before));
});

it("refuses stale approval and admits a fresh preview without changing the concurrent instruction", async () => {
  const h = await createDecomposeTerminalFixture();
  const plan = await preview(h);
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  await h.handEdit(member, writeMetaNextAction(member.content, "Keep the author's instruction."));
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" }, { applyAuthority: plan.applyAuthority }))
    .toMatchObject({ status: "refused", reason: "stale-apply-authority", remedy: { argv: ["arc", "decompose", "origin", "--revise", "revised.json"] } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const fresh = await preview(h);
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" }, { applyAuthority: fresh.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
  expect(lifecycleSuccess(await readWorkUnit(h.store, "member-a")).content).toContain("Keep the author's instruction.");
});

it("revises each physical difference in one batch while preserving authored content and an unseeded edge", async () => {
  const h = await createDecomposeTerminalFixture();
  await h.seedStub("unseeded");
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  await h.handEdit(member, writeMetaNextAction(writeMetaDependsOn(member.content, ["member-b", "unseeded"]), "Keep authored metadata."));
  const authored = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/draft"](member.reference.owner) }));
  await h.handEdit(authored, authored.content.replace("Owned work.", "Authored member scope."));
  const removed = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  const notes = await h.seed(recordReferences["work-item/notes"](removed.reference.owner), "# Member notes\n\nRemove this whole group.\n");
  const map = structuredClone(h.map);
  const changed = map.authoring.destinations[1];
  if (changed?.kind !== "new-member") throw new Error("Expected member.");
  changed.slug = "member-c";
  map.authoring.internalEdges = [{ from: "member-a", to: "member-c" }];
  map.authoring.placement = { kind: "cohort", cohort: "new-group", purpose: "Coordinate the revised work." };
  const plan = await preview(h, map);
  for (const name of ["member-a", "member-b", "member-c", "group", "new-group", "origin"]) {
    expect(plan.writes.some(write => write.reference.owner.name === name)).toBe(true);
  }
  expect(plan.removals).toContainEqual(notes.reference);
  const beforeApply = lifecycleSuccess(await h.store.version());
  const result = await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }, { applyAuthority: plan.applyAuthority });
  const changes = lifecycleSuccess(await h.store.changes({ from: beforeApply, to: lifecycleSuccess(await h.store.version()) }));
  const normalized = (reference: RecordReference, content: string | null) => ({ kind: reference.kind, owner: reference.owner.name, key: reference.key ?? null, content });
  expect(sortByCanonicalBytes(changes.map(change => normalized(change.reference, change.content))))
    .toEqual(sortByCanonicalBytes(plan.writes.map(write => normalized(write.reference, write.action === "put" ? write.content : null))));
  expect(plan.writes).toHaveLength(9);
  expect(result).toMatchObject({ status: "ok", result: { kind: "revised", members: ["member-a", "member-c"] } });
  const after = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  expect(lifecycleSuccess(readLifecycleMetaFields(after))).toMatchObject({ dependsOn: ["unseeded", "member-c"], cohort: "new-group",
    nextAction: "Keep authored metadata." });
  expect(lifecycleSuccess(await h.store.read({ reference: authored.reference })).content).toContain("Authored member scope.");
  expect(lifecycleSuccess(await readWorkUnit(h.store, "member-c"))).toMatchObject({ placement: { kind: "backlog", commitment: "planned" } });
  expect(lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/draft"](lifecycleSuccess(await readWorkUnit(h.store, "member-c")).reference.owner) })).content)
    .toContain("Owned work.");
  for (const reference of [removed.reference, notes.reference, h.applied.cohorts[0]?.reference]) {
    if (reference === undefined) throw new Error("Expected cohort.");
    expect(await h.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }
  const batches = new Set<string>();
  for (const write of plan.writes) {
    const entry = lifecycleSuccess(await h.store.history({ reference: write.reference }))[0];
    expect(entry?.provenance).toMatchObject({ verb: "decompose", lifecycleAction: "revise" });
    if (entry !== undefined && "verb" in entry.provenance && entry.provenance.batchId !== undefined) batches.add(entry.provenance.batchId);
  }
  expect(batches.size).toBe(1);
  const stored = lifecycleSuccess(await h.store.read({ reference: h.applied.storedMap }));
  const planned = plan.writes.find(write => write.reference.kind === "work-item/cut-map");
  expect(planned?.action === "put" && planned.content).toBe(stored.content);
  expect(JSON.parse(stored.content).map).toEqual(map);
});

it("drops a gone member without touching an unrelated generation that reused its slug", async () => {
  const h = await createDecomposeTerminalFixture();
  await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "member-a")));
  const unrelated = await h.seedStub("member-a");
  const map = structuredClone(h.map);
  const changed = map.authoring.destinations[0];
  if (changed?.kind !== "new-member") throw new Error("Expected member.");
  changed.slug = "member-c";
  map.authoring.internalEdges = [{ from: "member-c", to: "member-b" }];
  for (const allocation of map.authoring.sourceAllocations) if (allocation.disposition.kind === "target")
    allocation.disposition.targetLocator.artifact = "draft-member-c.md";
  for (const disposition of map.authoring.incomingDispositions) if (disposition.disposition.kind === "replace")
    disposition.disposition.replacementTargets = ["member-c"];
  const plan = await preview(h, map);
  expect(plan.writes.some(write => write.reference.owner.name === "member-a")).toBe(false);
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }, { applyAuthority: plan.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
  expect(lifecycleSuccess(await readWorkUnit(h.store, "member-a"))).toEqual(unrelated);
});

it("keeps a retained seed's current alias when its provider's fresh machine name changes", async () => {
  const h = await createDecomposeTerminalFixture({ provider: true });
  expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: h.ctx.executor.exec, baseBranch: "main" },
    { sourceSlug: "provider", targetSlug: "upstream" })).toMatchObject({ status: "renamed" });
  const current = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  const member = await h.handEdit(current, writeMetaDependsOn(current.content, ["provider"]));
  const refreshed = await runStoreDecomposeRevisionStarter(h.ctx, "origin");
  expect(refreshed.status).toBe("ok");
  if (refreshed.status === "refused") throw new Error(JSON.stringify(refreshed));
  const report = DecomposeRevisionStarterReportSchema.parse(JSON.parse(refreshed.result));
  if (report.status !== "carried") throw new Error(JSON.stringify(report));
  const plan = await preview(h, report.map);
  expect(plan.writes.some(write => sameReference(write.reference, member.reference))).toBe(false);
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: report.map, cutMapPath: "revised.json" }, { applyAuthority: plan.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
  expect(lifecycleSuccess(await readWorkUnit(h.store, "member-b"))).toEqual(member);
});

async function measureRevision(scaled: boolean) {
  const h = await createDecomposeTerminalFixture();
  const members = await Promise.all(["member-a", "member-b"].map(async slug => lifecycleSuccess(await readWorkUnit(h.store, slug))));
  if (scaled) {
    for (let index = 0; index < 60; index++) await h.seedStub(`unrelated-${index}`);
    for (const reference of [h.applied.storedMap, ...members.map(member => member.reference)]) {
      for (let index = 0; index < 12; index++) {
        const record = lifecycleSuccess(await h.store.read({ reference }));
        lifecycleSuccess(await observedDecomposeWrite(h.store, { ...recordPut(record), provenance: reference.kind === "work-item/cut-map"
          ? { verb: "decompose", lifecycleAction: "revise" } : { verb: "write-back", lifecycleAction: "edit" } }));
      }
    }
  }
  const counted = createCountingStore(h.store);
  h.ctx.executor.store = counted.store;
  const summarize = () => JSON.stringify(counted.observations(), (key, value: unknown) => key === "uid" ? "<uid>" : value);
  const histories = () => {
    for (const reference of [h.applied.storedMap, ...members.map(member => member.reference)])
      expect(counted.count({ operation: "history", input: { reference } })).toBe(reference.kind === "work-item/cut-map" ? 1 : 0);
  };
  const plan = await preview(h);
  histories();
  const preparation = summarize();
  counted.reset();
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" }, { applyAuthority: plan.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
  histories();
  return { preparation, application: summarize() };
}

it("reads birth histories once per preview and apply with flat observations as stored histories and unrelated work grow", async () => {
  expect(await measureRevision(true)).toEqual(await measureRevision(false));
}, 30_000);

it("moves a retained member's seed even while it holds its own cut, which must then rebind", async () => {
  const h = await createDecomposeTerminalFixture();
  const fresh = await prepareDecomposePreflight(h.ctx, "member-a");
  expect(fresh.status).toBe("ok");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const inner = completeCutMapFixture(fresh.result.machine);
  const first = inner.authoring.destinations[0], second = inner.authoring.destinations[1];
  if (first?.kind !== "new-member" || second?.kind !== "new-member") throw new Error("Expected inner members.");
  first.slug = "inner-left";
  second.slug = "inner-right";
  for (const allocation of inner.authoring.sourceAllocations) if (allocation.disposition.kind === "target")
    allocation.disposition.targetLocator.artifact = "draft-inner-left.md";
  inner.authoring.internalEdges = [{ from: "inner-left", to: "inner-right" }];
  for (const outgoing of inner.authoring.outgoingDispositions) outgoing.disposition = { kind: "targets", targets: ["inner-right"] };
  inner.authoring.placement = { kind: "cohort", cohort: "inner-group", purpose: "Coordinate the inner cut." };
  expect(await runStoreDecomposeAdditive(h.ctx, "member-a", "execute", { cutMap: inner, cutMapPath: "inner.json" })).toMatchObject({ status: "ok" });
  const map = structuredClone(h.map);
  map.authoring.internalEdges = [];
  const plan = await preview(h, map);
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }, { applyAuthority: plan.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
  expect(lifecycleSuccess(readLifecycleMetaFields(lifecycleSuccess(await readWorkUnit(h.store, "member-a"))))).toMatchObject({ dependsOn: [] });
  expect(await runStoreDecomposeFinish(h.ctx, "member-a")).toMatchObject({ status: "refused", reason: "stale-machine",
    remedy: { argv: ["arc", "decompose", "member-a", "--revise"] } });
});

it("removes the complete retired-provider disposition from a retained seed while preserving an unrelated edge", async () => {
  const h = await createDecomposeTerminalFixture({ provider: true });
  const replacement = await h.seedStub("upstream");
  await h.seedStub("unseeded");
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  const ref = (reference: RecordReference) => {
    const owner = reference.owner;
    if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected generated identity.");
    return { name: owner.name, uid: owner.uid };
  };
  await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "provider")), { kind: "decompose", successors: [ref(replacement.reference)],
    incoming: [{ dependent: ref(member.reference), disposition: { kind: "replace", replacementTargets: [ref(replacement.reference)] } }] });
  await h.handEdit(member, writeMetaDependsOn(member.content, ["upstream", "unseeded"]));
  const raw = await runStoreDecomposeRevisionStarter(h.ctx, "origin");
  expect(raw.status).toBe("ok");
  if (raw.status === "refused") throw new Error(JSON.stringify(raw));
  const report = DecomposeRevisionStarterReportSchema.parse(JSON.parse(raw.result));
  const map = completeCutMapFixture(report.status === "carried" ? report.map.machine : report.starter.machine);
  for (const edge of map.authoring.outgoingDispositions) edge.disposition = { kind: "drop", reason: "Do not retain this seeded provider." };
  const plan = await preview(h, map);
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }, { applyAuthority: plan.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
  expect(lifecycleSuccess(readLifecycleMetaFields(lifecycleSuccess(await readWorkUnit(h.store, "member-b")))).dependsOn).toEqual(["unseeded"]);
});

it("names additive entry points when neither revision form has a stored map", async () => {
  const h = await createDecomposeOriginFixture();
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const before = lifecycleSuccess(await h.store.version());
  const results = [await runStoreDecomposeRevisionStarter(h.ctx, "origin"), await runStoreDecomposeRevision(h.ctx, "origin", {
    cutMap: completeCutMapFixture(fresh.result.machine), cutMapPath: "revised.json" })];
  for (const result of results) expect(result).toMatchObject({ status: "refused", reason: "no-stored-map",
    remedy: { text: expect.stringContaining("--execute <cut-map> or --extract <cut-map>") } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("retains the cut-created parent across child creation and later removes only the revision-created child", async () => {
  const h = await createDecomposeTerminalFixture();
  const parent = h.applied.cohorts[0];
  if (parent === undefined) throw new Error("Expected parent cohort.");
  const original = lifecycleSuccess(await h.store.read({ reference: parent.reference }));
  const nested = structuredClone(h.map);
  nested.authoring.placement = { kind: "subcohort", cohort: "group/child", purpose: "Coordinate the child cut.", parentPurpose: "Coordinate the work." };
  const first = await preview(h, nested);
  expect(first.writes.some(write => sameReference(write.reference, original.reference))).toBe(false);
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: nested, cutMapPath: "revised.json" }, { applyAuthority: first.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
  const child = lifecycleSuccess(await h.store.read({ reference: recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "child" })) }));
  const second = await preview(h, h.map);
  expect(second.removals).toContainEqual(child.reference);
  expect(second.removals).not.toContainEqual(original.reference);
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" }, { applyAuthority: second.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
  expect(lifecycleSuccess(await h.store.read({ reference: original.reference }))).toEqual(original);
  expect(await h.store.read({ reference: child.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
});
