/** Field verb arms use the checked store and the metadata kinds' typed writers. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runSetStage } from "../../../../src/lib/work-unit/verbs/set-stage.js";
import { runFinalizeStage } from "../../../../src/lib/work-unit/verbs/finalize-stage.js";
import { runRepointDesign } from "../../../../src/lib/work-unit/verbs/repoint-design.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { runSetClass } from "../../../../src/lib/work-unit/verbs/set-class.js";
import { writeMetaPause, writeMetaClass, writeMetaCurrentWorkflow, writeMetaNextAction, writeMetaTaskList, writeMetaDesign } from "../../../../src/lib/store/kinds/meta/writers.js";

it("set-stage writes Current Workflow and the begin pointer through the store", async () => {
  const { store, seedMeta } = createLifecycleHarness();
  const record = await seedMeta("example", { state: "Planning", currentWorkflow: "draft-design" });
  const context = { store, writeCurrentWorkflowField: async () => {}, writeSoftFields: async () => {} };
  expect(await runSetStage(context, { name: "example", stage: "create-spec", advance: true })).toMatchObject({ status: "ok" });
  const result = lifecycleSuccess(await store.read({ reference: record.reference }));
  expect(result.content).toBe(writeMetaNextAction(writeMetaCurrentWorkflow(record.content, "create-spec"), "[begin current workflow]"));
});
it("finalize writes Class, Task List and Next Action as the typed writers render them", async () => {
  const { store, seedMeta } = createLifecycleHarness();
  const record = await seedMeta("example", { state: "Planning", currentWorkflow: "generate-tasks", design: ["spec-example.md"] });
  const context = { store, writeClassField: async () => {}, writeSoftFields: async () => {} };
  expect(await runFinalizeStage(context, { name: "example", firePoint: "generate-tasks", workClass: "Novel" })).toMatchObject({ status: "ok" });
  const result = lifecycleSuccess(await store.read({ reference: record.reference }));
  expect(result.content).toBe(writeMetaNextAction(writeMetaTaskList(writeMetaClass(record.content, "Novel"), "tasks-example.md"),
    "Task list finalized — ready to activate"));
});
it("repoint reads the stored Design rather than a stale caller value", async () => {
  const { store, seedMeta } = createLifecycleHarness();
  const record = await seedMeta("example", { state: "Planning", currentWorkflow: "create-spec", design: ["draft-example.md"] });
  const context = { store, writeDesignField: async () => {} };
  expect(await runRepointDesign(context, { name: "example", event: "spec-finalized", currentDesign: ["stale"] })).toMatchObject({ status: "ok" });
  const afterRepoint = lifecycleSuccess(await store.read({ reference: record.reference }));
  expect(afterRepoint.content).toBe(writeMetaNextAction(writeMetaCurrentWorkflow(writeMetaDesign(record.content, ["spec-example.md"]),
    "generate-tasks"), "[begin current workflow]"));
  const stageContext = { store, writeCurrentWorkflowField: async () => {}, writeSoftFields: async () => {} };
  expect(await runSetStage(stageContext, { name: "example", stage: "generate-tasks", advance: true })).toMatchObject({ status: "ok" });
  expect(lifecycleSuccess(await store.read({ reference: record.reference })).content).toBe(afterRepoint.content);
});

it("paused stage advancement refuses while class, repoint's design-coherence batch, and a hand edit proceed", async () => {
  const { store, seedMeta } = createLifecycleHarness();
  const record = await seedMeta("example", { state: "Planning", currentWorkflow: "create-spec", design: ["draft-example.md"] });
  lifecycleSuccess(await store.write({ action: "put", reference: record.reference, expected: record.version, placement: { kind: "active" },
    content: writeMetaPause(record.content, { pausedBy: SlugSchema.parse("test-user"), since: "2026-10-14T00:00:00Z", reason: "Wait.", waitsOn: null, resumeNotes: null, open: false }),
    provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const paused = lifecycleSuccess(await store.read({ reference: record.reference }));
  expect(await runSetStage({ store, writeCurrentWorkflowField: async () => {}, writeSoftFields: async () => {} },
    { name: "example", stage: "create-spec", advance: true })).toMatchObject({ status: "rejected", remedy: { argv: ["arc", "resume", "example"] } });
  expect(lifecycleSuccess(await store.read({ reference: record.reference }))).toEqual(paused);
  expect(await runSetClass({ cwd: "/checkout", store }, { name: "example", workClass: "Novel" })).toMatchObject({ status: "ok" });
  expect(await runRepointDesign({ store, writeDesignField: async () => {} }, { name: "example", event: "spec-finalized" })).toMatchObject({ status: "ok" });
  const repointed = lifecycleSuccess(await store.read({ reference: record.reference }));
  lifecycleSuccess(await store.write({ action: "put", reference: record.reference, expected: repointed.version, placement: { kind: "active" },
    content: writeMetaNextAction(repointed.content, "Clarified next action."), provenance: { verb: "save", lifecycleAction: "hand-edit" } }));
  expect(lifecycleSuccess(await store.read({ reference: record.reference })).fields).toMatchObject({ pause: expect.objectContaining({ reason: "Wait.", since: "2026-10-14T00:00:00Z" }), workClass: "Novel", design: ["spec-example.md"], currentWorkflow: "generate-tasks" });
});
