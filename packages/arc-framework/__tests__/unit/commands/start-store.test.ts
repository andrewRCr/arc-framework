/** Store-backed graduation preserves the caller's Git coordinate and changes only operational state. */
import { describe, expect, it } from "vitest";
import { runGraduate } from "../../../src/commands/start.js";
import type { ExecuteTransitionContext } from "../../../src/lib/work-unit/lifecycle-executor.js";
import type { ReconcileWorkUnitWorktreeOp } from "../../../src/lib/work-unit/mutators/reconcile-work-unit-worktree.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import { runStoreRename } from "../../../src/lib/work-unit/verbs/rename-store.js";

import { recordReferences } from "../../../src/lib/store/identity.js";
import { writeMetaClass } from "../../../src/lib/store/kinds/meta/writers.js";
import { runStub } from "../../../src/lib/work-unit/verbs/stub.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";

async function harness(refuse = false) {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("demo", { state: "Planning", owner: "previous", workClass: "Novel", currentWorkflow: "draft-design" }, { kind: "backlog", commitment: "planned" });
  let occupation: ReconcileWorkUnitWorktreeOp | undefined;
  let occupied = false;
  const ctx: ExecuteTransitionContext = {
    cwd: "/repo", store: h.store, guardValidators: { "worktree-occupancy": () => ({ ok: true }) },
    exec: async (_command, args) => {
      if (args[0] === "rev-parse") return { stdout: "a".repeat(40) };
      if (args[0] === "symbolic-ref") return { stdout: "refs/heads/person" };
      if (args.join(" ") === "worktree remove --force /spawn") { occupied = false; return { stdout: "" }; }
      throw Error(`unexpected Git mutation ${args.join(" ")}`);
    },
    indexFs: { readdir: async () => { throw Error("no checkout inventory"); }, readFile: async () => { throw Error("no checkout meta"); } },
    setPhase: async () => ({ phase: "Planning" }), relocateArtifacts: async () => ({ moved: [] }), reconcileBranch: async () => { throw Error("no branch"); },
    reconcileWorkUnitWorktree: async (op) => { occupation = op; occupied = true; return { mutation: "spawn", worktreePath: op.mutation === "spawn" && op.inPlace ? "/repo" : "/spawn", branch: null }; },
    writeSoftFields: async () => {}, writeBranchField: async () => {}, writeCurrentWorkflowField: async () => {}, writeDesignField: async () => {},
  };
  if (refuse) h.store.batch = () => Promise.resolve({ status: "refused", refusal: { code: "version-conflict", class: "recoverable", condition: "Moved concurrently", records: [meta.reference], remedy: { text: "Retry start" } } });
  return { ...h, ctx, meta, state: () => ({ occupation, occupied }), read: async () => lifecycleSuccess(await h.store.read({ reference: meta.reference })) };
}

describe("store start graduation", () => {
  it("graduates a retained former name as the same renamed work item", async () => {
    const h = await harness();
    expect(await runStoreRename({ store: h.store, cwd: "/repo", exec: h.ctx.exec!, baseBranch: "main" },
      { sourceSlug: "demo", targetSlug: "current" })).toMatchObject({ status: "renamed" });
    expect(await runGraduate(h.ctx, { name: "demo", spawningIdentity: "starter", baseBranch: "main", locationTemplate: "../{repo}.{name}", repo: "repo" }))
      .toMatchObject({ status: "graduated", previousOwner: "previous" });
    const alias = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("demo") }));
    const canonical = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("current") }));
    expect(alias.reference).toEqual(canonical.reference);
    expect(lifecycleSuccess(await h.store.read({ reference: canonical.reference })))
      .toMatchObject({ placement: { kind: "active" }, fields: { owner: "starter" } });
  });
  it("starts another person's stub detached and reports the previous owner", async () => {
    const h = await harness();
    const result = await runGraduate(h.ctx, { name: "demo", spawningIdentity: "starter", baseBranch: "main", locationTemplate: "../{repo}.{branch}", repo: "repo" });
    expect(result).toMatchObject({ status: "graduated", branch: null, previousOwner: "previous", worktreePath: "/spawn" });
    expect(h.state().occupation).toMatchObject({ mutation: "spawn", detached: true, base: "main" });
    expect(h.state().occupation).not.toHaveProperty("branch");
    const read = await h.read();
    expect(parseMetaRecord(read.content)).toMatchObject({ owner: "starter", workClass: "Novel", state: "Planning", branch: null });
    expect(read.placement).toEqual({ kind: "active" }); expect(read.links?.branches ?? []).toEqual([]);
  });
  it("occupies here without requiring any base, branch, or legacy certificate", async () => {
    const h = await harness();
    expect(await runGraduate(h.ctx, { name: "demo", inPlace: true, spawningIdentity: "starter" })).toMatchObject({ status: "graduated", branch: null });
    expect(h.state().occupation).toMatchObject({ inPlace: true, preserveHead: true });
    expect(h.state().occupation).not.toHaveProperty("branch");
  });
  it("rolls a detached spawn back when its version-bound batch refuses", async () => {
    const h = await harness(true);
    expect(await runGraduate(h.ctx, { name: "demo", spawningIdentity: "starter", baseBranch: "main", locationTemplate: "../{repo}.{name}", repo: "repo" })).toMatchObject({ status: "rejected", reason: expect.stringContaining("Moved concurrently") });
    expect(h.state().occupied).toBe(false);
    expect((await h.read()).version).toEqual(h.meta.version);
  });
});

