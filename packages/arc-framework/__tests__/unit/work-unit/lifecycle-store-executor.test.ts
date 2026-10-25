/** Store-backed transitions retain atomic writes and guard authority without checkout files. */
import { boundWorkUnitSubject } from "../../helpers/store/bound-checkout.js";
import { describe, expect, it, onTestFinished } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { executeTransition, type ExecuteTransitionContext } from "../../../src/lib/work-unit/lifecycle-executor.js";
import { readWorkUnit, recordPut, batchLifecycleWrites } from "../../../src/lib/store/lifecycle-write.js";
import { runResumePaused } from "../../../src/lib/work-unit/verbs/pause-handover.js";
import { writeMetaCurrentWorkflow, writeMetaTitle, writeMetaPause } from "../../../src/lib/store/kinds/meta/writers.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../src/lib/kernel/index.js";
import type { Store } from "../../../src/lib/store/contract.js";

import { createClashDouble } from "../../helpers/store/clash-double.js";
import { recordKey } from "../../helpers/store/model.js";
import { OwnerIdentitySchema } from "../../../src/lib/store/identity.js";
import { writeWorktreeOwnershipMarker } from "../../../src/lib/git/worktree-marker.js";
import { makeWorktreeOccupancyGuard } from "../../../src/lib/work-unit/lifecycle-guards.js";
import { resumeStoreTransitionFinalization } from "../../../src/lib/work-unit/lifecycle-store-executor.js";

function context(store: Store): ExecuteTransitionContext {
  const forbidden = async (): Promise<never> => { throw new Error("tracked write fired on the store arm"); };
  return { cwd: "/repo", store, indexFs: { readdir: async () => [], readFile: forbidden },
    setPhase: forbidden, relocateArtifacts: forbidden, reconcileBranch: forbidden,
    reconcileWorkUnitWorktree: forbidden, writeBranchField: forbidden, writeSoftFields: forbidden,
    writeCurrentWorkflowField: forbidden, writeDesignField: forbidden, stageMeta: forbidden,
    sideEffects: { "reconcile-roadmap": forbidden, "reconcile-status-user": forbidden, "user-workspace": forbidden },
  };
}

describe("store transition executor", () => {
  it("promotes a stub through one version-bound batch without any tracked writes", async () => {
    const { store, seedMeta } = createLifecycleHarness();
    const record = await seedMeta("example", { state: "Planning", currentWorkflow: null },
      { kind: "backlog", commitment: "provisional" });
    const result = await executeTransition(context(store), { verb: "promote", slug: "example", inputs: { class: "Light" } });
    expect(result.status).toBe("ok");
    const next = lifecycleSuccess(await store.read({ reference: record.reference }));
    expect(next.placement).toEqual({ kind: "backlog", commitment: "planned" });
    expect(next.content).toBe(record.content);
    const history = lifecycleSuccess(await store.history({ reference: record.reference }));
    expect(history[0]?.provenance).toMatchObject({ verb: "promote", lifecycleAction: "promote" });
    expect(next.version).not.toBe(record.version);
  });

  it("leaves every record unchanged when the Class guard refuses", async () => {
    const { store, seedMeta } = createLifecycleHarness();
    const record = await seedMeta("example", { state: "Planning", currentWorkflow: null, workClass: "TBD" },
      { kind: "backlog", commitment: "provisional" });
    const result = await executeTransition(context(store), { verb: "promote", slug: "example", inputs: { class: "TBD" } });
    expect(result).toMatchObject({ status: "rejected", stage: "guard" });
    expect(lifecycleSuccess(await store.read({ reference: record.reference }))).toEqual(record);
  });
  it("refuses a caller primary belonging to another subject before changing either record", async () => {
    const { store, seedMeta } = createLifecycleHarness();
    const selected = await seedMeta("example", { state: "Planning", currentWorkflow: null },
      { kind: "backlog", commitment: "provisional" });
    const other = await seedMeta("other", { state: "Planning", currentWorkflow: null },
      { kind: "backlog", commitment: "provisional" });
    const result = await executeTransition(context(store), { verb: "promote", slug: "example",
      inputs: { class: "Light", storeTransition: { primary: other } } });
    expect(result).toMatchObject({ status: "rejected", stage: "inputs" });
    expect(lifecycleSuccess(await store.read({ reference: selected.reference }))).toEqual(selected);
    expect(lifecycleSuccess(await store.read({ reference: other.reference }))).toEqual(other);
  });

});

