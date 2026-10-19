/** Terminal record plans land dependent edits and fan-out with the stored map's removal. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { acquireDecomposeTerminal } from "../../../../src/lib/decompose/acquire-terminal.js";
import { prepareDecomposeRetirementRecords } from "../../../../src/lib/decompose/retirement-records.js";
import { prepareDecomposeLineage } from "../../../../src/lib/decompose/lineage-plan.js";
import { readWorkUnit, readLifecycleMetaFields, recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaCurrentWorkflow, writeMetaDependsOn, writeMetaDesign } from "../../../../src/lib/store/kinds/meta/writers.js";
import { writeCohortFanout } from "../../../../src/lib/store/kinds/cohort/index.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { checkDecomposeSourceBinding } from "../../../../src/lib/decompose/source-binding.js";
import type { DecomposeContext } from "../../../../src/lib/decompose/context.js";
import type { DecomposeTerminalRecords } from "../../../../src/lib/decompose/acquire-terminal.js";
import type { DecomposeRetirementRecordPlan } from "../../../../src/lib/decompose/retirement-records.js";

async function prepare(ctx: DecomposeContext) {
  const input = await acquireDecomposeTerminal(ctx, "origin");
  if (input.status === "refused") throw new Error(JSON.stringify(input));
  const result = await prepareDecomposeRetirementRecords(ctx, input.result);
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  return { input: input.result, plan: result.result };
}

async function land(ctx: DecomposeContext, input: DecomposeTerminalRecords, plan: DecomposeRetirementRecordPlan) {
  const lineage = await prepareDecomposeLineage(ctx, input);
  if (lineage.status === "refused") throw new Error(JSON.stringify(lineage));
  const primary = input.acquired.primary;
  return lifecycleSuccess(await ctx.executor.store.batch({ provenance: { verb: "decompose", lifecycleAction: "terminal" },
    writes: [...plan.writes, lineage.result.write, { action: "remove", reference: primary.reference, expected: primary.version }] }));
}

it.each(["replace", "drop", "started"] as const)("lands the %s dependent disposition with one explicit stored-map removal", async action => {
  const h = await createDecomposeTerminalFixture({ authorMap: map => {
    if (action === "drop") for (const incoming of map.authoring.incomingDispositions) incoming.disposition = { kind: "drop", reason: "No replacement prerequisite." };
  } });
  if (action === "started") {
    const consumer = lifecycleSuccess(await readWorkUnit(h.store, "consumer"));
    lifecycleSuccess(await h.store.write({ ...recordPut(consumer, { placement: { kind: "active" },
      content: writeMetaCurrentWorkflow(consumer.content, "draft-design") }), provenance: { verb: "start", lifecycleAction: "start" } }));
  }
  const { input, plan } = await prepare(h.ctx);
  expect(plan.writes.filter(write => write.reference.kind === "work-item/cut-map")).toEqual([
    { action: "remove", reference: input.acquired.storedMap.reference, expected: input.acquired.storedMap.version },
  ]);
  await land(h.ctx, input, plan);
  const consumer = lifecycleSuccess(await readWorkUnit(h.store, "consumer"));
  expect(lifecycleSuccess(readLifecycleMetaFields(consumer)).dependsOn).toEqual(action === "started" ? ["origin"] : action === "drop" ? [] : ["member-a"]);
  expect(await h.store.read({ reference: input.acquired.storedMap.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
});

it("combines a stub home's incoming replacement and provider addition in one write", async () => {
  const h = await createDecomposeTerminalFixture({ withHome: true, provider: true, authorMap: map => {
    for (const outgoing of map.authoring.outgoingDispositions) outgoing.disposition = { kind: "targets", targets: ["home"] };
  } });
  await h.seedStub("unrelated");
  const home = lifecycleSuccess(await readWorkUnit(h.store, "home"));
  await h.handEdit(home, writeMetaDependsOn(home.content, ["unrelated", "origin"]));
  const { input, plan } = await prepare(h.ctx);
  expect(plan.writes.filter(write => write.reference.kind === "work-item/meta" && write.reference.owner.name === "home")).toHaveLength(1);
  await land(h.ctx, input, plan);
  const current = lifecycleSuccess(readLifecycleMetaFields(lifecycleSuccess(await readWorkUnit(h.store, "home"))));
  expect(current.dependsOn[0]).toBe("unrelated");
  expect(new Set(current.dependsOn.slice(1))).toEqual(new Set(["member-a", "provider"]));
  expect(current.dependsOn).toHaveLength(3);
});

it("appends the at-cap fan-out with the declared member slugs in the terminal batch", async () => {
  const h = await createDecomposeTerminalFixture({ atCap: true });
  const { input, plan } = await prepare(h.ctx);
  expect(plan.fanout).toMatchObject({ path: "group/child", status: "appended", members: ["member-a", "member-b"] });
  const cohort = input.cohorts.find(candidate => candidate.path === "group/child");
  if (cohort === undefined) throw new Error("Expected subcohort.");
  await land(h.ctx, input, plan);
  const current = lifecycleSuccess(await h.store.read({ reference: cohort.record.reference }));
  expect(current.content).toContain("<!-- arc:decompose-fanout:origin:start -->\n### `origin` decomposition fan-out\n\n- `member-a`\n- `member-b`\n<!-- arc:decompose-fanout:origin:end -->");
  expect(current.version).not.toBe(cohort.record.version);
});

it("reuses a hand-authored matching fan-out without advancing the cohort record", async () => {
  const h = await createDecomposeTerminalFixture({ atCap: true });
  const first = await prepare(h.ctx);
  const cohort = first.input.cohorts.find(candidate => candidate.path === "group/child");
  if (cohort === undefined) throw new Error("Expected subcohort.");
  const authored = writeCohortFanout(cohort.record.content, "origin", ["member-b", "member-a"]);
  if (authored.status === "refused") throw new Error("Expected fan-out fixture.");
  const current = await h.handEdit(cohort.record, authored.content);
  const { input, plan } = await prepare(h.ctx);
  expect(plan.fanout?.status).toBe("reused");
  await land(h.ctx, input, plan);
  expect(lifecycleSuccess(await h.store.read({ reference: current.reference }))).toEqual(current);
});

it.each(["lone-marker", "different-block"] as const)("refuses a %s fan-out before writes and lands after write-back repair", async kind => {
  const h = await createDecomposeTerminalFixture({ atCap: true });
  const first = await prepare(h.ctx);
  const cohort = first.input.cohorts.find(candidate => candidate.path === "group/child");
  if (cohort === undefined) throw new Error("Expected subcohort.");
  const other = writeCohortFanout(cohort.record.content, "origin", ["another-member"]);
  if (other.status === "refused") throw new Error("Expected fan-out fixture.");
  const current = await h.handEdit(cohort.record, kind === "different-block" ? other.content
    : `${cohort.record.content}\n<!-- arc:decompose-fanout:origin:start -->\n`);
  const input = await acquireDecomposeTerminal(h.ctx, "origin");
  if (input.status === "refused") throw new Error(JSON.stringify(input));
  const before = lifecycleSuccess(await h.store.version());
  expect(await prepareDecomposeRetirementRecords(h.ctx, input.result)).toMatchObject({ status: "refused", reason: "fanout-conflict",
    remedy: { argv: ["arc", "decompose", "origin", "--finish"], text: expect.stringContaining("write-back") } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  await h.handEdit(current, cohort.record.content);
  const repaired = await prepare(h.ctx);
  await land(h.ctx, repaired.input, repaired.plan);
  expect(lifecycleSuccess(await h.store.read({ reference: cohort.record.reference })).content).toContain("- `member-a`\n- `member-b`");
});

it("rewrites a stub dependent holding its own cut and leaves that cut requiring revision", async () => {
  const h = await createDecomposeOriginFixture();
  const consumer = await h.seedStub("consumer");
  await h.seed(recordReferences["work-item/draft"](consumer.reference.owner), "# Consumer\n\n## Scope\n\nDependent work.\n");
  await h.handEdit(consumer, writeMetaDesign(writeMetaDependsOn(consumer.content, ["origin"]), ["draft-consumer.md"]));
  const consumerPreflight = await prepareDecomposePreflight(h.ctx, "consumer");
  if (consumerPreflight.status === "refused") throw new Error(JSON.stringify(consumerPreflight));
  const consumerMap = completeCutMapFixture(consumerPreflight.result.machine);
  const ownCut = await runStoreDecomposeAdditive(h.ctx, "consumer", "execute", { cutMap: consumerMap, cutMapPath: "consumer.json" });
  if (ownCut.status === "refused") throw new Error(JSON.stringify(ownCut));
  const saved = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/cut-map"](consumer.reference.owner) }));
  const preflight = await prepareDecomposePreflight(h.ctx, "origin");
  if (preflight.status === "refused") throw new Error(JSON.stringify(preflight));
  const map = completeCutMapFixture(preflight.result.machine);
  map.authoring.shape = "heterogeneous";
  map.authoring.placement = { kind: "direct-member" };
  map.authoring.destinations = [
    { kind: "new-member", destinationId: "member-a", slug: "origin-member", workClass: "Light" },
    { kind: "existing-home", destinationId: "z-home", target: { kind: "work-unit", slug: "consumer" } },
  ];
  map.authoring.internalEdges = [];
  for (const allocation of map.authoring.sourceAllocations) {
    if (allocation.disposition.kind !== "target") continue;
    const home = allocation.disposition.targetLocator.kind === "section";
    allocation.disposition.destinationId = home ? "z-home" : "member-a";
    allocation.disposition.targetLocator.artifact = home ? "draft-consumer.md" : "draft-origin-member.md";
  }
  for (const incoming of map.authoring.incomingDispositions) incoming.disposition = { kind: "replace", replacementTargets: ["origin-member"] };
  const additive = await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: map, cutMapPath: "origin.json" });
  if (additive.status === "refused") throw new Error(JSON.stringify(additive));
  const prepared = await prepare(h.ctx);
  await land(h.ctx, prepared.input, prepared.plan);
  const current = lifecycleSuccess(await readWorkUnit(h.store, "consumer"));
  expect(lifecycleSuccess(readLifecycleMetaFields(current)).dependsOn).toEqual(["origin-member"]);
  expect(lifecycleSuccess(await h.store.read({ reference: saved.reference }))).toEqual(saved);
  const acquired = await acquireDecomposeTerminal(h.ctx, "consumer");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  expect(checkDecomposeSourceBinding(h.ctx, acquired.result)).toMatchObject({ status: "refused", reason: "stale-machine",
    locus: "machine.outgoingEdges", remedy: { argv: ["arc", "decompose", "consumer", "--revise"] } });
});
