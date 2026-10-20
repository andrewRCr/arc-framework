import { storedCutMapFixture } from "../../../fixtures/stored-cut-map.js";
/** Extraction applies exact prepared mutations with no lifecycle transition or Git operation. */
import { expect, it } from "vitest";
import { observedDecomposeWrite } from "../../../helpers/store/decompose-batch.js";
import { createDecomposeExtractionFixture } from "../../../fixtures/decompose-extraction.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { prepareDecomposeExtraction, applyDecomposeExtraction } from "../../../../src/lib/decompose/extraction.js";
import { readWorkUnit, readLifecycleMetaFields } from "../../../../src/lib/store/lifecycle-write.js";
import { sortByCanonicalBytes } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaCurrentWorkflow, writeMetaState, writeMetaPriority } from "../../../../src/lib/store/kinds/meta/writers.js";
import { writeCutMapRecord } from "../../../../src/lib/store/kinds/cut-map/index.js";
import { writeCohortFanout } from "../../../../src/lib/store/kinds/cohort/index.js";
import { runReopen } from "../../../../src/lib/work-unit/verbs/reopen.js";
import { writeTaskMarker } from "../../../../src/lib/store/kinds/task-list/index.js";
import { withCompetingBatch } from "../../../helpers/store/decompose-harness.js";

const placements: CutMap["authoring"]["placement"][] = [
  { kind: "direct-member" },
  { kind: "cohort", cohort: "group", purpose: "Coordinate extracted work." },
  { kind: "subcohort", cohort: "group/child", purpose: "Coordinate extracted work.", parentPurpose: "Coordinate related work." },
  { kind: "at-cap", parent: "group/child" },
];