for (const fixture of [
  { verb: "activate", state: "Planning", currentWorkflow: "draft-design" },
  { verb: "deactivate", state: "Active", currentWorkflow: "process-task-loop" },
  { verb: "publish", state: "Active", currentWorkflow: "process-task-loop" },
  { verb: "reopen", state: "Integrating", currentWorkflow: "integrate-work-unit" },
  { verb: "archive", state: "Active", currentWorkflow: "process-task-loop" },
] as const) {
  it(`refuses paused ${fixture.verb} with typed resume action even when an injected guard passes`, async () => {
    const { store, seedMeta } = createLifecycleHarness();
    const record = await seedMeta("example", { state: fixture.state, currentWorkflow: fixture.currentWorkflow });
    lifecycleSuccess(await store.write({ action: "put", reference: record.reference, expected: record.version, placement: { kind: "active" },
      content: writeMetaPause(record.content, { pausedBy: SlugSchema.parse("test-user"), since: "2026-10-14T00:00:00Z", reason: "Wait.", waitsOn: null, resumeNotes: null, open: false }),
      provenance: { verb: "pause", lifecycleAction: "pause" } }));
    const paused = lifecycleSuccess(await store.read({ reference: record.reference }));
    const result = await executeTransition({ ...context(store), guardValidators: { unpaused: async () => ({ ok: true }) } },
      { verb: fixture.verb, slug: "example", inputs: {} });
    expect(result).toMatchObject({ status: "rejected", stage: "guard", remedy: { argv: ["arc", "resume", "example"] } });
    expect(lifecycleSuccess(await store.read({ reference: record.reference }))).toEqual(paused);
  });
}

