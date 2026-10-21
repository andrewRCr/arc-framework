/** Discard previews and exact atomic removal of an authenticated cut. */
import { expect, it } from "vitest";
import { observedDecomposeWrite } from "../../../helpers/store/decompose-batch.js";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStoreDecomposeDiscard } from "../../../../src/lib/decompose/discard.js";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { withCompetingBatch } from "../../../helpers/store/decompose-harness.js";
import { createCountingStore } from "../../../helpers/store/counting-store.js";
import { readWorkUnit, recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaPriority, writeMetaNextAction } from "../../../../src/lib/store/kinds/meta/writers.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { createMemoryRemote } from "../../../helpers/store/sync.js";
import { ReferenceBackend } from "../../../helpers/store/reference-backend.js";
import { sortByCanonicalBytes } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { recordReferences, OwnerIdentitySchema } from "../../../../src/lib/store/identity.js";

it("previews whole member groups and leaves existing homes and coordination edited without writing", async () => {
  const h = await createDecomposeTerminalFixture({ withHome: true, atCap: true, authorMap: map => {
    map.authoring.destinations.push({ kind: "cohort-coordination", destinationId: "zz-coordination", cohort: "group/child" });
    const allocation = map.authoring.sourceAllocations[1];
    if (allocation === undefined) throw new Error("Missing allocation.");
    allocation.ownership = "cohort-shared";
    allocation.disposition = { kind: "target", destinationId: "zz-coordination", targetLocator: {
      kind: "section", artifact: "cohort-child.md", level: 2, ancestry: [], headingSource: "Coordination", occurrence: 0 } };
  } });
  const home = lifecycleSuccess(await readWorkUnit(h.store, "home"));
  const homeDraft = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/draft"](home.reference.owner) }));
  const child = lifecycleSuccess(await h.store.read({ reference: recordReferences["cohort/document"](
    OwnerIdentitySchema.parse({ type: "cohort", name: "child" })) }));
  const preserved = [await h.handEdit(homeDraft, `${homeDraft.content}\nAuthored home addition.\n`),
    await h.handEdit(child, `${child.content}\n## Coordination\n\nAuthored coordination.\n`),
    lifecycleSuccess(await readWorkUnit(h.store, "origin")), home];
  const before = lifecycleSuccess(await h.store.version());
  const result = await runStoreDecomposeDiscard(h.ctx, "origin");
  expect(result).toMatchObject({ status: "ok", result: { kind: "preview", mode: "discard",
    origin: h.map.machine.origin, applyAuthority: expect.stringMatching(/^sha256:/u),
    leftEdited: h.map.authoring.destinations.filter(destination => destination.kind !== "new-member") } });
  if (result.status === "refused" || result.result.kind !== "preview") throw new Error(JSON.stringify(result));
  expect(result.result.writes.map(write => `${write.reference.owner.name}:${write.reference.kind}`).sort()).toEqual([
    "member-a:work-item/draft", "member-a:work-item/meta", "member-b:work-item/draft", "member-b:work-item/meta", "origin:work-item/cut-map",
  ]);
  expect(result.result.writes.every(write => write.action === "remove")).toBe(true);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect((await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: result.result.applyAuthority })).status).toBe("ok");
  for (const record of preserved) expect(lifecycleSuccess(await h.store.read({ reference: record.reference }))).toEqual(record);
});

async function preview(h: Awaited<ReturnType<typeof createDecomposeTerminalFixture>>) {
  const result = await runStoreDecomposeDiscard(h.ctx, "origin");
  if (result.status === "refused" || result.result.kind !== "preview") throw new Error(JSON.stringify(result));
  return result.result;
}

it("applies exactly the approved removals in one batch and retains only their history", async () => {
  const h = await createDecomposeTerminalFixture();
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  const notes = await h.seed(recordReferences["work-item/notes"](member.reference.owner), "# Notes\n\nAuthoring decisions.\n");
  const plan = await preview(h);
  expect(plan.removals).toContainEqual(notes.reference);
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: plan.applyAuthority }))
    .toEqual({ status: "ok", result: { kind: "discarded", origin: plan.origin, removals: plan.removals, leftEdited: [] } });
  const changes = lifecycleSuccess(await h.store.changes({ from: before, to: lifecycleSuccess(await h.store.version()) }));
  expect(sortByCanonicalBytes(changes.map(change => change.reference))).toEqual(plan.removals);
  expect(new Set(changes.map(change => "verb" in change.provenance ? change.provenance.batchId : undefined)).size).toBe(1);
  for (const reference of plan.removals) {
    expect(await h.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const history = lifecycleSuccess(await h.store.history({ reference }));
    expect(history[0]).toMatchObject({ version: null, content: null, provenance: { verb: "decompose", lifecycleAction: "discard" } });
    expect(history.at(-1)?.version).not.toBeNull();
  }
  for (const slug of ["origin", "consumer"]) expect((await readWorkUnit(h.store, slug)).status).toBe("ok");
  expect(changes.every(change => !change.reference.kind.startsWith("lineage/"))).toBe(true);
});

