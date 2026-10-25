/** Native revisions repair terminal refusals on the same cut generation. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { createDecomposeExtractionFixture } from "../../../fixtures/decompose-extraction.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { createDefaultLocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";
import { runStoreDecomposeFinish } from "../../../../src/lib/decompose/finish.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import { runStoreDecomposeRevisionStarter } from "../../../../src/lib/decompose/revision-starter.js";
import { DecomposeRevisionStarterReportSchema } from "../../../../src/lib/decompose/revision-starter-report.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { readWorkUnit, recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { writeMetaDependsOn, writeMetaCohort, writeMetaCurrentWorkflow, writeMetaState, renderMetaFile } from "../../../../src/lib/store/kinds/meta/writers.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { scanV3DecomposeContent } from "../../../../src/lib/work-unit/decompose-content.js";
import type { DecomposeContext } from "../../../../src/lib/decompose/context.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";

async function revise(ctx: DecomposeContext, origin: string, map: CutMap) {
  const preview = await runStoreDecomposeRevision(ctx, origin, { cutMap: map, cutMapPath: "revised.json" });
  expect(preview.status).toBe("ok");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  expect(await runStoreDecomposeRevision(ctx, origin, { cutMap: map, cutMapPath: "revised.json" }, { applyAuthority: preview.result.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
}

async function finish(ctx: DecomposeContext, origin: string) {
  ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) };
  const preview = await runStoreDecomposeFinish(ctx, origin);
  expect(preview.status).toBe("ok");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  expect(await runStoreDecomposeFinish(ctx, origin, { applyAuthority: preview.result.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "applied" } });
}

async function freshMachine(ctx: DecomposeContext, origin: string) {
  const raw = await runStoreDecomposeRevisionStarter(ctx, origin);
  expect(raw.status).toBe("ok");
  if (raw.status === "refused") throw new Error(JSON.stringify(raw));
  const report = DecomposeRevisionStarterReportSchema.parse(JSON.parse(raw.result));
  return report.status === "carried" ? report.map.machine : report.starter.machine;
}

function replaceMember(map: CutMap, from: string, to: string) {
  for (const destination of map.authoring.destinations) if (destination.kind === "new-member" && destination.slug === from) destination.slug = to;
  for (const edge of map.authoring.internalEdges) { if (edge.from === from) edge.from = to; if (edge.to === from) edge.to = to; }
  for (const allocation of map.authoring.sourceAllocations) if (allocation.disposition.kind === "target")
    allocation.disposition.targetLocator.artifact = allocation.disposition.targetLocator.artifact.replace(`-${from}.md`, `-${to}.md`);
  for (const entry of map.authoring.incomingDispositions) if (entry.disposition.kind === "replace")
    entry.disposition.replacementTargets = entry.disposition.replacementTargets.map(name => name === from ? to : name);
  for (const entry of map.authoring.outgoingDispositions) if (entry.disposition.kind === "targets")
    entry.disposition.targets = entry.disposition.targets.map(name => name === from ? to : name);
}

const repairs = ["renamed-origin", "home-gone", "home-shipped", "member-gone", "member-reused", "seeded-edge", "common-cohort",
  "target-heading", "target-ancestry", "unit-added", "unit-removed", "unit-changed", "unit-renamed",
  "incoming-add", "incoming-remove", "outgoing-add", "outgoing-remove", "started-home", "provider-ended"] as const;

it.each(repairs)("finishes the same retirement after a native revision repairs %s", async kind => {
  const withHome = kind === "home-gone" || kind === "home-shipped" || kind === "started-home" || kind === "provider-ended";
  const provider = kind === "outgoing-remove" || kind === "started-home" || kind === "provider-ended";
  const h = await createDecomposeTerminalFixture({ withHome, provider, authorMap: map => {
    if (kind === "started-home" || kind === "provider-ended") for (const edge of map.authoring.outgoingDispositions)
      edge.disposition = { kind: "targets", targets: ["home"] };
  } });
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) };
  if (withHome) {
    const home = lifecycleSuccess(await readWorkUnit(h.store, "home"));
    const draft = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/draft"](home.reference.owner) }));
    await h.handEdit(draft, `${draft.content}\n## Scope\n\nIntegrated home scope.\n`);
  }
  let origin = "origin";
  if (kind === "renamed-origin") {
    expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: h.ctx.executor.exec, baseBranch: "main" },
      { sourceSlug: origin, targetSlug: "delta" })).toMatchObject({ status: "renamed" });
    origin = "delta";
  } else if (kind === "home-gone") await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "home")));
  else if (kind === "home-shipped") {
    const home = lifecycleSuccess(await readWorkUnit(h.store, "home"));
    lifecycleSuccess(await h.store.write({ ...recordPut(home, { content: renderMetaFile("home", { state: "Shipped", owner: h.ctx.identity,
      currentWorkflow: null, completed: "2026-10-19", prUrl: "https://example.test/pull/1" }), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }),
      provenance: { verb: "archive", lifecycleAction: "archive" } }));
  } else if (kind === "member-gone" || kind === "member-reused") {
    await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "member-a")));
    if (kind === "member-reused") await h.seedStub("member-a");
  } else if (kind === "seeded-edge") {
    const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
    await h.handEdit(member, writeMetaDependsOn(member.content, []));
  } else if (kind === "common-cohort") {
    await h.seedCohort("other-group");
    for (const name of ["member-a", "member-b"]) {
      const member = lifecycleSuccess(await readWorkUnit(h.store, name));
      await h.handEdit(member, writeMetaCohort(member.content, "other-group"));
    }
  } else if (kind === "target-heading" || kind === "target-ancestry") {
    const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
    const draft = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/draft"](member.reference.owner) }));
    await h.handEdit(draft, draft.content.replace("## Scope", kind === "target-heading" ? "## Revised" : "## Parent\n\n### Scope"));
  } else if (kind.startsWith("unit-")) {
    const source = lifecycleSuccess(await h.store.read({ reference: h.draft.reference }));
    const changed = kind === "unit-added" ? `${source.content}\n## Added\n\nAdded work.\n` : kind === "unit-removed" ? "# Origin\n\n"
      : kind === "unit-changed" ? source.content.replace("Owned work.", "Changed work.") : source.content.replace("## Scope", "## Revised");
    await h.handEdit(source, changed);
  } else if (kind === "incoming-add") {
    const newcomer = await h.seedStub("newcomer");
    await h.handEdit(newcomer, writeMetaDependsOn(newcomer.content, [origin]));
  } else if (kind === "incoming-remove") {
    const consumer = lifecycleSuccess(await readWorkUnit(h.store, "consumer"));
    await h.handEdit(consumer, writeMetaDependsOn(consumer.content, []));
  } else if (kind === "outgoing-add" || kind === "outgoing-remove") {
    if (kind === "outgoing-add") await h.seedStub("provider");
    const primary = lifecycleSuccess(await readWorkUnit(h.store, origin));
    await h.handEdit(primary, writeMetaDependsOn(primary.content, kind === "outgoing-add" ? ["provider"] : []));
  } else if (kind === "started-home") {
    const home = lifecycleSuccess(await readWorkUnit(h.store, "home"));
    lifecycleSuccess(await h.store.write({ ...recordPut(home, { placement: { kind: "active" }, content: writeMetaCurrentWorkflow(home.content, "draft-design") }),
      provenance: { verb: "start", lifecycleAction: "start" } }));
  } else if (kind === "provider-ended") await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "provider")));
  const before = lifecycleSuccess(await h.store.version());
  const refusal = await runStoreDecomposeFinish(h.ctx, origin);
  expect(refusal.status).toBe("refused");
  if (refusal.status !== "refused") throw new Error(JSON.stringify(refusal));
  expect(refusal.remedy.text).toContain("--revise");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const map = completeCutMapFixture(await freshMachine(h.ctx, origin));
  if (kind === "member-gone" || kind === "member-reused") replaceMember(map, "member-a", "member-c");
  if (kind === "seeded-edge") map.authoring.internalEdges = [];
  if (kind === "common-cohort") map.authoring.placement = { kind: "cohort", cohort: "other-group" };
  if (kind === "provider-ended") for (const edge of map.authoring.outgoingDispositions) edge.disposition = { kind: "drop", reason: "Provider ended." };
  if (kind === "target-heading" || kind === "target-ancestry") {
    const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
    const draft = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/draft"](member.reference.owner) }));
    const scan = scanV3DecomposeContent("draft-member-a.md", new TextEncoder().encode(draft.content));
    if (scan.status !== "scanned") throw new Error("Expected authored target units.");
    const target = scan.units.find(unit => unit.locator.kind === "section" && unit.locator.headingSource === (kind === "target-heading" ? "Revised" : "Scope"));
    if (target === undefined) throw new Error("Expected changed target section.");
    for (const allocation of map.authoring.sourceAllocations) if (allocation.disposition.kind === "target" && allocation.disposition.targetLocator.kind === "section")
      allocation.disposition.targetLocator = target.locator;
  }
  if (kind.startsWith("unit-")) {
    const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
    const draft = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/draft"](member.reference.owner) }));
    await h.handEdit(draft, lifecycleSuccess(await h.store.read({ reference: h.draft.reference })).content);
  }
  await revise(h.ctx, origin, map);
  await finish(h.ctx, origin);
});

it.each([false, true])("finishes an extraction after revision binds activation or deactivation, initially Active=%s", async active => {
  const h = await createDecomposeExtractionFixture({ kind: "direct-member" }, active);
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  const state = active ? "Planning" : "Active";
  lifecycleSuccess(await h.store.write({ ...recordPut(primary, { content: writeMetaCurrentWorkflow(writeMetaState(primary.content, state),
    state === "Active" ? "process-task-loop" : "generate-tasks") }), provenance: { verb: active ? "deactivate" : "activate", lifecycleAction: active ? "deactivate" : "activate" } }));
  expect(await runStoreDecomposeFinish(h.ctx, "origin")).toMatchObject({ status: "refused", remedy: { argv: ["arc", "decompose", "origin", "--revise"] } });
  const map = structuredClone(h.map);
  map.machine = await freshMachine(h.ctx, "origin");
  map.authoring.sourceAllocations = map.machine.sourceUnits.map(unit => h.map.authoring.sourceAllocations.find(allocation => allocation.sourceId === unit.sourceId)
    ?? { sourceId: unit.sourceId, ownership: "destination-owned", disposition: { kind: "retained-origin" } });
  await revise(h.ctx, "origin", map);
  await finish(h.ctx, "origin");
});

it("finishes an extraction after a native revision leaves a newly started dependent on the origin", async () => {
  const h = await createDecomposeExtractionFixture();
  const consumer = lifecycleSuccess(await readWorkUnit(h.store, "consumer"));
  lifecycleSuccess(await h.store.write({ ...recordPut(consumer, { placement: { kind: "active" }, content: writeMetaCurrentWorkflow(consumer.content, "draft-design") }),
    provenance: { verb: "start", lifecycleAction: "start" } }));
  expect(await runStoreDecomposeFinish(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "started-edge", remedy: { argv: ["arc", "decompose", "origin", "--revise"] } });
  const map = structuredClone(h.map);
  for (const incoming of map.authoring.incomingDispositions) incoming.disposition = { kind: "replace", replacementTargets: ["origin"] };
  await revise(h.ctx, "origin", map);
  await finish(h.ctx, "origin");
});