it("refuses a concurrent pause between admission reads and publication, then resumes successfully after repair", async () => {
  const h = createLifecycleHarness(); const original = await h.seedMeta("example");
  let injected = false;
  const store: Store = new Proxy(h.store, { get(target, key) {
    if (key === "read") return async (input: Parameters<Store["read"]>[0]) => {
    const read = await h.store.read(input);
    if (!injected && read.status === "ok" && input.reference.kind === "work-item/meta") {
      injected = true;
      lifecycleSuccess(await batchLifecycleWrites(h.store, [recordPut(read.result, { content: writeMetaPause(read.result.content, {
        pausedBy: SlugSchema.parse("test-user"), since: "2026-10-14T00:00:00Z", reason: "Concurrent pause", waitsOn: null, resumeNotes: null, open: false,
      }) })], { verb: "pause", lifecycleAction: "pause" }));
    }
    return read;
    };
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const params = { verb: "publish" as const, slug: "example", inputs: { softFields: { nextAction: "Continue integration" } } };
  expect(await executeTransition(context(store), params)).toMatchObject({ status: "rejected" });
  const paused = lifecycleSuccess(await h.store.read({ reference: original.reference }));
  expect(paused.fields).toMatchObject({ state: "Active", pause: { reason: "Concurrent pause" } });
  expect(await runResumePaused({ store: h.store, cwd: "/repo", baseBranch: "main", exec: async () => { throw Error("No Git needed"); } }, { name: "example" }))
    .toMatchObject({ status: "resumed" });
  expect(await executeTransition(context(store), params)).toMatchObject({ status: "ok" });
  expect(lifecycleSuccess(await h.store.read({ reference: original.reference })).fields).toMatchObject({ state: "Integrating", pause: null });
});

it("promotes the live holder when an archived namesake was listed first", async () => {
  const h = createLifecycleHarness();
  const old = await h.seedMeta("shared", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const live = await h.seedMeta("shared", { state: "Planning", currentWorkflow: null },
    { kind: "backlog", commitment: "provisional" });
  expect(await executeTransition(context(h.store), { verb: "promote", slug: "shared", inputs: { class: "Light" } }))
    .toMatchObject({ status: "ok" });
  expect(lifecycleSuccess(await h.store.read({ reference: live.reference })).placement).toEqual({ kind: "backlog", commitment: "planned" });
  expect(lifecycleSuccess(await h.store.read({ reference: old.reference }))).toEqual(old);
});

it("starts a former-name operand in its current holder's checkout through the occupancy guard", async () => {
  const h = createLifecycleHarness();
  const former = await h.seedMeta("former", { state: "Planning", currentWorkflow: null },
    { kind: "backlog", commitment: "planned" });
  const renamed = lifecycleSuccess(await h.store.write({ ...recordPut(former, { content: writeMetaTitle(former.content, SlugSchema.parse("current")) }),
    reference: { ...former.reference, owner: OwnerIdentitySchema.parse({ ...former.reference.owner, name: "current" }) },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  const cwd = await mkdtemp(join(tmpdir(), "arc-executor-alias-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, createdFor: boundWorkUnitSubject(renamed), spawningIdentity: "test-user" });
  const ctx = { ...context(h.store), cwd, guardValidators: { "worktree-occupancy": makeWorktreeOccupancyGuard({ cwd, store: h.store,
    readActiveMetaCandidates: async () => { throw Error("Store occupancy must use its marker"); } }) } };
  const outcome = await executeTransition(ctx, { verb: "start", slug: "former", inputs: { class: "Light", currentWorkflowOverride: "draft-design", storeTransition: {
    gitSteps: [{ name: "start-checkout", retryCommand: ["arc", "start", "current"], run: async () => {}, rollback: async () => {} }],
  } } });
  expect(outcome, JSON.stringify(outcome)).toMatchObject({ status: "ok" });
  expect(lifecycleSuccess(await h.store.read({ reference: renamed.reference })).placement).toEqual({ kind: "active" });
});

it("retains the store's candidates when the subject name is clashed", async () => {
  const h = createLifecycleHarness();
  const first = await h.seedMeta("first"), second = await h.seedMeta("second");
  const store = createClashDouble(h.store, { slug: "clashed", holders: [first.reference, second.reference] });
  expect(await executeTransition(context(store), { verb: "promote", slug: "clashed", inputs: { class: "Light" } }))
    .toMatchObject({ status: "rejected", stage: "store", refusal: { code: "ambiguous-match", candidates: [
      { ...first.reference, owner: { ...first.reference.owner, name: "clashed" } },
      { ...second.reference, owner: { ...second.reference.owner, name: "clashed" } },
    ] } });
});

it("keeps a prepared primary after the name becomes clashed during the verb", async () => {
  const h = createLifecycleHarness();
  const first = await h.seedMeta("shared", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "provisional" });
  const second = await h.seedMeta("second");
  const store = createClashDouble(h.store, { slug: "shared", holders: [first.reference, second.reference], mode: "mid-verb" });
  const primary = lifecycleSuccess(await readWorkUnit(store, "shared"));
  expect(await executeTransition(context(store), { verb: "promote", slug: "shared", inputs: { class: "Light", storeTransition: { primary } } }))
    .toMatchObject({ status: "ok" });
  expect(lifecycleSuccess(await h.store.read({ reference: first.reference })).placement).toEqual({ kind: "backlog", commitment: "planned" });
  expect(lifecycleSuccess(await h.store.read({ reference: second.reference }))).toEqual(second);
});

it("resumes finalization from the live namesake's inconsistent stored tuple", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("shared", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const live = await h.seedMeta("shared");
  const saved = h.store.state.records.get(recordKey(live.reference));
  if (saved === undefined) throw Error("Missing live holder");
  saved.content = writeMetaCurrentWorkflow(live.content, "integrate-work-unit");
  expect(await resumeStoreTransitionFinalization({ ...context(h.store), store: h.store }, "shared"))
    .toMatchObject({ status: "rejected", stage: "store", message: expect.stringContaining('Current Workflow "integrate-work-unit"') });
});