it("removes a new child cohort while preserving its existing parent and sibling", async () => {
  const h = await createDecomposeTerminalFixture({ atCap: true, authorMap: map => {
    map.authoring.placement = { kind: "subcohort", cohort: "group/new-child", purpose: "Coordinate the new work." };
  } });
  const plan = await preview(h);
  expect(plan.removals.filter(reference => reference.kind === "cohort/document").map(reference => reference.owner.name))
    .toEqual(["new-child"]);
  expect((await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: plan.applyAuthority })).status).toBe("ok");
  for (const name of ["group", "child"]) expect((await h.store.read({ reference: recordReferences["cohort/document"](
    OwnerIdentitySchema.parse({ type: "cohort", name })) })).status).toBe("ok");
});

it("requires fresh discard approval after member grooming and succeeds with the new authority", async () => {
  const h = await createDecomposeTerminalFixture();
  const prior = await preview(h);
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  await h.handEdit(member, writeMetaPriority(member.content, "P2"));
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: prior.applyAuthority }))
    .toMatchObject({ status: "refused", reason: "stale-apply-authority",
      remedy: { argv: ["arc", "decompose", "origin", "--discard"], text: expect.stringMatching(/fresh.*preview.*approv/iu) } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const fresh = await preview(h);
  expect(fresh.applyAuthority).not.toBe(prior.applyAuthority);
  expect((await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: fresh.applyAuthority })).status).toBe("ok");
});

it("preserves only the competing write on a discard batch conflict and permits fresh approval", async () => {
  const h = await createDecomposeTerminalFixture();
  const plan = await preview(h);
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  h.ctx.executor.store = withCompetingBatch(h.store, async () => { await h.handEdit(member, writeMetaPriority(member.content, "P2")); });
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: plan.applyAuthority }))
    .toMatchObject({ status: "refused", reason: "version-conflict",
      remedy: { argv: ["arc", "decompose", "origin", "--discard"], text: expect.stringMatching(/fresh.*preview.*approv/iu) } });
  const changes = lifecycleSuccess(await h.store.changes({ from: before, to: lifecycleSuccess(await h.store.version()) }));
  expect(changes).toHaveLength(1);
  expect(changes[0]?.reference).toEqual(member.reference);
  const fresh = await preview(h);
  expect((await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: fresh.applyAuthority })).status).toBe("ok");
});

it("removes a renamed member by its authenticated generation", async () => {
  const h = await createDecomposeTerminalFixture();
  expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: h.ctx.executor.exec, baseBranch: "main" },
    { sourceSlug: "member-a", targetSlug: "delta" })).toMatchObject({ status: "renamed" });
  const plan = await preview(h);
  expect(plan.removals.filter(reference => reference.owner.name === "delta")).toHaveLength(2);
  expect((await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: plan.applyAuthority })).status).toBe("ok");
  expect(await readWorkUnit(h.store, "delta")).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
});

it("leaves an unrelated generation that reused an abandoned member's slug untouched", async () => {
  const h = await createDecomposeTerminalFixture();
  await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "member-a")));
  const replacement = await h.seedStub("member-a");
  const plan = await preview(h);
  expect(plan.removals.some(reference => reference.owner.name === "member-a")).toBe(false);
  expect((await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: plan.applyAuthority })).status).toBe("ok");
  expect(lifecycleSuccess(await readWorkUnit(h.store, "member-a"))).toEqual(replacement);
});

