/** Stored-cut acquisition preserves current generation and record-version boundaries. */
import { expect, it } from "vitest";
import { observedDecomposeWrite, observedDecomposeBatch } from "../../../helpers/store/decompose-batch.js";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { acquireDecomposeTerminal } from "../../../../src/lib/decompose/acquire-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { writeMetaDependsOn } from "../../../../src/lib/store/kinds/meta/writers.js";
import { sameReference, recordReferences } from "../../../../src/lib/store/identity.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { RecordReference } from "../../../../src/lib/store/identity.js";
import { revalidateLifecycleRecords } from "../../../../src/lib/work-unit/prepared-lifecycle-write.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { renderMetaFile } from "../../../../src/lib/store/kinds/meta/writers.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../../src/lib/kernel/index.js";
import { acquireDecomposeOrigin } from "../../../../src/lib/decompose/acquire-origin.js";
import { acquireDecomposeDependencyFacts } from "../../../../src/lib/decompose/dependency-facts.js";
import { projectDecomposeDependencies } from "../../../../src/lib/decompose/dependency-projection.js";
import { planDecomposeTopology } from "../../../../src/lib/decompose/topology.js";
import { deriveDecomposeMachine } from "../../../../src/lib/decompose/machine-facts.js";
import { planDecomposeMembers } from "../../../../src/lib/decompose/member-scaffold.js";
import { prepareDecomposeStoredMap } from "../../../../src/lib/decompose/owner-birth-bindings.js";
import { writeCutMapRecord, decodeCutMapContent } from "../../../../src/lib/store/kinds/cut-map/index.js";
import { runStoreDecomposeDiscard } from "../../../../src/lib/decompose/discard.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";

