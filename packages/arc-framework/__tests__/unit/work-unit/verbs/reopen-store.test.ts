/** Reopening keeps cursor authority while the meta and tasks live outside code history. */
import { describe, expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { writeMetaPause } from "../../../../src/lib/store/kinds/meta/writers.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { ParsedMetaRecordSchema } from "../../../../src/lib/active/meta-schema.js";
import { runReopen } from "../../../../src/lib/work-unit/verbs/reopen.js";
import type { ExecuteTransitionContext } from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { Store } from "../../../../src/lib/store/contract.js";
function ctx(store: Store): ExecuteTransitionContext {
  const forbidden = async (): Promise<never> => { throw new Error("tracked artifact access"); };
  return { cwd: "/repo", store, indexFs: { readdir: forbidden, readFile: forbidden }, setPhase: forbidden,
    relocateArtifacts: forbidden, reconcileBranch: forbidden, reconcileWorkUnitWorktree: forbidden,
    writeSoftFields: forbidden, writeBranchField: forbidden, writeCurrentWorkflowField: forbidden, writeDesignField: forbidden,
    // These cursor fixtures have no live PR; bind its already-complete physical effect explicitly.
    sideEffects: { "withdraw-pr": Object.assign(async () => undefined, { prepareWithdrawal: async () => ({
      name: "withdraw-pr", run: async () => undefined, retryCommand: ["gh", "pr", "close", "feat/example"],
    }) }) } };
}
async function fixture(open: boolean) {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("example", { state: "Integrating", currentWorkflow: "integrate-work-unit", taskList: "tasks-example.md" });
  await h.seed(recordReferences["work-item/task-list"](meta.reference.owner),
    `# Task List: Example\n\n## **Phase 1:** Build\n\n### \`[${open ? " " : "x"}]\` **1.1 Build feature**\n`);
  return { ...h, meta };
}
describe("store reopen", () => {
  it("requires the exact open task and writes workflow without retired task orientation", async () => {
    const h = await fixture(true);
    for (const nextTask of [undefined, "Task 9.1 — Other"]) {
      expect((await runReopen(ctx(h.store), { name: "example", prMerged: false, nextTask })).status).toBe("rejected");
      expect(lifecycleSuccess(await h.store.read({ reference: h.meta.reference }))).toEqual(h.meta);
    }
    expect((await runReopen(ctx(h.store), { name: "example", prMerged: false, nextTask: "Task 1.1 — Build feature" })).status).toBe("reopened");
    const record = lifecycleSuccess(await h.store.read({ reference: h.meta.reference }));
    expect(ParsedMetaRecordSchema.parse(record.fields)).toMatchObject({ state: "Active", currentWorkflow: "process-task-loop", nextTask: null });
    expect((await runReopen(ctx(h.store), { name: "example", prMerged: false })).status).toBe("rejected");
  });
  it("reopens a closed list into preparation and refuses a named closed task", async () => {
    const h = await fixture(false);
    expect((await runReopen(ctx(h.store), { name: "example", prMerged: false, nextTask: "Task 1.1 — Build feature" })).status).toBe("rejected");
    expect((await runReopen(ctx(h.store), { name: "example", prMerged: false })).status).toBe("reopened");
    expect(ParsedMetaRecordSchema.parse(lifecycleSuccess(await h.store.read({ reference: h.meta.reference })).fields)).toMatchObject({ state: "Active", currentWorkflow: "prepare-work-unit" });
  });
});

it("paused reopen returns typed resume before an open cursor's missing-task rejection", async () => {
  const h = await fixture(true);
  lifecycleSuccess(await h.store.write({ action: "put", reference: h.meta.reference, expected: h.meta.version, placement: { kind: "active" },
    content: writeMetaPause(h.meta.content, { pausedBy: SlugSchema.parse("test-user"), since: "2026-10-14T00:00:00Z", reason: "Wait.", waitsOn: null, resumeNotes: null, open: false }),
    provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const paused = lifecycleSuccess(await h.store.read({ reference: h.meta.reference }));
  expect(await runReopen(ctx(h.store), { name: "example", prMerged: false })).toMatchObject({ status: "rejected", remedy: { argv: ["arc", "resume", "example"] } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.meta.reference }))).toEqual(paused);
});
