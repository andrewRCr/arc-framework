/** Stored authoring carries only across compatible source and edge changes. */
import { expect, it } from "vitest";
import { observedDecomposeWrite } from "../../../helpers/store/decompose-batch.js";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStoreDecomposeRevisionStarter } from "../../../../src/lib/decompose/revision-starter.js";
import { canonicalize } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { createDecomposeExtractionFixture } from "../../../fixtures/decompose-extraction.js";
import { DecomposeRevisionStarterReportSchema } from "../../../../src/lib/decompose/revision-starter-report.js";
import type { DecomposeContext } from "../../../../src/lib/decompose/context.js";
import { readWorkUnit, recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn, writeMetaDesign, writeMetaCurrentWorkflow, writeMetaState, writeMetaNextAction } from "../../../../src/lib/store/kinds/meta/writers.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { rebindDecomposeMap } from "../../../../src/lib/decompose/rebind.js";
import { writeTaskMarker } from "../../../../src/lib/store/kinds/task-list/index.js";
import { runReopen } from "../../../../src/lib/work-unit/verbs/reopen.js";
import { runStoreArchive } from "../../../../src/lib/work-unit/verbs/archive-store.js";
import { createMemoryRemote } from "../../../helpers/store/sync.js";
import { ENTRY_CONFIGS } from "../../../../src/lib/store/kinds/entry-configs.js";
import { createCountingStore } from "../../../helpers/store/counting-store.js";
import { ReferenceBackend } from "../../../helpers/store/reference-backend.js";

async function revision(ctx: DecomposeContext, origin = "origin") {
  const before = lifecycleSuccess(await ctx.executor.store.version());
  const result = await runStoreDecomposeRevisionStarter(ctx, origin);
  expect(result.status).toBe("ok");
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  const report = DecomposeRevisionStarterReportSchema.parse(JSON.parse(result.result));
  expect(result.result).toBe(canonicalize(report));
  expect(lifecycleSuccess(await ctx.executor.store.version())).toBe(before);
  return report;
}

