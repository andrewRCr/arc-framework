/** Store engine admission and finalization inspect complete logical record state. */
import { expect, it } from "vitest";
import { executeTransition, resumeTransitionFinalization, type ExecuteTransitionContext } from "../../../src/lib/work-unit/lifecycle-executor.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { buildStoreCurrentWuReconcile } from "../../../src/lib/work-unit/store-current-wu-reconcile.js";
import { renderMetaFile, writeMetaCurrentWorkflow, writeMetaPause } from "../../../src/lib/store/kinds/meta/writers.js";
import { recordReferences, OwnerIdentitySchema } from "../../../src/lib/store/identity.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { recordKey } from "../../helpers/store/model.js";
import type { Store } from "../../../src/lib/store/contract.js";
function context(store: Store): ExecuteTransitionContext {
  const forbidden = async (): Promise<never> => { throw new Error("Tracked metadata seam fired"); };
  return { cwd: "/repo", store, indexFs: { readFile: forbidden, readdir: forbidden }, setPhase: forbidden,
    reconcileBranch: forbidden, reconcileWorkUnitWorktree: forbidden, relocateArtifacts: forbidden, writeBranchField: forbidden,
    writeSoftFields: forbidden, writeCurrentWorkflowField: forbidden, writeDesignField: forbidden, stageMeta: forbidden };
}
it("refuses a write-driving inventory naming malformed other meta, then proceeds when it parses", async () => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("example", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "provisional" });
  const other = await h.seedMeta("broken");
  const saved = h.store.state.records.get(recordKey(other.reference)); if (saved === undefined) throw new Error("Missing fixture record");
  saved.content = "not metadata";
  const params = { verb: "promote" as const, slug: "example", inputs: { class: "Light" } };
  const blocked = await executeTransition(context(h.store), params);
  expect(blocked).toMatchObject({ status: "rejected", stage: "guard", message: expect.stringContaining("broken") });
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(primary);
  saved.content = other.content;
  expect(await executeTransition(context(h.store), params)).toMatchObject({ status: "ok" });
});
it("refuses unreadable inventory without writes", async () => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("example", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "provisional" });
  h.store.state.unreadable.add("work-item");
  expect(await executeTransition(context(h.store), { verb: "promote", slug: "example", inputs: { class: "Light" } }))
    .toMatchObject({ status: "rejected", message: expect.stringContaining("family index cannot be read") });
  h.store.state.unreadable.clear(); expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(primary);
});
it("reads resumed workflow from the record and rejects a malformed tuple without using projected paths", async () => {
  const h = createLifecycleHarness(); const primary = await h.seedMeta("example");
  const saved = h.store.state.records.get(recordKey(primary.reference)); if (saved === undefined) throw new Error("Missing fixture record");
  saved.content = writeMetaCurrentWorkflow(primary.content, "integrate-work-unit");
  const malformed = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  expect(await resumeTransitionFinalization(context(h.store), { verb: "publish", slug: "example", inputs: {} }))
    .toMatchObject({ status: "rejected", stage: "store", message: expect.stringContaining("workflow") });
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(malformed);
  saved.content = primary.content;
  expect(await resumeTransitionFinalization(context(h.store), { verb: "publish", slug: "example", inputs: {} })).toBeNull();
});
it("a coherent subject already past the edge rejects through lookup rather than throwing", async () => {
  const h = createLifecycleHarness(); await h.seedMeta("example", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
  expect(await resumeTransitionFinalization(context(h.store), { verb: "publish", slug: "example", inputs: {} })).toBeNull();
  expect(await executeTransition(context(h.store), { verb: "publish", slug: "example", inputs: {} })).toMatchObject({ status: "rejected", stage: "lookup" });
});
it("requires Next Action and declared Git steps before any activation write", async () => {
  const h = createLifecycleHarness(); const primary = await h.seedMeta("example", { state: "Planning", currentWorkflow: "draft-design" });
  expect(await executeTransition(context(h.store), { verb: "activate", slug: "example", inputs: {} }))
    .toMatchObject({ status: "rejected", stage: "inputs", message: expect.stringContaining("Next Action") });
  expect(await executeTransition(context(h.store), { verb: "activate", slug: "example", inputs: { softFields: { nextAction: "Implement." } } }))
    .toMatchObject({ status: "rejected", stage: "inputs", message: expect.stringContaining("Git steps") });
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(primary);
});
it("rejects a mismatched creation and a supplied primary on an absent-item creation", async () => {
  const h = createLifecycleHarness(); const unrelated = await h.seedMeta("other");
  const create = { action: "put" as const, reference: recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "wrong" })), expected: null,
    content: renderMetaFile("wrong", { state: "Planning", owner: "test-user", workClass: "Light", currentWorkflow: null }), placement: { kind: "backlog" as const, commitment: "planned" as const } };
  const common = { verb: "stub" as const, slug: "example", inputs: { commitment: "planned" as const,
    softFields: { nextAction: "Design." }, storeTransition: { create } } };
  expect(await executeTransition(context(h.store), common)).toMatchObject({ status: "rejected", stage: "inputs" });
  const sameTarget = { ...create, reference: recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" })),
    content: renderMetaFile("example", { state: "Planning", owner: "test-user", workClass: "Light", currentWorkflow: null }) };
  expect(await executeTransition(context(h.store), { ...common, inputs: { ...common.inputs, storeTransition: { ...common.inputs.storeTransition, create: sameTarget, primary: unrelated } } }))
    .toMatchObject({ status: "rejected", stage: "inputs" });
  expect(lifecycleSuccess(await h.store.read({ reference: unrelated.reference }))).toEqual(unrelated);
});

it.each([true, false])("paused reconcile prepare proceeds but apply refuses even when edits=%s", async (edits) => {
  const h = createLifecycleHarness();
  if (edits) await h.seedMeta("done", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
  const primary = await h.seedMeta("example", { dependsOn: edits ? ["done"] : [] });
  lifecycleSuccess(await h.store.write({ action: "put", reference: primary.reference, expected: primary.version, placement: { kind: "active" },
    content: writeMetaPause(primary.content, { pausedBy: SlugSchema.parse("test-user"), since: "2026-10-14T00:00:00Z", reason: "Wait.", waitsOn: null, resumeNotes: null, open: false }),
    provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const paused = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  const ceremony = buildStoreCurrentWuReconcile(h.store);
  const prepared = await ceremony.prepare({ slug: "example", metaPath: ".arc/active/meta-example.md" });
  expect(prepared.status).toBe(edits ? "pending" : "clean");
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(paused);
  expect(await ceremony.apply(prepared.prepared)).toMatchObject({ status: "conflict", remedy: { argv: ["arc", "resume", "example"] } });
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference }))).toEqual(paused);
});