// A second read of one generation is an acquisition failure, rather than an assertion on spy arguments.
function oncePerRecord(store: Store): Store {
  const read: RecordReference[] = [], histories: RecordReference[] = [];
  return new Proxy(store, { get(target, property) {
    if (property === "read" || property === "history") return async (input: { reference: RecordReference }) => {
      const prior = property === "read" ? read : histories;
      if (prior.some(reference => sameReference(reference, input.reference))) throw new Error(`Repeated ${property} for ${input.reference.kind}:${input.reference.owner.name}`);
      prior.push(input.reference);
      return target[property](input);
    };
    const value: unknown = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

it("names the additive modes when no stored cut exists", async () => {
  const h = await createDecomposeOriginFixture();
  const result = await acquireDecomposeTerminal(h.ctx, "origin");
  expect(result).toMatchObject({ status: "refused", reason: "no-stored-map", class: "recoverable" });
  expect(result.status === "refused" && result.remedy.text).toMatch(/--execute.*--extract/u);
});

it("refuses recreation under old keys and authenticates fresh bindings after a complete cut recreation", async () => {
  const h = await createDecomposeTerminalFixture();
  const map = lifecycleSuccess(await h.store.read({ reference: h.applied.report.storedMap }));
  const original = await acquireDecomposeTerminal(h.ctx, "origin");
  if (original.status === "refused") throw new Error(JSON.stringify(original));
  const preview = await runStoreDecomposeDiscard(h.ctx, "origin");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  expect(await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority })).toMatchObject({ status: "ok" });
  const before = lifecycleSuccess(await h.store.version());
  expect(await observedDecomposeWrite(h.store, { action: "put", reference: map.reference, expected: null, content: map.content,
    provenance: { verb: "decompose", lifecycleAction: "additive" } })).toMatchObject({ status: "refused", refusal: { rule: "cut-map.atomic-binding" } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: h.map, cutMapPath: "cut.json" })).toMatchObject({ status: "ok" });
  const result = await acquireDecomposeTerminal(h.ctx, "origin");
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect(result.result.members.every(member => member.primary !== null)).toBe(true);
  expect(result.result.members.map(member => member.uid)).not.toEqual(original.result.members.map(member => member.uid));
  expect(result.result.storedCut.ownerBirths).not.toEqual(original.result.storedCut.ownerBirths);
});

it.each(["map", "member"] as const)("uses batch-bound map receipts rather than %s primary-history assumptions", async missing => {
  const h = await createDecomposeTerminalFixture();
  const store = new Proxy(h.store, { get(target, property) {
    if (property === "history") return async (input: { reference: RecordReference }) => {
      const history = await target.history(input);
      const selected = missing === "map" ? input.reference.kind === "work-item/cut-map" : input.reference.kind === "work-item/meta";
      if (history.status === "refused" || !selected) return history;
      return { ...history, result: history.result.map(entry => ({ ...entry, provenance: { message: "Imported decomposition history" } })) };
    };
    const value: unknown = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const result = await acquireDecomposeTerminal({ ...h.ctx, executor: { ...h.ctx.executor, store } }, "origin");
  if (missing === "map") expect(result).toMatchObject({ status: "refused", reason: "store", class: "terminal",
    storeRefusal: { code: "namespace-corrupt" } });
  else {
    if (result.status === "refused") throw new Error(JSON.stringify(result));
    expect(result.result.members.every(member => member.primary !== null)).toBe(true);
  }
  const repaired = await acquireDecomposeTerminal(h.ctx, "origin");
  if (repaired.status === "refused") throw new Error(JSON.stringify(repaired));
  expect(repaired.result.members.every(member => member.primary !== null)).toBe(true);
});

it("admits a member created with the map update in a revision batch", async () => {
  const h = await createDecomposeTerminalFixture();
  const previous = await acquireDecomposeTerminal(h.ctx, "origin");
  if (previous.status === "refused") throw new Error(JSON.stringify(previous));
  h.map.authoring.destinations.push({ kind: "new-member", destinationId: "member-c", slug: "member-c", workClass: "Light" });
  h.map.authoring.internalEdges.push({ from: "member-b", to: "member-c" });
  const origin = await acquireDecomposeOrigin(h.ctx, "origin");
  if (origin.status === "refused") throw new Error(JSON.stringify(origin));
  const facts = await acquireDecomposeDependencyFacts(h.ctx, h.map, origin.result, []);
  if (facts.status === "refused") throw new Error(JSON.stringify(facts));
  const dependencies = projectDecomposeDependencies(h.map, facts.result);
  const topology = planDecomposeTopology(h.map, { cohorts: previous.result.cohorts, newCohorts: [] });
  if (dependencies.status === "refused" || topology.status === "refused") throw new Error("Invalid revision fixture.");
  const scaffolds = planDecomposeMembers(h.ctx, h.map, origin.result, topology.result, dependencies.result);
  if (scaffolds.status === "refused") throw new Error(JSON.stringify(scaffolds));
  const second = previous.result.members[1]?.primary;
  const storedMap = previous.result.acquired.storedMap;
  if (second === null || second === undefined || storedMap === undefined) throw new Error("Expected prior cut records.");
  const stored = await prepareDecomposeStoredMap(h.store, storedMap.reference, h.map, scaffolds.result.writes, previous.result.storedCut);
  if (stored.status === "refused") throw new Error(JSON.stringify(stored));
  // Compose the revision's production scaffold and field writers in one checked store batch.
  lifecycleSuccess(await observedDecomposeBatch(h.store, { provenance: { verb: "decompose", lifecycleAction: "revise" }, writes: [
    ...scaffolds.result.writes.filter(write => write.reference.owner.name === "member-c"),
    recordPut(second, { content: writeMetaDependsOn(second.content, ["member-c"]) }),
    recordPut(storedMap, { content: writeCutMapRecord(stored.result) }),
  ] }));
  const store = oncePerRecord(h.store);
  const current = await acquireDecomposeTerminal({ ...h.ctx, executor: { ...h.ctx.executor, store } }, "origin");
  if (current.status === "refused") throw new Error(JSON.stringify(current));
  expect(current.result.members.map(member => member.primary?.reference.owner.name)).toEqual(["member-a", "member-b", "member-c"]);
  expect(current.result.acquired.incomingCandidates.map(entry => entry.reference.owner.name)).not.toContain("member-c");
});

it.each(["abandoned", "shipped"] as const)("refuses a home %s after scaffolding and acquires a revised open target", async outcome => {
  const h = await createDecomposeTerminalFixture({ withHome: true });
  const home = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("home") }));
  const primary = lifecycleSuccess(await h.store.read({ reference: home.reference }));
  if (outcome === "abandoned") await h.seedRetiredWorkUnit(primary);
  else lifecycleSuccess(await h.store.write({ ...recordPut(primary, { content: renderMetaFile("home", {
    state: "Shipped", owner: "test-user", workClass: "Light", currentWorkflow: null,
    completed: "2026-10-19", prUrl: "https://example.test/pull/1" }),
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }),
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  const before = lifecycleSuccess(await h.store.version());
  expect(await acquireDecomposeTerminal(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "existing-home",
    remedy: { argv: ["arc", "decompose", "origin", "--revise"] } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const replacement = await h.seedStub("next-home");
  const draft = await h.seed(recordReferences["work-item/draft"](replacement.reference.owner), "# Next home\n\n## Existing\n\nContinued work.\n");
  const destination = h.map.authoring.destinations.find(item => item.kind === "existing-home");
  if (destination?.kind !== "existing-home" || destination.target.kind === "document") throw new Error("Expected home target.");
  destination.target.slug = "next-home";
  for (const allocation of h.map.authoring.sourceAllocations) {
    if (allocation.disposition.kind === "target" && allocation.disposition.destinationId === destination.destinationId) {
      allocation.disposition.targetLocator.artifact = "draft-next-home.md";
    }
  }
  const origin = await acquireDecomposeOrigin(h.ctx, "origin");
  if (origin.status === "refused") throw new Error(JSON.stringify(origin));
  const fresh = deriveDecomposeMachine(origin.result);
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  h.map.machine = fresh.result;
  h.map.authoring.incomingDispositions = h.map.authoring.incomingDispositions.filter(disposition =>
    h.map.machine.incomingEdges.some(edge => edge.edgeId === disposition.edgeId));
  const map = lifecycleSuccess(await h.store.read({ reference: h.applied.report.storedMap }));
  const stored = decodeCutMapContent(map.content);
  if (!stored.success) throw new Error(stored.error);
  lifecycleSuccess(await observedDecomposeWrite(h.store, { ...recordPut(map, { content: writeCutMapRecord({ ...stored.data, map: h.map }) }),
    provenance: { verb: "decompose", lifecycleAction: "revise" } }));
  const store = oncePerRecord(h.store);
  const repaired = await acquireDecomposeTerminal({ ...h.ctx, executor: { ...h.ctx.executor, store } }, "origin");
  if (repaired.status === "refused") throw new Error(JSON.stringify(repaired));
  expect(repaired.result.homes).toMatchObject([{ primary: replacement, records: expect.arrayContaining([replacement, draft]) }]);
  expect(repaired.result.records).toEqual(expect.arrayContaining([replacement, draft]));
});

it("leaves a replacement generation out of the cut and includes its real incoming edge", async () => {
  const h = await createDecomposeTerminalFixture();
  const member = lifecycleSuccess(await h.store.read({ reference: h.applied.report.members[0]!.meta }));
  await h.seedRetiredWorkUnit(member);
  const replacement = await h.seedStub("member-a");
  await h.handEdit(replacement, writeMetaDependsOn(replacement.content, ["origin"]));
  const before = lifecycleSuccess(await h.store.version());
  const result = await acquireDecomposeTerminal(h.ctx, "origin");
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect(result.result.members[0]?.primary).toBeNull();
  expect(result.result.acquired.incomingCandidates.map(entry => entry.reference)).toContainEqual(replacement.reference);
  expect(result.result.dependents.map(record => record.reference)).toContainEqual(replacement.reference);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it("recognizes a sibling only by its own birth name even when it takes another member's slug", async () => {
  const h = await createDecomposeTerminalFixture();
  const first = lifecycleSuccess(await h.store.read({ reference: h.applied.report.members[0]!.meta }));
  await h.seedRetiredWorkUnit(first);
  expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: scriptGitExec([]).exec, baseBranch: "main" },
    { sourceSlug: "member-b", targetSlug: "member-a" })).toMatchObject({ status: "renamed" });
  const store = oncePerRecord(h.store);
  const result = await acquireDecomposeTerminal({ ...h.ctx, executor: { ...h.ctx.executor, store } }, "origin");
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect(result.result.members[0]?.primary).toBeNull();
  expect(result.result.members[1]?.primary?.reference.owner.name).toBe("member-a");
  expect(result.result.members[1]?.primary?.reference.owner).toMatchObject({ uid: h.applied.report.members[1]!.meta.owner.type === "work-item" ? h.applied.report.members[1]!.meta.owner.uid : undefined });
  expect(result.result.acquired.incomingCandidates.map(entry => entry.reference.owner.name)).not.toContain("member-a");
});

it("acquires the landed cut once per record and retains guards that reject later edits", async () => {
  const h = await createDecomposeTerminalFixture();
  const store = oncePerRecord(h.store);
  const result = await acquireDecomposeTerminal({ ...h.ctx, executor: { ...h.ctx.executor, store } }, "origin");
  expect(result.status).toBe("ok");
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect(result.result.map).toEqual(h.map);
  expect(result.result.acquired.storedMap?.reference).toEqual(h.applied.report.storedMap);
  expect(result.result.members.map(member => member.primary?.reference.owner.name)).toEqual(["member-a", "member-b"]);
  expect(result.result.cohorts.map(cohort => cohort.path)).toEqual(["group"]);
  expect(result.result.dependents.map(record => record.reference.owner.name)).toEqual(["consumer"]);
  const member = result.result.members[0]?.primary;
  if (member === undefined || member === null) throw new Error("Expected an acquired member.");
  expect(result.result.records).toContainEqual(member);
  const changed = await h.handEdit(member, `${member.content}\nAuthored during preview.\n`);
  expect(await revalidateLifecycleRecords(h.store, result.result.records)).toMatchObject({ status: "refused", refusal: { code: "version-conflict", records: [changed.reference] } });
  const current = await acquireDecomposeTerminal(h.ctx, "origin");
  if (current.status === "refused") throw new Error(JSON.stringify(current));
  expect(await revalidateLifecycleRecords(h.store, current.result.records)).toEqual({ status: "ok", result: true });
  expect(lifecycleSuccess(await h.store.read({ reference: member.reference })).content).toContain("Authored during preview.");
});