it("removes a sibling renamed to an abandoned member's slug exactly once", async () => {
  const h = await createDecomposeTerminalFixture();
  await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "member-a")));
  expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: h.ctx.executor.exec, baseBranch: "main" },
    { sourceSlug: "member-b", targetSlug: "member-a" })).toMatchObject({ status: "renamed" });
  const plan = await preview(h);
  expect(plan.removals.filter(reference => reference.kind === "work-item/meta")).toHaveLength(1);
  expect(new Set(plan.removals.map(reference => JSON.stringify(reference))).size).toBe(plan.removals.length);
  expect((await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: plan.applyAuthority })).status).toBe("ok");
  expect(await readWorkUnit(h.store, "member-a")).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
});

it("closes a real sync conflict through its subject removal rather than directly removing the conflict", async () => {
  const h = await createDecomposeTerminalFixture();
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  const remote = createMemoryRemote();
  h.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.sync());
  const other = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  for (const [store, text] of [[h.store, "Local authoring"], [other, "Remote authoring"]] as const) {
    const record = lifecycleSuccess(await store.read({ reference: member.reference }));
    lifecycleSuccess(await store.write({ ...recordPut(record, { content: writeMetaNextAction(record.content, text) }),
      provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  }
  lifecycleSuccess(await h.store.sync());
  const disputed = lifecycleSuccess(await h.store.read({ reference: member.reference }));
  expect(disputed.conflicts.length).toBeGreaterThan(0);
  const plan = await preview(h);
  expect(plan.writes.some(write => write.reference.kind.endsWith("/conflict-record"))).toBe(false);
  expect(plan.writes.find(write => write.reference.kind === "work-item/meta" && write.reference.owner.name === "member-a")?.resolves)
    .toEqual(disputed.conflicts);
  for (const conflict of disputed.conflicts) expect(plan.removals).toContainEqual(conflict);
  const before = lifecycleSuccess(await h.store.version());
  expect((await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: plan.applyAuthority })).status).toBe("ok");
  const changes = lifecycleSuccess(await h.store.changes({ from: before, to: lifecycleSuccess(await h.store.version()) }));
  expect(sortByCanonicalBytes(changes.map(change => change.reference))).toEqual(plan.removals);
  for (const conflict of disputed.conflicts) {
    expect(await h.store.read({ reference: conflict })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(lifecycleSuccess(await h.store.history({ reference: conflict }))[0])
      .toMatchObject({ content: null, provenance: { verb: "decompose", lifecycleAction: "discard" } });
  }
});

it("names the additive modes when no stored map exists", async () => {
  const h = await createDecomposeOriginFixture();
  expect(await runStoreDecomposeDiscard(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "no-stored-map",
    remedy: { text: expect.stringContaining("--execute <cut-map> or --extract <cut-map>") } });
});

async function measureDiscard(scaled: boolean) {
  const h = await createDecomposeTerminalFixture();
  if (scaled) {
    for (let index = 0; index < 60; index++) await h.seedStub(`unrelated-${index}`);
    const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
    const cohort = h.applied.cohorts[0];
    if (cohort === undefined) throw new Error("Missing created cohort.");
    for (const reference of [member.reference, h.applied.storedMap, cohort.reference]) {
      for (let index = 0; index < 12; index++) {
        const record = lifecycleSuccess(await h.store.read({ reference }));
        lifecycleSuccess(await observedDecomposeWrite(h.store, { ...recordPut(record), provenance: reference.kind === "work-item/cut-map"
          ? { verb: "decompose", lifecycleAction: "revise" } : { verb: "write-back", lifecycleAction: "edit" } }));
      }
    }
  }
  const counted = createCountingStore(h.store);
  h.ctx.executor.store = counted.store;
  const memberReferences = await Promise.all(["member-a", "member-b"].map(async slug => lifecycleSuccess(await readWorkUnit(h.store, slug)).reference));
  const summarize = () => JSON.stringify(counted.observations(), (key, value: unknown) => key === "uid" ? "<uid>" : value);
  const assertHistories = () => {
    for (const reference of [h.applied.storedMap, ...memberReferences]) {
      expect(counted.count({ operation: "history", input: { reference } })).toBe(reference.kind === "work-item/cut-map" ? 1 : 0);
    }
  };
  const plan = await preview(h);
  assertHistories();
  const preparation = summarize();
  counted.reset();
  expect((await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: plan.applyAuthority })).status).toBe("ok");
  assertHistories();
  return { preparation, apply: summarize() };
}

it("keeps discard observations flat with long histories and unrelated work", async () => {
  expect(await measureDiscard(true)).toEqual(await measureDiscard(false));
}, 30_000);