it.each(placements)("applies only prepared writes and preserves the origin under $kind", async placement => {
  const h = await createDecomposeExtractionFixture(placement);
  const prepared = await prepareDecomposeExtraction(h.ctx, "origin");
  expect(prepared.status).toBe("ok");
  if (prepared.status === "refused") throw new Error(JSON.stringify(prepared));
  const before = lifecycleSuccess(await h.store.version());
  expect((await applyDecomposeExtraction(h.ctx, prepared.result)).status).toBe("ok");
  const changes = lifecycleSuccess(await h.store.changes({ from: before, to: lifecycleSuccess(await h.store.version()) }));
  expect(sortByCanonicalBytes(changes.map(change => ({ reference: change.reference, content: change.content }))))
    .toEqual(sortByCanonicalBytes(prepared.result.writes.map(write => ({ reference: write.reference, content: write.action === "put" ? write.content : null }))));
  expect(new Set(changes.map(change => "verb" in change.provenance ? change.provenance.batchId : undefined)).size).toBe(1);
  for (const change of changes) expect(change.provenance).toMatchObject({ verb: "decompose", lifecycleAction: "terminal", batchId: expect.any(String) });
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  expect(primary.reference).toEqual(h.primary.reference);
  expect(primary.placement).toEqual(h.primary.placement);
  expect(lifecycleSuccess(readLifecycleMetaFields(primary)).cohort)
    .toBe(placement.kind === "direct-member" ? "previous" : placement.kind === "at-cap" ? placement.parent : placement.cohort);
  expect(lifecycleSuccess(await h.store.read({ reference: h.prd.reference })).content).toBe("# Origin PRD\n\n## Keep\n\nSurviving scope.\n\n");
  expect(await h.store.read({ reference: h.rfc.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(await h.store.read({ reference: h.additive.storedMap })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(await h.store.lookup({ kind: "lineage", origin: "origin" })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(lifecycleSuccess(readLifecycleMetaFields(lifecycleSuccess(await readWorkUnit(h.store, "consumer")))).dependsOn).toEqual(["member-a"]);
  expect(lifecycleSuccess(readLifecycleMetaFields(lifecycleSuccess(await readWorkUnit(h.store, "home")))).dependsOn).toEqual(["member-a", "provider"]);
  for (const record of [h.member, h.tasks, h.notes]) expect(lifecycleSuccess(await h.store.read({ reference: record.reference }))).toEqual(record);
  if (placement.kind === "at-cap") {
    const cohort = prepared.result.input.cohorts.find(candidate => candidate.path === placement.parent)?.record;
    if (cohort === undefined) throw new Error("Expected at-cap cohort.");
    expect(lifecycleSuccess(await h.store.read({ reference: cohort.reference })).content).toContain("- `member-a`");
  }
  expect(await h.store.read({ reference: recordReferences["lineage/transition"](primary.reference.owner) }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
});

it("refuses moving a newly started dependent off the origin and admits its corrected disposition", async () => {
  const h = await createDecomposeExtractionFixture();
  const consumer = lifecycleSuccess(await readWorkUnit(h.store, "consumer"));
  lifecycleSuccess(await h.store.write({ ...recordPut(consumer, { placement: { kind: "active" },
    content: writeMetaCurrentWorkflow(consumer.content, "draft-design") }), provenance: { verb: "start", lifecycleAction: "start" } }));
  const before = lifecycleSuccess(await h.store.version());
  expect(await prepareDecomposeExtraction(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "started-edge",
    remedy: { argv: ["arc", "decompose", "origin", "--revise"] } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const index = h.map.machine.incomingEdges.findIndex(edge => edge.dependent.slug === "consumer");
  const disposition = h.map.authoring.incomingDispositions[index];
  if (disposition === undefined) throw new Error("Expected dependent disposition.");
  disposition.disposition = { kind: "replace", replacementTargets: ["origin"] };
  const stored = lifecycleSuccess(await h.store.read({ reference: h.additive.storedMap }));
  lifecycleSuccess(await observedDecomposeWrite(h.store, { ...recordPut(stored, { content: writeCutMapRecord(storedCutMapFixture(h.map)) }),
    provenance: { verb: "decompose", lifecycleAction: "revise" } }));
  const repaired = await prepareDecomposeExtraction(h.ctx, "origin");
  if (repaired.status === "refused") throw new Error(JSON.stringify(repaired));
  expect((await applyDecomposeExtraction(h.ctx, repaired.result)).status).toBe("ok");
  expect(lifecycleSuccess(readLifecycleMetaFields(lifecycleSuccess(await readWorkUnit(h.store, "consumer")))).dependsOn).toEqual(["origin"]);
});

it.each([false, true])("refuses a changed scan after activation or deactivation, initially Active=%s", async active => {
  const h = await createDecomposeExtractionFixture({ kind: "direct-member" }, active);
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  const setState = async (state: "Planning" | "Active") => {
    const current = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
    lifecycleSuccess(await h.store.write({ ...recordPut(current, { content: writeMetaCurrentWorkflow(writeMetaState(current.content, state),
      state === "Active" ? "process-task-loop" : "generate-tasks") }),
    provenance: { verb: state === "Active" ? "activate" : "deactivate", lifecycleAction: state === "Active" ? "activate" : "deactivate" } }));
  };
  await setState(active ? "Planning" : "Active");
  const before = lifecycleSuccess(await h.store.version());
  expect(await prepareDecomposeExtraction(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "stale-machine",
    locus: "machine.sourceUnits", remedy: { argv: ["arc", "decompose", "origin", "--revise"] } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  await setState(active ? "Active" : "Planning");
  expect((await prepareDecomposeExtraction(h.ctx, "origin")).status).toBe("ok");
  expect(lifecycleSuccess(await readWorkUnit(h.store, "origin")).reference).toEqual(primary.reference);
});

it("refuses Integrating with the reopen action and admits the reopened origin", async () => {
  const h = await createDecomposeExtractionFixture({ kind: "direct-member" }, true);
  const tasks = lifecycleSuccess(await h.store.read({ reference: h.tasks.reference }));
  lifecycleSuccess(await h.store.write({ ...recordPut(tasks, { content: writeTaskMarker(tasks.content, "1.1", "x") }),
    provenance: { verb: "task-close", lifecycleAction: "close" } }));
  const primary = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  lifecycleSuccess(await h.store.write({ ...recordPut(primary, { content: writeMetaCurrentWorkflow(
    writeMetaState(primary.content, "Integrating"), "integrate-work-unit") }), provenance: { verb: "publish", lifecycleAction: "publish" } }));
  expect(await prepareDecomposeExtraction(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "origin-kind",
    remedy: { argv: ["arc", "reopen", "origin"] } });
  const executor = { ...h.ctx.executor, sideEffects: { "withdraw-pr": Object.assign(async () => undefined, {
    prepareWithdrawal: async () => ({ name: "withdraw-pr", run: async () => undefined, retryCommand: ["gh", "pr", "close", "feat/origin"] }),
  }) } };
  expect(await runReopen(executor, { name: "origin", prMerged: false })).toMatchObject({ status: "reopened" });
  expect((await prepareDecomposeExtraction(h.ctx, "origin")).status).toBe("ok");
});

it.each(["revalidation", "batch"] as const)("requires fresh preview and approval on a %s version conflict", async stage => {
  const h = await createDecomposeExtractionFixture();
  const prepared = await prepareDecomposeExtraction(h.ctx, "origin");
  if (prepared.status === "refused") throw new Error(JSON.stringify(prepared));
  const recipient = lifecycleSuccess(await readWorkUnit(h.store, stage === "batch" ? "home" : "member-a"));
  const before = lifecycleSuccess(await h.store.version());
  const compete = async () => { await h.handEdit(recipient, writeMetaPriority(recipient.content, "P2")); };
  if (stage === "batch") h.ctx.executor.store = withCompetingBatch(h.store, compete);
  else await compete();
  expect(await applyDecomposeExtraction(h.ctx, prepared.result)).toMatchObject({ status: "refused", reason: "version-conflict",
    remedy: { text: expect.stringMatching(/fresh.*preview.*approv/iu), argv: ["arc", "decompose", "origin", "--finish"] } });
  const changes = lifecycleSuccess(await h.store.changes({ from: before, to: lifecycleSuccess(await h.store.version()) }));
  expect(changes).toHaveLength(1);
  expect(changes[0]?.reference).toEqual(recipient.reference);
  const fresh = await prepareDecomposeExtraction(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  expect((await applyDecomposeExtraction(h.ctx, fresh.result)).status).toBe("ok");
});

it.each(["lone marker", "different block"])("refuses at-cap %s and applies after the block is repaired", async condition => {
  const h = await createDecomposeExtractionFixture({ kind: "at-cap", parent: "group/child" });
  const prepared = await prepareDecomposeExtraction(h.ctx, "origin");
  if (prepared.status === "refused") throw new Error(JSON.stringify(prepared));
  const cohort = prepared.result.input.cohorts.find(candidate => candidate.path === "group/child")?.record;
  if (cohort === undefined) throw new Error("Expected at-cap cohort.");
  const different = writeCohortFanout(cohort.content, "origin", ["intruder"]);
  if (different.status !== "appended") throw new Error("Expected new fan-out.");
  const bad = await h.handEdit(cohort, condition === "lone marker"
    ? `${cohort.content}\n<!-- arc:decompose-fanout:origin:start -->\n` : different.content);
  const before = lifecycleSuccess(await h.store.version());
  expect(await prepareDecomposeExtraction(h.ctx, "origin")).toMatchObject({ status: "refused", reason: "fanout-conflict",
    remedy: { text: expect.stringContaining("write-back"), argv: ["arc", "decompose", "origin", "--finish"] } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  await h.handEdit(bad, cohort.content);
  const repaired = await prepareDecomposeExtraction(h.ctx, "origin");
  if (repaired.status === "refused") throw new Error(JSON.stringify(repaired));
  expect((await applyDecomposeExtraction(h.ctx, repaired.result)).status).toBe("ok");
});