it("refuses a conflicting start Class before checkout occupation and accepts the recorded Class on retry", async () => {
  const h = await harness();
  const params = { name: "demo", inPlace: true as const, spawningIdentity: "starter" };
  expect(await runGraduate(h.ctx, { ...params, cls: "Light" }))
    .toMatchObject({ status: "rejected", reason: expect.stringContaining("conflicts") });
  expect(h.state()).toEqual({ occupation: undefined, occupied: false });
  expect(await h.read()).toEqual(h.meta);
  expect(await runGraduate(h.ctx, { ...params, cls: "Novel" })).toMatchObject({ status: "graduated" });
  expect((await h.read()).fields).toMatchObject({ workClass: "Novel", owner: "starter" });
});

it("refuses mixed inventory and primary versions before occupation and retries with the current Class", async () => {
  const h = await harness(), list = h.store.list.bind(h.store);
  let raced = false;
  h.store.list = async (input) => {
    const result = await list(input);
    if (!raced && input.family === "work-item") {
      raced = true;
      lifecycleSuccess(await h.store.write({ ...recordPut(h.meta, { content: writeMetaClass(h.meta.content, "Light") }),
        provenance: { verb: "set-class", lifecycleAction: "set-class" } }));
    }
    return result;
  };
  const params = { name: "demo", inPlace: true as const, spawningIdentity: "starter" };
  expect(await runGraduate(h.ctx, params)).toMatchObject({ status: "rejected", reason: expect.stringContaining("changed") });
  expect(h.state()).toEqual({ occupation: undefined, occupied: false });
  expect((await h.read()).fields).toMatchObject({ owner: "previous", workClass: "Light" });
  expect(await runGraduate(h.ctx, params)).toMatchObject({ status: "graduated", previousOwner: "previous" });
  expect((await h.read()).fields).toMatchObject({ owner: "starter", workClass: "Light" });
});


it.each([false, true])("graduates a newly created stub with a valid planning tuple, here=%s", async (inPlace) => {
  const h = await harness();
  const created = await runStub({ executor: h.ctx, fs: {
    mkdir: async () => { throw Error("no tracked scaffold"); },
    writeFile: async () => { throw Error("no tracked scaffold"); },
  } }, { name: "fresh", commitment: "planned", priority: "P1", owner: "previous", cls: "Light" });
  expect(created, JSON.stringify(created)).toMatchObject({ status: "scaffolded" });
  const before = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("fresh") }));
  expect(lifecycleSuccess(await h.store.read({ reference: before.reference })).fields)
    .toMatchObject({ currentWorkflow: null });
  expect(await runGraduate(h.ctx, { name: "fresh", inPlace, spawningIdentity: "starter", baseBranch: "main",
    locationTemplate: "../{repo}.{name}", repo: "repo" })).toMatchObject({ status: "graduated" });
  expect(lifecycleSuccess(await h.store.read({ reference: before.reference })))
    .toMatchObject({ placement: { kind: "active" }, fields: { state: "Planning", currentWorkflow: "draft-design",
      nextAction: "[begin current workflow]", owner: "starter" } });
});


it("derives graduation's planning stage from the stored spec pointer", async () => {
  const h = await harness();
  const meta = await h.seedMeta("specified", { state: "Planning", currentWorkflow: null,
    design: ["spec-specified.md"] }, { kind: "backlog", commitment: "planned" });
  await h.seed(recordReferences["work-item/spec"](meta.reference.owner), "# Specification\n");
  expect(await runGraduate(h.ctx, { name: "specified", spawningIdentity: "starter", baseBranch: "main",
    locationTemplate: "../{repo}.{name}", repo: "repo" })).toMatchObject({ status: "graduated" });
  expect(lifecycleSuccess(await h.store.read({ reference: meta.reference })).fields)
    .toMatchObject({ state: "Planning", currentWorkflow: "generate-tasks",
      design: ["spec-specified.md"], nextAction: "[begin current workflow]" });
});
