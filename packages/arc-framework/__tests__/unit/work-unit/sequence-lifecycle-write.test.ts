/** Atomic persistence remains distinct from rollback and retryable physical cleanup. */
import { describe, expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { batchLifecycleWrites, recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { writeMetaCurrentWorkflow, writeMetaNextAction } from "../../../src/lib/store/kinds/meta/writers.js";
import { sequenceLifecycleWrite } from "../../../src/lib/work-unit/sequence-lifecycle-write.js";

describe("lifecycle write sequence", () => {
  it("undoes preparatory occupation when the checked batch refuses", async () => {
    const h = createLifecycleHarness(), meta = await h.seedMeta("example");
    let occupied = false;
    const result = await sequenceLifecycleWrite({ side: "before", steps: [{ name: "occupy",
      run: async () => { occupied = true; }, rollback: async () => { occupied = false; }, retryCommand: ["arc", "start", "example"] }],
      write: () => batchLifecycleWrites(h.store, [recordPut(meta, { content: writeMetaCurrentWorkflow(meta.content, "create-spec") })],
        { verb: "set-stage", lifecycleAction: "set-stage" }) });
    expect(result.status).toBe("refused");
    expect(occupied).toBe(false);
    expect(lifecycleSuccess(await h.store.read({ reference: meta.reference }))).toEqual(meta);
  });

  it("keeps the persisted record and returns the failed physical continuation", async () => {
    const h = createLifecycleHarness(), meta = await h.seedMeta("example");
    let removed = false;
    const step = { name: "remove", run: async () => { if (!removed) throw new Error("checkout locked"); },
      retryCommand: ["arc", "teardown", "example"] };
    const result = await sequenceLifecycleWrite({ side: "after", steps: [step],
      write: () => batchLifecycleWrites(h.store, [recordPut(meta, { content: writeMetaNextAction(meta.content, "Finished") })],
        { verb: "archive", lifecycleAction: "archive" }) });
    expect(result).toMatchObject({ status: "written", continuation: { step: "remove", argv: ["arc", "teardown", "example"] } });
    expect(lifecycleSuccess(await h.store.read({ reference: meta.reference })).content).toContain("Next Action:** Finished");
    removed = true;
    await step.run();
    expect(removed).toBe(true);
  });
});
