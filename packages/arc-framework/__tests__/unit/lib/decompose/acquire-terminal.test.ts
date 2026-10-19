/** Stored-cut acquisition preserves current generation and record-version boundaries. */
import { expect, it } from "vitest";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { acquireDecomposeTerminal } from "../../../../src/lib/decompose/acquire-terminal.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
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
import { planDecomposeMembers } from "../../../../src/lib/decompose/member-scaffold.js";

async function landedFixture(withHome = false) {
  const h = await createDecomposeOriginFixture();
  const dependent = await h.seedStub("consumer");
  await h.handEdit(dependent, writeMetaDependsOn(dependent.content, ["origin"]));
  if (withHome) {
    const home = await h.seedStub("home");
    await h.handEdit(home, writeMetaDependsOn(home.content, ["origin"]));
    await h.seed(recordReferences["work-item/draft"](home.reference.owner), "# Home\n\n## Existing\n\nAuthored content.\n");
  }
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine);
  if (withHome) {
    map.authoring.shape = "heterogeneous";
    map.authoring.destinations.push({ kind: "existing-home", destinationId: "z-home", target: { kind: "work-unit", slug: "home" } });
    const allocation = map.authoring.sourceAllocations[0];
    if (allocation?.disposition.kind !== "target") throw new Error("Expected source allocation.");
    allocation.disposition.destinationId = "z-home";
    allocation.disposition.targetLocator.artifact = "draft-home.md";
  }
  const applied = await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: map, cutMapPath: "cut.json" });
  if (applied.status === "refused") throw new Error(JSON.stringify(applied));
  return { ...h, map, applied: applied.result };
}

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

it("limits membership to the current incarnation when the stored map is recreated", async () => {
  const h = await landedFixture();
  const map = lifecycleSuccess(await h.store.read({ reference: h.applied.report.storedMap }));
  // Checked machine-record recreation isolates the history boundary; the members keep their earlier birth histories.
  lifecycleSuccess(await h.store.write({ action: "remove", reference: map.reference, expected: map.version,
    provenance: { verb: "decompose", lifecycleAction: "discard" } }));
  lifecycleSuccess(await h.store.write({ action: "put", reference: map.reference, expected: null, content: map.content,
    provenance: { verb: "decompose", lifecycleAction: "additive" } }));
  const result = await acquireDecomposeTerminal(h.ctx, "origin");
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect(result.result.members.map(member => member.primary)).toEqual([null, null]);
  expect(result.result.acquired.incomingCandidates.map(entry => entry.reference.owner.name)).toEqual(expect.arrayContaining(["member-a", "member-b"]));
});

it.each(["map", "member"] as const)("admits no member without a batch ID in its %s history", async missing => {
  const h = await landedFixture();
  const store = new Proxy(h.store, { get(target, property) {
    if (property === "history") return async (input: { reference: RecordReference }) => {
      const history = await target.history(input);
      const selected = missing === "map" ? input.reference.kind === "work-item/cut-map" : input.reference.kind === "work-item/meta";
      if (history.status === "refused" || !selected) return history;
      // Imported history is a supported store representation without a backend batch identifier.
      return { ...history, result: history.result.map(entry => ({ ...entry, provenance: { message: "Imported decomposition history" } })) };
    };
    const value: unknown = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const result = await acquireDecomposeTerminal({ ...h.ctx, executor: { ...h.ctx.executor, store } }, "origin");
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect(result.result.members.map(member => member.primary)).toEqual([null, null]);
  const repaired = await acquireDecomposeTerminal(h.ctx, "origin");
  if (repaired.status === "refused") throw new Error(JSON.stringify(repaired));
  expect(repaired.result.members.every(member => member.primary !== null)).toBe(true);
});

it("admits a member created with the map update in a revision batch", async () => {
  const h = await landedFixture();
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
  // Compose the revision's production scaffold and field writers in one checked store batch.
  lifecycleSuccess(await h.store.batch({ provenance: { verb: "decompose", lifecycleAction: "revise" }, writes: [
    ...scaffolds.result.writes.filter(write => write.reference.owner.name === "member-c"),
    recordPut(second, { content: writeMetaDependsOn(second.content, ["member-c"]) }),
    recordPut(storedMap, { content: JSON.stringify(h.map) }),
  ] }));
  const store = oncePerRecord(h.store);
  const current = await acquireDecomposeTerminal({ ...h.ctx, executor: { ...h.ctx.executor, store } }, "origin");
  if (current.status === "refused") throw new Error(JSON.stringify(current));
  expect(current.result.members.map(member => member.primary?.reference.owner.name)).toEqual(["member-a", "member-b", "member-c"]);
  expect(current.result.acquired.incomingCandidates.map(entry => entry.reference.owner.name)).not.toContain("member-c");
});

it.each(["abandoned", "shipped"] as const)("refuses a home %s after scaffolding and acquires a revised open target", async outcome => {
  const h = await landedFixture(true);
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
  const map = lifecycleSuccess(await h.store.read({ reference: h.applied.report.storedMap }));
  lifecycleSuccess(await h.store.write({ ...recordPut(map, { content: JSON.stringify(h.map) }),
    provenance: { verb: "decompose", lifecycleAction: "revise" } }));
  const store = oncePerRecord(h.store);
  const repaired = await acquireDecomposeTerminal({ ...h.ctx, executor: { ...h.ctx.executor, store } }, "origin");
  if (repaired.status === "refused") throw new Error(JSON.stringify(repaired));
  expect(repaired.result.homes).toMatchObject([{ primary: replacement, records: expect.arrayContaining([replacement, draft]) }]);
  expect(repaired.result.records).toEqual(expect.arrayContaining([replacement, draft]));
});

it("leaves a replacement generation out of the cut and includes its real incoming edge", async () => {
  const h = await landedFixture();
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
  const h = await landedFixture();
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
  const h = await landedFixture();
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