it("carries all stored authoring across a unique dropped-unit edit without writing", async () => {
  const h = await createDecomposeTerminalFixture({ authorMap: map => {
    const unit = map.machine.sourceUnits.find(unit => unit.sourceLocator.kind === "section" && unit.sourceLocator.headingSource === "Scope");
    const allocation = map.authoring.sourceAllocations.find(allocation => allocation.sourceId === unit?.sourceId);
    if (allocation === undefined) throw new Error("Missing scope allocation.");
    allocation.disposition = { kind: "drop", reason: "Obsolete framing." };
  } });
  const draft = lifecycleSuccess(await h.store.read({ reference: h.draft.reference }));
  await h.handEdit(draft, draft.content.replace("Owned work.", "Updated framing."));
  const before = lifecycleSuccess(await h.store.version());
  const result = await runStoreDecomposeRevisionStarter(h.ctx, "origin");
  expect(result).toMatchObject({ status: "ok", result: expect.any(String) });
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  const report: unknown = JSON.parse(result.result);
  expect(report).toMatchObject({ status: "carried", map: { authoring: h.map.authoring } });
  expect(result.result).toBe(canonicalize(report));
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

async function integratingOrigin() {
  const h = await createDecomposeExtractionFixture();
  const tasks = lifecycleSuccess(await h.store.read({ reference: h.tasks.reference }));
  lifecycleSuccess(await h.store.write({ ...recordPut(tasks, { content: writeTaskMarker(tasks.content, "1.1", "x") }),
    provenance: { verb: "task-close", lifecycleAction: "close" } }));
  const origin = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  lifecycleSuccess(await h.store.write({ ...recordPut(origin, { content: writeMetaCurrentWorkflow(
    writeMetaState(origin.content, "Integrating"), "integrate-work-unit") }), provenance: { verb: "publish", lifecycleAction: "publish" } }));
  return h;
}

it("names reopening, retirement deactivation, and discard for an Integrating origin, then admits reopening", async () => {
  const h = await integratingOrigin();
  const before = lifecycleSuccess(await h.store.version());
  const result = await runStoreDecomposeRevisionStarter(h.ctx, "origin");
  expect(result).toMatchObject({ status: "refused", reason: "origin-state", class: "recoverable" });
  if (result.status !== "refused") throw new Error(JSON.stringify(result));
  for (const command of ["arc reopen origin", "arc deactivate origin", "arc decompose origin --discard"]) expect(result.remedy.text).toContain(command);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const executor = { ...h.ctx.executor, sideEffects: { "withdraw-pr": Object.assign(async () => undefined, {
    prepareWithdrawal: async () => ({ name: "withdraw-pr", run: async () => undefined, retryCommand: ["gh", "pr", "close", "feat/origin"] }),
  }) } };
  expect(await runReopen(executor, { name: "origin", prMerged: false })).toMatchObject({ status: "reopened" });
  expect(await revision(h.ctx)).toMatchObject({ status: "reauthor", reason: "source-units" });
});

it("refuses terminally after the origin has archived", async () => {
  const h = await integratingOrigin();
  const forbidden = async (): Promise<never> => { throw new Error("Unexpected archive filesystem operation."); };
  expect(await runStoreArchive({ executor: h.ctx.executor, fs: { readdir: forbidden },
    clock: () => new Date("2026-10-19T00:00:00Z") }, { name: "origin" })).toMatchObject({ status: "archived" });
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeRevisionStarter(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "origin-state", class: "terminal" });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it.each(["meta", "draft"] as const)("preserves the %s source-conflict refusal and admits resolved source bytes", async role => {
  const h = await createDecomposeTerminalFixture();
  const reference = role === "meta" ? h.primary.reference : h.draft.reference;
  const original = lifecycleSuccess(await h.store.read({ reference }));
  const remote = createMemoryRemote();
  h.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.push());
  const other = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  for (const [store, text] of [[h.store, "Local edit"], [other, "Remote edit"]] as const) {
    const record = lifecycleSuccess(await store.read({ reference }));
    const content = role === "meta" ? writeMetaNextAction(record.content, text) : record.content.replace("Owned work.", text);
    lifecycleSuccess(await store.write({ ...recordPut(record, { content }), provenance: { verb: "write-back", lifecycleAction: "edit" } }));
  }
  lifecycleSuccess(await h.store.push());
  const disputed = lifecycleSuccess(await h.store.read({ reference }));
  expect(disputed.conflicts.length).toBeGreaterThan(0);
  const before = lifecycleSuccess(await h.store.version());
  const refusal = await runStoreDecomposeRevisionStarter(h.ctx, "origin");
  expect(refusal).toMatchObject({ status: "refused", reason: "source-conflict", class: "recoverable" });
  if (refusal.status !== "refused") throw new Error(JSON.stringify(refusal));
  expect(refusal.message).toContain(reference.kind);
  for (const conflict of disputed.conflicts) expect(refusal.message).toContain(conflict.key);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  lifecycleSuccess(await h.store.write({ ...recordPut(disputed, { content: original.content }), resolves: disputed.conflicts,
    provenance: { verb: "write-back", lifecycleAction: "resolve" } }));
  expect(await revision(h.ctx)).toMatchObject({ status: "carried" });
});

it("refuses a source without a copied design title and admits its repair", async () => {
  const h = await createDecomposeTerminalFixture();
  const draft = lifecycleSuccess(await h.store.read({ reference: h.draft.reference }));
  await h.handEdit(draft, draft.content.replace("# Origin\n\n", ""));
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeRevisionStarter(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "source-artifact",
    locus: "draft-origin.md", remedy: { text: expect.stringContaining("title") } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const current = lifecycleSuccess(await h.store.read({ reference: draft.reference }));
  await h.handEdit(current, draft.content);
  expect(await revision(h.ctx)).toMatchObject({ status: "carried" });
});

it.each(["consumer", "provider"])("carries a renamed %s by stable edge identity and publishes the fresh name", async source => {
  const h = await createDecomposeTerminalFixture({ provider: true });
  const target = source === "consumer" ? "follower" : "upstream";
  expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: h.ctx.executor.exec, baseBranch: "main" },
    { sourceSlug: source, targetSlug: target })).toMatchObject({ status: "renamed" });
  const report = await revision(h.ctx);
  expect(report).toMatchObject({ status: "carried", map: { authoring: h.map.authoring } });
  if (report.status !== "carried") throw new Error(JSON.stringify(report));
  if (source === "consumer") {
    expect(report.map.machine.incomingEdges[0]?.dependent.slug).toBe("follower");
    expect(report.map.machine.incomingEdges[0]?.edgeId).toBe(h.map.machine.incomingEdges[0]?.edgeId);
  } else {
    expect(report.map.machine.outgoingEdges[0]?.provider.slug).toBe("upstream");
    expect(report.map.machine.outgoingEdges[0]?.edgeId).toBe(h.map.machine.outgoingEdges[0]?.edgeId);
  }
  expect(report.map.machine.preflightId).not.toBe(h.map.machine.preflightId);
});

