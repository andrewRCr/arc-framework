/** One atomic terminal transition from every supported operational state, with resumable physical cleanup. */
import { describe, expect, it } from "vitest";
import { createRetirementHarness, retirementLink } from "../../../helpers/store/retirement-harness.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runAbandon, type AbandonContext } from "../../../../src/lib/work-unit/verbs/abandon.js";
import { runTeardown } from "../../../../src/lib/work-unit/verbs/teardown.js";
import { createDefaultLocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";
import { writeMetaPause } from "../../../../src/lib/store/kinds/meta/writers.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
async function fixture(options: Parameters<typeof createRetirementHarness>[0] = {}) {
  const h = await createRetirementHarness({ ...options, ended: false });
  const forbidden = () => { throw Error("no Git-backed lifecycle artifact path"); };
  const ctx: AbandonContext = {
    baseBranch: "main", storeTeardown: h.ctx,
    executor: { cwd: "/repo", store: h.store, exec: h.ctx.exec, projectId: async () => "repo", locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: () => Promise.resolve(options.held ? "/repo" : null) },
      indexFs: h.ctx.indexFs, setPhase: async () => ({ phase: "Planning" }), relocateArtifacts: async () => ({ moved: [] }), reconcileBranch: async () => forbidden(), reconcileWorkUnitWorktree: async () => forbidden(),
      writeSoftFields: async () => forbidden(), writeBranchField: async () => forbidden(), writeCurrentWorkflowField: async () => forbidden(), writeDesignField: async () => forbidden() },
    fs: { readdir: async () => forbidden(), rm: async () => forbidden(), rmdir: async () => forbidden() },
    retirement: { authority: { readSnapshot: async () => forbidden() }, captureSource: async () => forbidden(), stageTransition: async () => forbidden(), rollbackTransition: async () => forbidden(), rollbackRefusedCommit: async () => forbidden(), completeTransition: async () => forbidden(), readTransitionPatch: async () => forbidden() },
    transitionWriter: { record: async () => forbidden(), rollback: async () => forbidden() }, removal: { exec: h.ctx.exec, readMarker: h.ctx.readMarker, folderExists: () => Promise.resolve(true) },
  };
  const batch = h.store.batch.bind(h.store); let batches = 0;
  h.store.batch = (input) => { batches += 1; return batch(input); };
  const lineage = recordReferences["lineage/transition"](h.meta.reference.owner);
  return { ...h, ctx, lineage, batches: () => batches };
}
describe("store abandonment", () => {
  it.each(["stub", "Planning", "Active"] as const)("ends %s with a primary removal and exact lineage in one batch", async (state) => {
    const h = await fixture({ state: state === "stub" ? "Planning" : state, placement: state === "stub" ? { kind: "backlog", commitment: "planned" } : { kind: "active" }, branches: state === "stub" ? [] : undefined });
    expect(await runAbandon(h.ctx, { name: "demo", confirmed: true })).toMatchObject({ status: "abandoned" });
    expect(h.batches()).toBe(1);
    expect(await h.store.read({ reference: h.meta.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const terminal = lifecycleSuccess(await h.store.read({ reference: h.lineage }));
    expect(terminal.fields).toMatchObject({ kind: "abandon", retiredBranches: state === "stub" ? [] : [retirementLink()] });
  });
  it("ends a paused primary through the same one-batch abandonment", async () => {
    const h = await fixture();
    lifecycleSuccess(await h.store.write({ ...recordPut(h.meta, { content: writeMetaPause(h.meta.content,
      { pausedBy: SlugSchema.parse("test-user"), since: "2026-10-14T00:00:00Z", reason: "Wait.", waitsOn: null, resumeNotes: null, open: false }) }),
      provenance: { verb: "pause", lifecycleAction: "pause" } }));
    expect(await runAbandon(h.ctx, { name: "demo", confirmed: true })).toMatchObject({ status: "abandoned" });
    expect(h.batches()).toBe(1);
    expect((await h.store.read({ reference: h.meta.reference })).status).toBe("refused");
    expect(lifecycleSuccess(await h.store.read({ reference: h.lineage })).fields).toMatchObject({ kind: "abandon", retiredBranches: [retirementLink()] });
  });
  it("refuses a dirty spawned checkout before its batch", async () => {
    const h = await fixture({ held: true, spawned: true, dirty: true });
    expect(await runAbandon(h.ctx, { name: "demo", confirmed: true })).toMatchObject({ status: "rejected", reason: expect.stringContaining("personal.txt") });
    expect(h.batches()).toBe(0); expect((await h.store.read({ reference: h.meta.reference })).status).toBe("ok");
  });
  it("releases a dirty anchored checkout and keeps its branch and files", async () => {
    const h = await fixture({ held: true, dirty: true });
    expect(await runAbandon(h.ctx, { name: "demo", confirmed: true })).toMatchObject({ status: "abandoned", notices: expect.arrayContaining([expect.stringContaining("personal.txt")]) });
    expect(h.state().current).toBe("feat/demo"); expect(h.refs.has("refs/heads/feat/demo")).toBe(true);
  });
  it("keeps an adopted branch and names the person's two cleanup steps", async () => {
    const h = await fixture({ held: true, branches: [retirementLink("feat/demo", "adopted")] });
    expect(await runAbandon(h.ctx, { name: "demo", confirmed: true })).toMatchObject({ status: "abandoned", notices: expect.arrayContaining([expect.stringContaining("git switch"), expect.stringContaining("git branch -D feat/demo")]) });
    expect(h.state().current).toBe("feat/demo"); expect(h.refs.has("refs/heads/feat/demo")).toBe(true);
  });
  it("leaves terminal evidence with a typed retry after cleanup fails, and teardown finishes the retry", async () => {
    const h = await fixture();
    const original = h.ctx.storeTeardown!.exec;
    h.ctx.storeTeardown!.exec = async (command, args, options) => { if (args[0] === "push") throw Error("origin offline"); return original(command, args, options); };
    expect(await runAbandon(h.ctx, { name: "demo", confirmed: true })).toMatchObject({ status: "abandoned", outcome: { continuation: { argv: ["arc", "teardown", "demo"] } } });
    expect((await h.store.read({ reference: h.meta.reference })).status).toBe("refused");
    h.ctx.storeTeardown!.exec = original;
    expect(await runTeardown(h.ctx.storeTeardown!, { name: "demo", base: "main" })).toMatchObject({ status: "torn-down", branchDeleted: true });
  });
  it("returns typed teardown continuation when the additional-ref CAS fails after the batch", async () => {
    const h = await fixture({ branches: [retirementLink("chore/demo"), retirementLink()] });
    const teardown = h.ctx.storeTeardown;
    if (teardown === undefined) throw Error("cleanup context is required");
    const original = teardown.execInput;
    teardown.execInput = () => Promise.reject(Error("injected ref transaction failure"));
    expect(await runAbandon(h.ctx, { name: "demo", confirmed: true })).toMatchObject({ status: "abandoned", outcome: { continuation: { argv: ["arc", "teardown", "demo"] } } });
    expect(h.refs.has("refs/heads/chore/demo")).toBe(true);
    teardown.execInput = original;
    expect(await runTeardown(teardown, { name: "demo", base: "main" })).toMatchObject({ status: "torn-down" });
    expect(h.refs.has("refs/heads/chore/demo")).toBe(false);
  });
  it("refuses Integrating and absence of confirmation without a batch", async () => {
    const h = await fixture({ state: "Integrating" });
    expect(await runAbandon(h.ctx, { name: "demo", confirmed: true })).toMatchObject({ status: "rejected", reason: expect.stringContaining("arc reopen") });
    expect(h.batches()).toBe(0);
    const planning = await fixture({ state: "Planning" });
    expect(await runAbandon(planning.ctx, { name: "demo", confirmed: false })).toMatchObject({ status: "rejected" }); expect(planning.batches()).toBe(0);
  });
});
