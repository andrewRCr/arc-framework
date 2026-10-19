/** A surviving origin participates in the same checked additive batch as its members. */
import { expect, it } from "vitest";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { readLifecycleMetaFields, readWorkUnit } from "../../../../src/lib/store/lifecycle-write.js";
import { createDecomposeHarness } from "../../../helpers/store/decompose-harness.js";
import { decomposeContext } from "../../../fixtures/decompose-context.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaCurrentWorkflow } from "../../../../src/lib/store/kinds/meta/writers.js";

it("creates a member whose seeded dependency resolves to the surviving origin", async () => {
  const h = await createDecomposeOriginFixture(true);
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine, true);
  map.authoring.externalEdges = [{ from: "member-a", to: "origin" }];
  const applied = await runStoreDecomposeAdditive(h.ctx, "origin", "extract", { cutMap: map, cutMapPath: "cut.json" });
  expect(applied.status).toBe("ok");
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  expect(lifecycleSuccess(readLifecycleMetaFields(member)).dependsOn).toEqual(["origin"]);
});

it.each([false, true])("allows a dependent to keep its edge on the origin, started=%s", async started => {
  const h = await createDecomposeOriginFixture(true);
  const consumer = await h.seedMeta("consumer", { state: "Planning", currentWorkflow: started ? "draft-design" : null,
    dependsOn: ["origin"] }, started ? { kind: "active" } : { kind: "backlog", commitment: "planned" });
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine, true);
  expect(map.authoring.incomingDispositions).toHaveLength(1);
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "extract", { cutMap: map, cutMapPath: "cut.json" }))
    .toMatchObject({ status: "ok" });
  expect(lifecycleSuccess(readLifecycleMetaFields(lifecycleSuccess(await h.store.read({ reference: consumer.reference })))).dependsOn)
    .toEqual(["origin"]);
});

it("refuses extraction from a stub and accepts a fresh map after the origin starts", async () => {
  const h = await createDecomposeOriginFixture();
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const input = { cutMap: completeCutMapFixture(fresh.result.machine, true), cutMapPath: "cut.json" };
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "extract", input))
    .toMatchObject({ status: "refused", reason: "source-shape", locus: "machine.sourceKind" });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  lifecycleSuccess(await h.store.write({ ...recordPut(h.primary, { placement: { kind: "active" },
    content: writeMetaCurrentWorkflow(h.primary.content, "draft-design") }), provenance: { verb: "start", lifecycleAction: "start" } }));
  const started = await prepareDecomposePreflight(h.ctx, "origin");
  if (started.status === "refused") throw new Error(JSON.stringify(started));
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "extract", {
    ...input, cutMap: completeCutMapFixture(started.result.machine, true) })).toMatchObject({ status: "ok" });
});

it("refuses sending an extraction companion to a member and continues once it is retained", async () => {
  const h = await createDecomposeOriginFixture(true);
  await h.seed(recordReferences["work-item/notes"](h.primary.reference.owner), "# Notes\n\n## Decisions\n\nStay here.\n");
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine, true);
  const index = map.machine.sourceUnits.findIndex(unit => unit.sourceLocator.artifact === "notes-origin.md");
  expect(index).toBeGreaterThanOrEqual(0);
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "extract", { cutMap: map, cutMapPath: "cut.json" }))
    .toMatchObject({ status: "refused", reason: "companion-disposition", locus: `authoring.sourceAllocations.${index}.disposition` });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  for (const [position, unit] of map.machine.sourceUnits.entries()) {
    const allocation = map.authoring.sourceAllocations[position];
    if (allocation !== undefined && unit.sourceLocator.artifact === "notes-origin.md") allocation.disposition = { kind: "retained-origin" };
  }
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "extract", { cutMap: map, cutMapPath: "cut.json" }))
    .toMatchObject({ status: "ok" });
});

it.each(["Planning", "Active"] as const)("keeps the %s origin and all companions while copying only its spec", async state => {
  const h = createDecomposeHarness();
  await h.seedCohort("previous");
  const primary = await h.seedMeta("origin", { state, currentWorkflow: state === "Planning" ? "generate-tasks" : "process-task-loop",
    design: ["spec-origin.md"], taskList: "tasks-origin.md", cohort: "previous" });
  const owner = primary.reference.owner;
  const spec = await h.seed(recordReferences["work-item/spec"](owner), "# Origin\n\n## Scope\n\nExtracted scope.\n");
  const tasks = await h.seed(recordReferences["work-item/task-list"](owner),
    "# Task List: Origin\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Do work**\n");
  const notes = await h.seed(recordReferences["work-item/notes"](owner), "# Notes\n\n## Decisions\n\nRetained decisions.\n");
  const companion = await h.seed(recordReferences["work-item/companion"](owner, "review"), "# Review\n\nRetained review.\n");
  const ctx = decomposeContext(h.store);
  const fresh = await prepareDecomposePreflight(ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine, true);
  map.authoring.placement = { kind: "cohort", cohort: "group", purpose: "Coordinate the extracted scope." };
  for (const [index, unit] of map.machine.sourceUnits.entries()) {
    const allocation = map.authoring.sourceAllocations[index];
    if (allocation === undefined) throw new Error("Expected allocation.");
    allocation.disposition = unit.sourceLocator.artifact === "spec-origin.md"
      ? { kind: "target", destinationId: "member-a", targetLocator: { ...unit.sourceLocator, artifact: "spec-member-a.md" } }
      : { kind: "retained-origin" };
  }
  const applied = await runStoreDecomposeAdditive(ctx, "origin", "extract", { cutMap: map, cutMapPath: "cut.json" });
  expect(applied).toMatchObject({ status: "ok", result: { members: [{ copies: [{ basename: "spec-member-a.md" }] }] } });
  if (applied.status === "refused") throw new Error(JSON.stringify(applied));
  expect(applied.result.members[0]?.copies).toHaveLength(1);
  for (const record of [primary, spec, tasks, notes, companion]) {
    const after = lifecycleSuccess(await h.store.read({ reference: record.reference }));
    expect(after).toEqual({ ...record, version: after.version });
  }
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  expect(lifecycleSuccess(readLifecycleMetaFields(member)).cohort).toBe("group");
  for (const reference of [recordReferences["work-item/task-list"](member.reference.owner),
    recordReferences["work-item/notes"](member.reference.owner), recordReferences["work-item/companion"](member.reference.owner, "review")]) {
    expect(await h.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }
});