it("carries a stub origin started since the additive batch when its shape still accepts it", async () => {
  const h = await createDecomposeTerminalFixture();
  const origin = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  lifecycleSuccess(await h.store.write({ ...recordPut(origin, { placement: { kind: "active" }, content: writeMetaCurrentWorkflow(origin.content, "draft-design") }),
    provenance: { verb: "start", lifecycleAction: "start" } }));
  expect(await revision(h.ctx)).toMatchObject({ status: "carried", map: {
    authoring: h.map.authoring, machine: { sourceKind: "started-planning", sourceUnits: h.map.machine.sourceUnits } } });
});

it("returns the decode rule's locus when a source-kind change no longer admits the stored shape", async () => {
  const h = await createDecomposeExtractionFixture();
  const origin = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  lifecycleSuccess(await h.store.write({ ...recordPut(origin, { placement: { kind: "backlog", commitment: "planned" } }),
    provenance: { verb: "park", lifecycleAction: "park" } }));
  expect(await revision(h.ctx)).toMatchObject({ status: "reauthor", reason: "source-shape", locus: "machine.sourceKind",
    starter: { machine: { sourceKind: "backlog-stub", sourceUnits: h.map.machine.sourceUnits } }, storedAuthoring: h.map.authoring });
});

it("includes an unrelated generation that reused a gone member's slug in the fresh incoming edges", async () => {
  const h = await createDecomposeTerminalFixture();
  await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "member-a")));
  const replacement = await h.seedStub("member-a");
  await h.handEdit(replacement, writeMetaDependsOn(replacement.content, ["origin"]));
  const report = await revision(h.ctx);
  expect(report).toMatchObject({ status: "reauthor", reason: "incoming-edges" });
  if (report.status !== "reauthor") throw new Error(JSON.stringify(report));
  const owner = replacement.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected replacement generation.");
  expect(report.starter.machine.incomingEdges.map(edge => edge.dependent)).toContainEqual({ slug: "member-a", uid: owner.uid });
});

it("reports the renamed origin before its changed artifact identities", async () => {
  const h = await createDecomposeTerminalFixture();
  expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: h.ctx.executor.exec, baseBranch: "main" },
    { sourceSlug: "origin", targetSlug: "delta" })).toMatchObject({ status: "renamed" });
  expect(await revision(h.ctx, "delta")).toMatchObject({ status: "reauthor", reason: "source-identity", locus: "machine.origin",
    starter: { machine: { origin: { slug: "delta", uid: h.map.machine.origin.uid } } }, storedAuthoring: h.map.authoring });
});

