/** Store-held materialization supports released, paused and branchless work without a state write. */
import { describe, expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { makeGitProcessError } from "../../../helpers/git-exec-fake.js";
import { runMaterialize } from "../../../../src/lib/work-unit/verbs/materialize.js";
import type { ExecuteTransitionContext } from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { ReconcileWorkUnitWorktreeOp } from "../../../../src/lib/work-unit/mutators/reconcile-work-unit-worktree.js";
import { createDefaultLocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";
import { writeMetaPause, writeMetaOwner, renderMetaFile } from "../../../../src/lib/store/kinds/meta/writers.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";

const tip = "a".repeat(40);
async function harness(options: { branch?: string; remoteOnly?: boolean; offline?: boolean; noBase?: boolean; held?: boolean; paused?: boolean; state?: "Planning" | "Active" | "Integrating" } = {}) {
  const h = createLifecycleHarness();
  let meta = await h.seedMeta("demo", { state: options.state ?? "Planning", owner: "starter", currentWorkflow: options.state === "Integrating" ? "integrate-work-unit" : options.state === "Active" ? "process-task-loop" : "draft-design" }, { kind: "active" }, options.branch === undefined ? undefined : { branches: [{ repository: "repo", ref: options.branch, linkedAs: "created", excluded: [] }] });
  if (options.paused) {
    const content = writeMetaPause(meta.content, { pausedBy: SlugSchema.parse("starter"), since: "2026-10-14T00:00:00Z", reason: "wait", waitsOn: null, resumeNotes: null, open: false });
    await h.store.write({ ...recordPut(meta, { content }), provenance: { verb: "fixture", lifecycleAction: "pause" } });
    meta = lifecycleSuccess(await h.store.read({ reference: meta.reference }));
  }
  const fetches: string[][] = []; let placement: ReconcileWorkUnitWorktreeOp | undefined;
  const ctx: ExecuteTransitionContext = {
    cwd: "/missing-root", store: h.store, projectId: async () => "repo", locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: () => Promise.resolve(options.held ? "/holding" : null) },
    exec: async (_command, args) => {
      const absent = () => { throw makeGitProcessError({ command: "git", args, exitCode: 1, stderr: "not found" }); };
      if (args[0] === "remote") return { stdout: "origin" };
      if (args[0] === "fetch") { fetches.push(args); return options.offline ? absent() : { stdout: "" }; }
      if (args[0] === "ls-remote") return absent();
      if (args[0] === "worktree") return { stdout: `worktree /missing-root\0HEAD ${tip}\0branch refs/heads/main\0\0` };
      if (args.includes("rev-parse")) {
        const ref = (args.at(-1) ?? "").replace(/\^\{commit\}$/u, "");
        if (ref.endsWith("/main")) return options.noBase ? absent() : { stdout: tip };
        if (ref === `refs/heads/${options.branch}`) return options.remoteOnly ? absent() : { stdout: tip };
        if (ref === `refs/remotes/origin/${options.branch}`) return { stdout: tip };
        return absent();
      }
      throw Error(`unexpected Git operation ${args.join(" ")}`);
    },
    indexFs: { readdir: async () => { throw Error("no checkout inventory"); }, readFile: async () => { throw Error("no checkout meta"); } },
    guardValidators: { "worktree-occupancy": () => ({ ok: true }) },
    setPhase: async () => ({ phase: "Planning" }), relocateArtifacts: async () => ({ moved: [] }), reconcileBranch: async () => { throw Error("no lifecycle branch mutation"); },
    reconcileWorkUnitWorktree: async (op) => { placement = op; return { mutation: "spawn", worktreePath: "/spawn", branch: op.mutation === "spawn" ? op.branch ?? null : null }; },
    writeSoftFields: async () => {}, writeBranchField: async () => {}, writeCurrentWorkflowField: async () => {}, writeDesignField: async () => {},
  };
  return { ...h, ctx, meta, state: () => ({ fetches, placement }), read: async () => lifecycleSuccess(await h.store.read({ reference: meta.reference })) };
}
const params = { name: "demo", baseBranch: "main", identity: "starter", spawningIdentity: "starter", locationTemplate: "/spawn", repo: "repo" };
describe("store materialize", () => {
  it.each([false, true])("spawns a branchless Planning work unit detached, paused=%s", async (paused) => {
    const h = await harness({ paused, offline: true });
    expect(await runMaterialize(h.ctx, params)).toMatchObject({ status: "materialized", branch: null });
    expect(h.state().placement).toMatchObject({ detached: true, base: tip });
    expect((await h.read()).version).toEqual(h.meta.version);
    expect(h.state().fetches).toEqual([["fetch", "origin", "+refs/heads/main:refs/remotes/origin/main"]]);
  });
  it.each([false, true])("reattaches a linked checkout with only remote tracking=%s", async (remoteOnly) => {
    const h = await harness({ branch: "feat/demo", remoteOnly, offline: true });
    expect(await runMaterialize(h.ctx, params)).toMatchObject({ status: "materialized", branch: "feat/demo" });
    expect(h.state().placement).toMatchObject({ branch: "feat/demo", createBranch: remoteOnly });
    expect(h.state().fetches).toEqual([["fetch", "origin", "+refs/heads/main:refs/remotes/origin/main"], ["fetch", "origin", "+refs/heads/feat/demo:refs/remotes/origin/feat/demo"]]);
    expect((await h.read()).version).toEqual(h.meta.version);
  });
  it("materializes branchless --here as a marker-only claim", async () => {
    const h = await harness();
    expect(await runMaterialize(h.ctx, { name: "demo", inPlace: true, baseBranch: "main", identity: "starter", spawningIdentity: "starter" })).toMatchObject({ status: "materialized", branch: null });
    expect(h.state().placement).toMatchObject({ inPlace: true, preserveHead: true });
    expect(h.state().fetches).toEqual([]); expect((await h.read()).version).toEqual(h.meta.version);
  });
  it.each(["Planning", "Active", "Integrating"] as const)("gives the held %s checkout an eligible exit", async state => {
    const h = await harness({ held: true, state });
    const result = await runMaterialize(h.ctx, params);
    expect(result).toMatchObject({ status: "rejected", reason: expect.stringContaining("/holding") });
    if (result.status !== "rejected") throw new Error("The checkout must remain held");
    if (state === "Integrating") {
      expect(result.reason).toContain("finish integration, then run arc teardown demo");
      expect(result.reason).not.toContain("arc pause");
    } else expect(result.reason).toContain("arc pause demo --reason <text>, then arc locus release demo");
    expect(h.state().placement).toBeUndefined(); expect(h.state().fetches).toEqual([]);
    expect(await h.read()).toEqual(h.meta);
  });
  it("refuses branchless spawn without any base tip", async () => {
    const h = await harness({ noBase: true });
    expect(await runMaterialize(h.ctx, params)).toMatchObject({ status: "rejected", reason: expect.stringContaining("git branch main <commit>") });
    expect(h.state().placement).toBeUndefined();
  });
  it("resolves a former-name alias before candidate selection and claims the canonical marker name", async () => {
    const h = await harness();
    lifecycleSuccess(await h.store.write({ ...recordPut(h.meta), action: "put", reference: { ...h.meta.reference, owner: { ...h.meta.reference.owner, name: SlugSchema.parse("renamed") } },
      content: renderMetaFile("renamed", { state: "Planning", owner: "starter", workClass: "Light", currentWorkflow: "draft-design" }), provenance: { verb: "rename", lifecycleAction: "rename" } }));
    const primary = await h.read();
    expect(await runMaterialize(h.ctx, { name: "demo", inPlace: true, baseBranch: "main", identity: "starter", spawningIdentity: "starter" })).toMatchObject({ status: "materialized", branch: null });
    expect(h.state().placement).toMatchObject({ wuName: "renamed", inPlace: true, preserveHead: true });
    expect((await h.read()).version).toBe(primary.version);
  });

});

it.each(["listing", "occupancy"])("refuses handover during %s before claiming and permits the new owner to retry", async (when) => {
  const h = await harness();
  const handover = async () => { lifecycleSuccess(await h.store.write({ ...recordPut(h.meta, {
    content: writeMetaOwner(h.meta.content, SlugSchema.parse("successor")) }),
    provenance: { verb: "handover", lifecycleAction: "change-owner" } })); };
  if (when === "listing") {
    const list = h.store.list.bind(h.store); let once = true;
    h.store.list = async (input) => {
      const result = await list(input);
      if (once && input.family === "work-item") { once = false; await handover(); }
      return result;
    };
  } else {
    let once = true;
    h.ctx.guardValidators = { "worktree-occupancy": async () => {
      if (once) { once = false; await handover(); }
      return { ok: true };
    } };
  }
  const request = { name: "demo", inPlace: true as const, identity: "starter", spawningIdentity: "starter" };
  expect(await runMaterialize(h.ctx, request)).toMatchObject({ status: "rejected" });
  expect(h.state().placement).toBeUndefined();
  expect((await h.read()).fields).toMatchObject({ owner: "successor", state: "Planning" });
  expect(await runMaterialize(h.ctx, { ...request, identity: "successor", spawningIdentity: "successor" }))
    .toMatchObject({ status: "materialized" });
});
