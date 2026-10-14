/** Store-backed graduation preserves the caller's Git coordinate and changes only operational state. */
import { describe, expect, it } from "vitest";
import { runGraduate } from "../../../src/commands/start.js";
import type { ExecuteTransitionContext } from "../../../src/lib/work-unit/lifecycle-executor.js";
import type { ReconcileWorkUnitWorktreeOp } from "../../../src/lib/work-unit/mutators/reconcile-work-unit-worktree.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import { runStoreRename } from "../../../src/lib/work-unit/verbs/rename-store.js";

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
