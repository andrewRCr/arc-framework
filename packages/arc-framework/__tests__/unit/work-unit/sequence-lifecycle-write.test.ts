/** Atomic persistence remains distinct from rollback and retryable physical cleanup. */
import { describe, expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { batchLifecycleWrites, recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { writeMetaCurrentWorkflow, writeMetaNextAction } from "../../../src/lib/store/kinds/meta/writers.js";
import { occupyStoreGraduation, type StoreGraduationOccupation } from "../../../src/lib/work-unit/atomic-graduation.js";
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

it.each(["prepare", "write", "refusal"])("retains every failed inverse after %s failure and permits a repaired retry", async (failure) => {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("example", { state: "Planning", currentWorkflow: "draft-design" },
    { kind: "backlog", commitment: "planned" });
  let repaired = false, occupied = false;
  const request = { side: "before" as const, steps: [
    { name: "occupy", run: async () => { occupied = true; }, rollback: async () => {
      if (!repaired) throw Error("marker generation changed"); occupied = false;
    }, retryCommand: ["arc", "start", "example"] },
    { name: "provision", run: async () => { if (!repaired && failure === "prepare") throw Error("provision failed"); },
      rollback: async () => { if (!repaired) throw Error("cleanup locked"); }, retryCommand: ["arc", "start", "example"] },
  ], write: async () => {
    if (!repaired && failure === "write") throw Error("store unavailable");
    if (!repaired && failure === "refusal") return { status: "refused" as const, refusal: {
      code: "version-conflict" as const, class: "recoverable" as const, records: [meta.reference],
      condition: "Version moved", remedy: { text: "Re-read and retry" },
    } };
    return batchLifecycleWrites(h.store, [recordPut(meta, { placement: { kind: "active" } })],
      { verb: "start", lifecycleAction: "start" });
  } };
  const result = await sequenceLifecycleWrite(request);
  expect(result).toMatchObject({ status: failure === "refusal" ? "refused" : "failed", recovery: {
    kind: "rollback", failures: [{ step: "provision", reason: expect.stringContaining("cleanup locked") },
      { step: "occupy", reason: expect.stringContaining("marker generation changed") }],
    inspect: [["arc", "locus", "--json"], ["git", "worktree", "list", "--porcelain"]],
    repair: expect.stringContaining("owner"), retryAfterRepair: [["arc", "start", "example"]],
  } });
  expect(occupied).toBe(true);
  expect(lifecycleSuccess(await h.store.read({ reference: meta.reference }))).toEqual(meta);
  repaired = true;
  expect(await sequenceLifecycleWrite(request)).toMatchObject({ status: "written" });
  expect(lifecycleSuccess(await h.store.read({ reference: meta.reference })).placement).toEqual({ kind: "active" });
});


it("retains compensation when occupation itself fails before returning its receipt", async () => {
  let receipt: StoreGraduationOccupation | undefined, reads = 0;
  const foreignMarker = Buffer.from("concurrent owner generation");
  const result = await sequenceLifecycleWrite({ side: "before", steps: [{ name: "occupy", retryCommand: ["arc", "start", "demo", "--here"],
    run: async () => { receipt = await occupyStoreGraduation({ cwd: "/repo", inPlace: true,
      exec: async (_command, args) => ({ stdout: args[0] === "rev-parse" ? (++reads === 1 ? "a" : "b").repeat(40) : "refs/heads/person" }),
      occupy: async () => ({ mutation: "spawn", branch: null, worktreePath: "/repo", markerGeneration: Buffer.from("original generation") }),
      removeMarker: async (_cwd, expected) => expected.equals(foreignMarker) ? { kind: "removed" } : { kind: "generation-mismatch" },
      onOccupied: (prepared) => { receipt = prepared; },
    }); }, rollback: async () => { await receipt?.rollback(); },
  }], write: async () => { throw Error("physical preparation must finish before a write"); } });
  expect(result).toMatchObject({ status: "failed", recovery: { kind: "rollback",
    failures: [{ step: "occupy", reason: expect.stringContaining("marker generation") }],
    retryAfterRepair: [["arc", "start", "demo", "--here"]],
  } });
  expect(foreignMarker.toString()).toBe("concurrent owner generation");
});
