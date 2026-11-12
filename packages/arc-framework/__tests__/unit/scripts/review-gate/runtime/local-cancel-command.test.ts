/** Cancellation preserves review provenance through interruption and retry. */
import { expect, it } from "vitest";
import { createLocalReviewPreparationFixture } from "../../../../fixtures/local-review-preparation.js";
import type { ReviewReceiptV2 } from "../../../../../src/scripts/review-gate/core/gate-contract-v2-schema.js";
import { prepareLocalReview } from "../../../../../src/scripts/review-gate/runtime/local-prepare.js";
import { attestLocalReviewCommand } from "../../../../../src/scripts/review-gate/runtime/local-attest-command.js";
import { cancelLocalReviewCommand } from "../../../../../src/scripts/review-gate/runtime/local-cancel-command.js";

const prepareRequest = {
  schemaVersion: 1, evaluatorIdentity: "evaluator-1",
  routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
    ownership: "self", surfaceAuthority: "ordinary" },
};

async function fixture() {
  const local = createLocalReviewPreparationFixture();
  expect(await prepareLocalReview(prepareRequest, local.dependencies)).toMatchObject({ state: "ready" });
  const state = local.published();
  if (state?.kind !== "local-review") throw new Error("expected a prepared local review");
  const receipts: ReviewReceiptV2[] = [];
  let materialized = true;
  const receiptStore = {
    readReceipts: async () => ({ ledgerVersion: receipts.length, receipts: [...receipts] }),
    appendReceipt: async (receipt: ReviewReceiptV2) => {
      const replay = receipts.find((candidate) => candidate.requestId === receipt.requestId);
      if (replay === undefined) receipts.push(receipt);
      else expect(replay).toEqual(receipt);
      return { ledgerVersion: receipts.length, durableEvidenceRef: "receipts/receipt.json" };
    },
  };
  const dependencies = {
    withLocalReviewLock: local.dependencies.withLocalReviewLock,
    operationStore: local.dependencies.operationStore,
    receiptStore,
    releaseMaterialization: async () => { materialized = false; },
    now: local.dependencies.now,
  };
  const result = { status: "complete" as const, result: "clean" as const,
    evaluatorIdentity: state.request.evaluatorIdentity, reviewRunId: "test-run-1", applicabilityId: null, findings: [] };
  const attest = (failLaneWrite = false) => attestLocalReviewCommand({ schemaVersion: 1,
    operationId: state.operationId, result }, {
    ...dependencies,
    operationStore: failLaneWrite ? { ...dependencies.operationStore,
      publishOperation: async () => { throw new Error("interrupted lane publication"); } } : dependencies.operationStore,
    sourceStore: local.dependencies.sourceStore,
    resolveAuthority: async () => (await local.dependencies.resolveAuthority(state.request.evaluatorIdentity)).authority,
    resolveGuidanceDigest: async () => state.guidanceDigest,
    confirmTarget: local.dependencies.confirmTarget,
    inspectMaterialization: async () => "materialized",
  });
  return { local, state, dependencies, receipts, attest,
    materialized: () => materialized,
    request: { schemaVersion: 1, operationId: state.operationId } };
}

it("ends only the dispatch, preserves immutable inputs, and retries in the same logical pass", async () => {
  const f = await fixture();
  const original = structuredClone(f.state);
  expect(await cancelLocalReviewCommand(f.request, f.dependencies)).toMatchObject({ state: "cancelled" });
  expect(f.materialized()).toBe(false);
  expect(f.receipts).toEqual([]);
  expect(f.local.operations.get(f.state.operationId)).toEqual({ version: 1, state: original });
  expect(f.local.laneProgress()).toMatchObject({ completedPasses: 0, attempts: [{
    outcome: "terminal-failure", terminalProducer: false, logicalPass: 1, retryGeneration: 0,
  }] });
  const authority = await f.local.dependencies.resolveAuthority("evaluator-2");
  const renewed = await prepareLocalReview({ ...prepareRequest, evaluatorIdentity: "evaluator-2" }, {
    ...f.local.dependencies,
    resolveAuthority: async () => ({ ...authority, authority: { ...authority.authority, evaluatorIdentity: "evaluator-2" } }),
  });
  expect(renewed).toMatchObject({ state: "ready" });
  const replacement = f.local.published();
  expect(replacement).toMatchObject({ logicalPass: 1, retryGeneration: 1,
    request: { evaluatorIdentity: "evaluator-2" } });
  expect(replacement?.operationId).not.toBe(original.operationId);
  expect(f.local.laneProgress()?.completedPasses).toBe(0);
});

it("preserves a published receipt when its lane update was interrupted", async () => {
  const f = await fixture();
  await expect(f.attest(true)).rejects.toThrow("interrupted lane publication");
  expect(f.receipts).toHaveLength(1);
  expect(f.local.laneProgress()?.attempts[0]?.outcome).toBe("pending");
  const before = structuredClone([...f.local.operations]);
  expect(await cancelLocalReviewCommand(f.request, f.dependencies)).toMatchObject({
    state: "terminal-operation", nextAction: "resume-review",
  });
  expect([...f.local.operations]).toEqual(before);
  expect(f.materialized()).toBe(true);
  expect(f.receipts).toHaveLength(1);
  expect(await f.attest()).toMatchObject({ state: "attested-current" });
  expect(f.local.laneProgress()?.completedPasses).toBe(1);
});

it("persists cancellation before cleanup and safely retries interrupted cleanup", async () => {
  const f = await fixture();
  await expect(cancelLocalReviewCommand(f.request, { ...f.dependencies,
    releaseMaterialization: async () => { throw new Error("cleanup interrupted"); },
  })).rejects.toThrow("cleanup interrupted");
  expect(f.local.laneProgress()).toMatchObject({ completedPasses: 0, attempts: [{ outcome: "terminal-failure" }] });
  expect(f.materialized()).toBe(true);
  const before = structuredClone([...f.local.operations]);
  expect(await cancelLocalReviewCommand(f.request, f.dependencies)).toMatchObject({ state: "terminal-operation" });
  expect([...f.local.operations]).toEqual(before);
  expect(f.materialized()).toBe(false);
  expect(f.receipts).toEqual([]);
});

it("refuses missing admission without effects and succeeds after admission is restored", async () => {
  const f = await fixture();
  const lane = f.local.laneProgress();
  if (lane === null) throw new Error("expected lane owner");
  const record = f.local.operations.get(lane.operationId);
  if (record === undefined) throw new Error("expected lane owner record");
  f.local.operations.delete(lane.operationId);
  await expect(cancelLocalReviewCommand(f.request, f.dependencies)).rejects.toMatchObject({
    code: "corrupt-state", message: "local review operation is not durably admitted",
  });
  expect(f.materialized()).toBe(true);
  expect(f.receipts).toEqual([]);
  expect(f.local.operations.size).toBe(1);
  f.local.operations.set(lane.operationId, record);
  expect(await cancelLocalReviewCommand(f.request, f.dependencies)).toMatchObject({ state: "cancelled" });
});
