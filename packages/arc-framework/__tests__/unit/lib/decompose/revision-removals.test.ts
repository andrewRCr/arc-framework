/** Revision removals retain the discard's owner and held-work boundaries. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import { readWorkUnit, recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn, writeMetaCohort } from "../../../../src/lib/store/kinds/meta/writers.js";
import { runStoreAbandon } from "../../../../src/lib/work-unit/verbs/abandon-store.js";
import { createDefaultLocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";
import { runPause } from "../../../../src/lib/work-unit/verbs/pause-handover.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { ENTRY_CONFIGS } from "../../../../src/lib/store/kinds/entry-configs.js";
import { splitEntryList } from "../../../../src/lib/store/concurrency/entries.js";
import { entryVersion } from "../../../../src/lib/store/kinds/entry-fields.js";
import { writeCohortDocument } from "../../../../src/lib/store/kinds/cohort/index.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { runStoreDecomposeDiscard } from "../../../../src/lib/decompose/discard.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";

type Fixture = Awaited<ReturnType<typeof createDecomposeTerminalFixture>>;

function dropSecond(h: Fixture): CutMap {
  const map = structuredClone(h.map);
  map.authoring.destinations = map.authoring.destinations.filter(destination => destination.kind !== "new-member" || destination.slug !== "member-b");
  map.authoring.destinations.push({ kind: "new-member", destinationId: "z-added", slug: "member-c", workClass: "Light" });
  map.authoring.internalEdges = [];
  map.authoring.placement = { kind: "cohort", cohort: "new-group", purpose: "Coordinate the revised cut." };
  return map;
}

async function preview(h: Fixture, map: CutMap) {
  return runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" });
}

async function apply(h: Fixture, map: CutMap) {
  const plan = await preview(h, map);
  expect(plan.status).toBe("ok");
  if (plan.status === "refused" || plan.result.kind !== "preview") throw new Error(JSON.stringify(plan));
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }, { applyAuthority: plan.result.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
}

it("refuses removing a started member and revises after the native abandonment remedy", async () => {
  const h = await createDecomposeTerminalFixture();
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  lifecycleSuccess(await h.store.write({ ...recordPut(member, { placement: { kind: "active" } }), provenance: { verb: "start", lifecycleAction: "start" } }));
  const map = dropSecond(h);
  expect(await preview(h, map)).toMatchObject({ status: "refused", reason: "started-member-removal", remedy: { argv: ["arc", "abandon", "member-b"] } });
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) };
  expect(await runStoreAbandon(h.ctx, { name: "member-b", confirmed: true })).toMatchObject({ status: "abandoned" });
  await apply(h, map);
});

it.each(["depends-on", "waits-on", "retained-member"] as const)("retains a removed member while a surviving %s edge holds it", async kind => {
  const h = await createDecomposeTerminalFixture({ authorMap: map => { if (kind === "retained-member") map.authoring.internalEdges = []; } });
  const holder = kind === "retained-member" ? lifecycleSuccess(await readWorkUnit(h.store, "member-a")) : kind === "depends-on"
    ? await h.seedStub("outsider") : await h.seedMeta("outsider", { state: "Active", currentWorkflow: "process-task-loop" });
  const pause = { store: h.store, cwd: "/repo", baseBranch: "main", now: () => new Date("2026-10-19T00:00:00Z"),
    locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) },
    exec: scriptGitExec([{ match: ["remote"], responses: [{ stdout: "" }, { stdout: "" }] }]).exec };
  if (kind === "waits-on") expect(await runPause(pause, { name: "outsider", identity: h.ctx.identity, reason: "Waiting for the member.", waitsOn: "member-b" }))
    .toMatchObject({ status: "paused" });
  else await h.handEdit(holder, writeMetaDependsOn(holder.content, ["member-b"]));
  await h.seedMeta("finished", { state: "Shipped", currentWorkflow: null, completed: "2026-10-01", prUrl: "https://example.test/pull/1", dependsOn: ["member-b"] },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const map = dropSecond(h), before = lifecycleSuccess(await h.store.version());
  const refusal = await preview(h, map);
  expect(refusal).toMatchObject({ status: "refused", reason: "removed-stub-held", message: expect.stringContaining(holder.reference.owner.name) });
  if (refusal.status !== "refused") throw new Error(JSON.stringify(refusal));
  expect(refusal.message).not.toContain("finished");
  if (kind === "waits-on") for (const remedy of ["arc pause outsider", "--waits-on <other>", "--waits-on-note <text>", "--no-waits-on"])
    expect(refusal.remedy.text).toContain(remedy);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  if (kind === "waits-on") expect(await runPause(pause, { name: "outsider", identity: h.ctx.identity, waitsOn: false })).toMatchObject({ status: "paused" });
  else {
    const current = lifecycleSuccess(await readWorkUnit(h.store, holder.reference.owner.name));
    await h.handEdit(current, writeMetaDependsOn(current.content, []));
  }
  await apply(h, map);
});

it.each(["work-item", "cohort"] as const)("retains a removed cohort while an open %s holds it and admits its write-back remedy", async kind => {
  const h = await createDecomposeTerminalFixture();
  const holder = kind === "cohort" ? await h.seedCohort("group/outsider") : await h.seedStub("outsider");
  if (kind === "work-item") await h.handEdit(holder, writeMetaCohort(holder.content, "group"));
  const map = dropSecond(h);
  expect(await preview(h, map)).toMatchObject({ status: "refused", reason: "removed-cohort-held", message: expect.stringContaining("outsider"),
    remedy: { text: expect.stringContaining("write-back") } });
  const current = lifecycleSuccess(await h.store.read({ reference: holder.reference }));
  const content = kind === "work-item" ? writeMetaCohort(current.content, null) : writeCohortDocument(h.ctx.cohortTemplate, "outsider", "Independent coordination.");
  if (content === null) throw new Error("Expected cohort content.");
  await h.handEdit(current, content);
  await apply(h, map);
});

it("names each inbound entry's routing version and a retained member, then admits native routing", async () => {
  const h = await createDecomposeTerminalFixture();
  const removed = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  const inbound = await h.seed(recordReferences["work-item/inbound"](removed.reference.owner),
    "# Inbound\n\n## Inbound\n\n### First concern\n\n_Id:_ `1234abcd`\n\nRetain this work.\n\n### Second concern\n\n_Id:_ `2345bcde`\n\nRetain this too.\n");
  const map = dropSecond(h);
  expect((await preview(h, map)).status).toBe("ok");
  h.ctx.inboundGrammar = ENTRY_CONFIGS["work-item/inbound"];
  const grammar = h.ctx.inboundGrammar;
  if (grammar === undefined) throw new Error("Expected declared inbound grammar.");
  const before = lifecycleSuccess(await h.store.version());
  const refusal = await preview(h, map);
  expect(refusal).toMatchObject({ status: "refused", reason: "inbound-held" });
  if (refusal.status !== "refused") throw new Error(JSON.stringify(refusal));
  for (const entry of splitEntryList(inbound.content, grammar).parts.filter(part => part.kind === "entry"))
    expect(refusal.remedy.text).toContain(`arc route ${entry.id} --from member-b --expected-version ${entryVersion(entry)} --to member-a`);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const retained = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  const destination = recordReferences["work-item/inbound"](retained.reference.owner);
  lifecycleSuccess(await h.store.batch({ writes: [recordPut(inbound, { content: "# Inbound\n\n## Inbound\n" }),
    { action: "put", reference: destination, expected: null, content: inbound.content }], provenance: { verb: "route", lifecycleAction: "route" } }));
  await apply(h, map);
  expect(lifecycleSuccess(await h.store.read({ reference: destination })).content).toContain("2345bcde");
});

it("requires a removed member's own cut to be discarded and revises after that native remedy", async () => {
  const h = await createDecomposeTerminalFixture();
  const fresh = await prepareDecomposePreflight(h.ctx, "member-b");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const inner = completeCutMapFixture(fresh.result.machine);
  for (const destination of inner.authoring.destinations) if (destination.kind === "new-member")
    destination.slug = destination.destinationId === "member-a" ? "alpha" : "beta";
  for (const allocation of inner.authoring.sourceAllocations) if (allocation.disposition.kind === "target") allocation.disposition.targetLocator.artifact = "draft-alpha.md";
  inner.authoring.internalEdges = [{ from: "alpha", to: "beta" }];
  for (const incoming of inner.authoring.incomingDispositions) incoming.disposition = { kind: "replace", replacementTargets: ["alpha"] };
  inner.authoring.placement = { kind: "cohort", cohort: "inner-group", purpose: "Coordinate the inner cut." };
  expect(await runStoreDecomposeAdditive(h.ctx, "member-b", "execute", { cutMap: inner, cutMapPath: "inner.json" })).toMatchObject({ status: "ok" });
  const map = dropSecond(h);
  expect(await preview(h, map)).toMatchObject({ status: "refused", reason: "removed-stub-cut", remedy: { argv: ["arc", "decompose", "member-b", "--discard"] } });
  const discard = await runStoreDecomposeDiscard(h.ctx, "member-b");
  if (discard.status === "refused" || discard.result.kind !== "preview") throw new Error(JSON.stringify(discard));
  expect(await runStoreDecomposeDiscard(h.ctx, "member-b", { applyAuthority: discard.result.applyAuthority })).toMatchObject({ status: "ok", result: { kind: "discarded" } });
  await apply(h, map);
});

it.each(["unreadable", "incomplete"] as const)("preserves a %s inventory's own repair before revision and admits recovered evidence", async failure => {
  const h = await createDecomposeTerminalFixture();
  const list = h.store.list.bind(h.store), remedy = { text: "Restore the missing lifecycle evidence." };
  let broken = true;
  h.store.list = async input => {
    if (input.kind !== "work-item/meta" || !broken) return list(input);
    return { status: "ok", result: failure === "unreadable" ? { status: "unreadable", condition: "Lifecycle inventory unavailable.", remedy }
      : { status: "complete", records: [], missed: true,
        diagnostics: [{ kind: "unreadable", key: "work-item/meta:missing", condition: "A metadata record is unavailable.", remedy }] } };
  };
  const map = dropSecond(h), before = lifecycleSuccess(await h.store.version());
  expect(await preview(h, map)).toMatchObject({ status: "refused", reason: "inventory-incomplete", class: "recoverable", remedy });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  broken = false;
  await apply(h, map);
});

it("requires a retained routing recipient when all old members would leave, then admits keeping and routing to one", async () => {
  const h = await createDecomposeTerminalFixture();
  const removed = lifecycleSuccess(await readWorkUnit(h.store, "member-b"));
  const inbound = await h.seed(recordReferences["work-item/inbound"](removed.reference.owner),
    "# Inbound\n\n## Inbound\n\n### Held concern\n\n_Id:_ `1234abcd`\n\nKeep this concern.\n");
  h.ctx.inboundGrammar = ENTRY_CONFIGS["work-item/inbound"];
  const map = structuredClone(h.map);
  for (const destination of map.authoring.destinations) if (destination.kind === "new-member")
    destination.slug = destination.slug === "member-a" ? "member-c" : "member-d";
  for (const allocation of map.authoring.sourceAllocations) if (allocation.disposition.kind === "target") allocation.disposition.targetLocator.artifact = "draft-member-c.md";
  map.authoring.internalEdges = [{ from: "member-c", to: "member-d" }];
  for (const incoming of map.authoring.incomingDispositions) incoming.disposition = { kind: "replace", replacementTargets: ["member-c"] };
  expect(await preview(h, map)).toMatchObject({ status: "refused", reason: "inbound-held", remedy: { text: expect.stringContaining("Keep a current member") } });
  map.authoring.destinations.push({ kind: "new-member", destinationId: "z-held", slug: "member-a", workClass: "Light" });
  expect(await preview(h, map)).toMatchObject({ status: "refused", reason: "inbound-held", remedy: { text: expect.stringContaining("--to member-a") } });
  const retained = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  const destination = recordReferences["work-item/inbound"](retained.reference.owner);
  lifecycleSuccess(await h.store.batch({ writes: [recordPut(inbound, { content: "# Inbound\n\n## Inbound\n" }),
    { action: "put", reference: destination, expected: null, content: inbound.content }], provenance: { verb: "route", lifecycleAction: "route" } }));
  await apply(h, map);
});


it("refuses a revised-map edge from a new member to a removed member before issuing authority", async () => {
  const h = await createDecomposeTerminalFixture();
  const map = dropSecond(h);
  map.authoring.externalEdges = [{ from: "member-c", to: "member-b" }];
  const before = lifecycleSuccess(await h.store.version());
  expect(await preview(h, map)).toMatchObject({ status: "refused", reason: "removed-stub-held",
    message: expect.stringContaining("member-c.Depends On → member-b"),
    remedy: { text: expect.stringContaining("revised map") } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(await readWorkUnit(h.store, "member-c")).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  map.authoring.externalEdges = [];
  await apply(h, map);
});