it("does not carry authoring into another generation of the same origin name", async () => {
  const h = await createDecomposeTerminalFixture();
  const other = await createDecomposeOriginFixture();
  const fresh = await prepareDecomposePreflight(other.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  expect(fresh.result.machine.origin.uid).not.toBe(h.map.machine.origin.uid);
  expect(rebindDecomposeMap(h.map, fresh.result.machine)).toMatchObject({ status: "ok", result: {
    status: "reauthor", reason: "source-identity", locus: "machine.origin", storedAuthoring: h.map.authoring } });
});

it("reports a changed planning profile before its changed source units", async () => {
  const h = await createDecomposeTerminalFixture({ started: true });
  const origin = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  await h.seed(recordReferences["work-item/spec"](origin.reference.owner), "# Origin\n\n## Scope\n\nSpecified work.\n");
  lifecycleSuccess(await h.store.write({ ...recordPut(origin, { content: writeMetaCurrentWorkflow(
    writeMetaDesign(origin.content, ["spec-origin.md"]), "generate-tasks") }),
  provenance: { verb: "repoint-design", lifecycleAction: "spec-finalized" } }));
  expect(await revision(h.ctx)).toMatchObject({ status: "reauthor", reason: "planning-profile", locus: "machine.planningProfile",
    starter: { machine: { planningProfile: { kind: "single-spec", sourceDesign: ["spec-origin.md"] } } }, storedAuthoring: h.map.authoring });
});

it.each(["incoming-add", "incoming-remove", "outgoing-add", "outgoing-remove"] as const)("reauthors the first changed %s identity", async kind => {
  const h = await createDecomposeTerminalFixture({ provider: true });
  if (kind === "incoming-add") {
    const newcomer = await h.seedStub("newcomer");
    await h.handEdit(newcomer, writeMetaDependsOn(newcomer.content, ["origin"]));
  } else if (kind === "incoming-remove") {
    const consumer = lifecycleSuccess(await readWorkUnit(h.store, "consumer"));
    await h.handEdit(consumer, writeMetaDependsOn(consumer.content, []));
  } else {
    if (kind === "outgoing-add") await h.seedStub("other-provider");
    const origin = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
    await h.handEdit(origin, writeMetaDependsOn(origin.content, kind === "outgoing-add" ? ["provider", "other-provider"] : []));
  }
  const report = await revision(h.ctx);
  const field = kind.startsWith("incoming") ? "incomingEdges" : "outgoingEdges";
  expect(report).toMatchObject({ status: "reauthor", reason: kind.startsWith("incoming") ? "incoming-edges" : "outgoing-edges",
    storedAuthoring: h.map.authoring });
  if (report.status !== "reauthor") throw new Error(JSON.stringify(report));
  const before = h.map.machine[field].map(edge => edge.edgeId), after = report.starter.machine[field].map(edge => edge.edgeId);
  let first = 0;
  while (before[first] === after[first] && first < Math.max(before.length, after.length)) first++;
  expect(report.locus).toBe(`machine.${field}.${first}`);
});

it("carries an extraction-kept unit's changed bytes with the full original authoring", async () => {
  const h = await createDecomposeExtractionFixture();
  const prd = lifecycleSuccess(await h.store.read({ reference: h.prd.reference }));
  await h.handEdit(prd, prd.content.replace("Surviving scope.", "Refined surviving scope."));
  const report = await revision(h.ctx);
  expect(report).toMatchObject({ status: "carried", map: { authoring: h.map.authoring } });
});

it.each([
  { name: "added", change: (content: string) => `${content}\n## Added\n\nNew work.\n` },
  { name: "removed", change: () => "# Origin\n\n" },
  { name: "renamed", change: (content: string) => content.replace("## Scope", "## Renamed scope") },
])("returns the first source identity boundary for a $name unit", async ({ change }) => {
  const h = await createDecomposeTerminalFixture();
  const draft = lifecycleSuccess(await h.store.read({ reference: h.draft.reference }));
  await h.handEdit(draft, change(draft.content));
  const report = await revision(h.ctx);
  expect(report).toMatchObject({ status: "reauthor", reason: "source-units", locus: expect.stringMatching(/^machine\.sourceUnits\.\d+$/u),
    storedAuthoring: h.map.authoring });
  if (report.status !== "reauthor") throw new Error(JSON.stringify(report));
  const first = Math.max(report.starter.machine.sourceUnits.length, h.map.machine.sourceUnits.length);
  let expected = 0;
  while (expected < first && canonicalize(report.starter.machine.sourceUnits[expected] ?? null)
    === canonicalize(h.map.machine.sourceUnits[expected] ?? null)) expected++;
  expect(report.locus).toBe(`machine.sourceUnits.${expected}`);
});

it.each([false, true])("requires reauthoring changed dropped bytes under repeated headings, descendant=%s", async descendant => {
  const h = await createDecomposeTerminalFixture({ draftContent:
    "# Origin\n\n## Repeated\n\nFirst.\n\n### Detail\n\nChild first.\n\n## Repeated\n\nSecond.\n\n### Detail\n\nChild second.\n",
  authorMap: map => {
    for (const [index, unit] of map.machine.sourceUnits.entries()) {
      const allocation = map.authoring.sourceAllocations[index];
      if (unit.sourceLocator.kind === "section" && allocation !== undefined) allocation.disposition = { kind: "drop", reason: "Reframing." };
    }
  } });
  const draft = lifecycleSuccess(await h.store.read({ reference: h.draft.reference }));
  await h.handEdit(draft, draft.content.replace(descendant ? "Child first." : "First.", "Revised dropped text."));
  const index = h.map.machine.sourceUnits.findIndex(unit => unit.sourceLocator.kind === "section"
    && unit.sourceLocator.headingSource === (descendant ? "Detail" : "Repeated") && (descendant
      ? unit.sourceLocator.ancestry[0]?.occurrence === 0 : unit.sourceLocator.occurrence === 0));
  expect(await revision(h.ctx)).toMatchObject({ status: "reauthor", reason: "source-unit-ambiguous",
    locus: `machine.sourceUnits.${index}.contentDigest`, storedAuthoring: h.map.authoring });
});

it("returns a fresh starter and the stored authoring at the first changed transferred unit", async () => {
  const h = await createDecomposeTerminalFixture();
  const draft = lifecycleSuccess(await h.store.read({ reference: h.draft.reference }));
  await h.handEdit(draft, draft.content.replace("Owned work.", "Changed transferred work."));
  const index = h.map.machine.sourceUnits.findIndex(unit => unit.sourceLocator.kind === "section");
  const result = await runStoreDecomposeRevisionStarter(h.ctx, "origin");
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect(JSON.parse(result.result)).toMatchObject({ status: "reauthor", reason: "source-units",
    locus: `machine.sourceUnits.${index}.contentDigest`, storedAuthoring: h.map.authoring,
    starter: { schemaVersion: 4, authoring: { shape: { status: "author" }, destinations: { status: "author" } } } });
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
  expect(await revision(h.ctx)).toMatchObject({ status: "carried", map: { authoring: h.map.authoring } });
  for (const reference of [h.applied.storedMap, ...members.map(member => member.reference)]) {
    expect(counted.count({ operation: "history", input: { reference } })).toBe(reference.kind === "work-item/cut-map" ? 1 : 0);
  }
  return JSON.stringify(counted.observations(), (key, value: unknown) => key === "uid" ? "<uid>" : value);
}

it("reads each birth history once and keeps revision observations flat as histories and unrelated work grow", async () => {
  expect(await measureRevision(true)).toEqual(await measureRevision(false));
}, 30_000);

it("rebinds an existing cut while the origin holds an inbound entry", async () => {
  const h = await createDecomposeTerminalFixture();
  await h.seed(recordReferences["work-item/inbound"](h.primary.reference.owner),
    "# Inbound\n\n## Inbound\n\n### A concern\n\n_Id:_ `1234abcd`\n\nKeep this concern.\n");
  h.ctx.inboundGrammar = ENTRY_CONFIGS["work-item/inbound"];
  expect(await revision(h.ctx)).toMatchObject({ status: "carried", map: { authoring: h.map.authoring } });
});
