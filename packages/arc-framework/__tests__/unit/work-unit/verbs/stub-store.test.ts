/** Creation fields persist through the store and do not touch checkout artifact files. */
import { describe, expect, it } from "vitest";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStub } from "../../../../src/lib/work-unit/verbs/stub.js";
import type { ExecuteTransitionContext } from "../../../../src/lib/work-unit/lifecycle-executor.js";
import { parseMetaRecord } from "../../../../src/lib/active/meta-reader.js";

function context() {
  const h = createLifecycleHarness();
  const executor: ExecuteTransitionContext = {
    cwd: "/repo", store: h.store,
    indexFs: { readdir: async () => { throw Error("no checkout inventory"); }, readFile: async () => { throw Error("no checkout meta"); } },
    setPhase: async () => ({ phase: "Planning" }), relocateArtifacts: async () => ({ moved: [] }), reconcileBranch: async () => { throw Error("no branch"); },
    reconcileWorkUnitWorktree: async () => { throw Error("stub occupies no checkout"); },
    writeSoftFields: async () => {}, writeBranchField: async () => {}, writeCurrentWorkflowField: async () => {}, writeDesignField: async () => {},
  };
  return { ...h, ctx: { executor, fs: { mkdir: async () => { throw Error("no directories"); }, writeFile: async () => { throw Error("no files"); } } } };
}
describe("store stub", () => {
  it.each(["planned", "provisional"] as const)("creates a %s stub with explicit creation fields", async (commitment) => {
    const h = context();
    expect(await runStub(h.ctx, { name: "demo", commitment, priority: "P1", owner: "starter", cls: "Novel", origin: "#42", design: "draft-demo.md" })).toMatchObject({ status: "scaffolded" });
    const lookup = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("demo") }));
    const read = lifecycleSuccess(await h.store.read({ reference: lookup.reference }));
    expect(read.placement).toEqual({ kind: "backlog", commitment });
    expect(parseMetaRecord(read.content)).toMatchObject({ owner: "starter", priority: "P1", workClass: "Novel", design: ["draft-demo.md"], origin: "#42", branch: null });
    expect(read.links?.branches ?? []).toEqual([]);
  });
  it("retains the requires-planned boundary for a provisional cohort member", async () => {
    const h = context();
    expect(await runStub(h.ctx, { name: "demo", commitment: "provisional", priority: "P1", owner: "starter", cohort: "cohort" })).toMatchObject({ status: "rejected", reason: expect.stringContaining("requires") });
    expect(lifecycleSuccess(await h.store.list({ family: "work-item" })).status).toBe("absent");
  });
});
