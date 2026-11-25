/** Native receipt publication retains immutable outcome references and leaves the old ledger inert. */
import { expect, it, onTestFinished } from "vitest";
import { nativeLocalReview } from "../../../../fixtures/native-local-review.js";
import { createReviewReceipt } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { LocalForwardReviewReceiptStore } from "../../../../../src/scripts/review-gate/hosts/local/receipt-store.js";
import { attestLocalReviewCommand } from "../../../../../src/scripts/review-gate/runtime/local-attest-command.js";
import { bindReviewSourceReference, parseReviewSourceReferenceForOwner } from "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { publishLocalReviewReceipt, readLocalReviewReceipts } from "../../../../../src/scripts/review-gate/runtime/local-outcome-receipts.js";

function receipt(h: Awaited<ReturnType<typeof nativeLocalReview>>, reviewRunId = "review-1") {
  const state = h.state;
  return createReviewReceipt({ target: state.target, requirement: state.requirement, request: state.request,
    applicabilityId: null, reviewRunId, evaluatorIdentity: state.request.evaluatorIdentity,
    attestingRuntimeIdentity: state.attestation.runtimeIdentity, attestationMechanism: state.attestation.mechanism,
    providerEventIdentity: null, result: "clean", findings: [] });
}

it("publishes a native receipt under its outcome key without appending a repository ledger", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const value = receipt(h);
  const context = { operationStore: h.operations, outcomes: h.outcomes,
    receiptStore: new LocalForwardReviewReceiptStore(h.publisher, h.state.repositoryId) };
  const published = await publishLocalReviewReceipt(context, { state: h.state, receipt: value,
    expectedLedgerVersion: 0, now: h.prepared.dependencies.now });
  expect(published).toEqual({ ledgerVersion: 0, durableEvidenceRef: h.state.operationId });
  expect((await h.outcomes.read(published.durableEvidenceRef))?.value.local?.receipt).toEqual(value);
  expect(await h.publisher.list({ root: "review-gate", namespace: "evidence" })).toEqual([]);
});

it("replays its immutable receipt after execution pruning and refuses a conflicting replay", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const value = receipt(h), context = { operationStore: h.operations, outcomes: h.outcomes,
    receiptStore: new LocalForwardReviewReceiptStore(h.publisher, h.state.repositoryId) };
  const input = { state: h.state, receipt: value, expectedLedgerVersion: 0, now: h.prepared.dependencies.now };
  const first = await publishLocalReviewReceipt(context, input), stored = await h.outcomes.read(first.durableEvidenceRef);
  expect(await h.operations.readOperation(h.state.operationId)).toMatchObject({ state: null });
  expect(await publishLocalReviewReceipt(context, { ...input, now: h.prepared.dependencies.now })).toEqual(first);
  expect(await h.outcomes.read(first.durableEvidenceRef)).toEqual(stored);
  await expect(publishLocalReviewReceipt(context, { ...input, receipt: receipt(h, "another-run") }))
    .rejects.toThrow("conflicting-replay");
  expect(await h.outcomes.read(first.durableEvidenceRef)).toEqual(stored);
});

it("reads terminal receipts from native outcomes for the selected target", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const value = receipt(h), context = { operationStore: h.operations, outcomes: h.outcomes,
    receiptStore: new LocalForwardReviewReceiptStore(h.publisher, h.state.repositoryId) };
  await publishLocalReviewReceipt(context, { state: h.state, receipt: value,
    expectedLedgerVersion: 0, now: h.prepared.dependencies.now });
  expect(await readLocalReviewReceipts(context, h.state.targetId)).toEqual({ ledgerVersion: 0, receipts: [value] });
  expect(await readLocalReviewReceipts(context, "sha256:" + "f".repeat(64))).toEqual({ ledgerVersion: 0, receipts: [] });
});

it("returns an outcome-backed owner-bound reference from the native attestation command", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const state = h.state;
  const result = await attestLocalReviewCommand({ schemaVersion: 1, operationId: state.operationId,
    result: { status: "complete", result: "clean", evaluatorIdentity: state.request.evaluatorIdentity,
      reviewRunId: "command-review", applicabilityId: null, findings: [] } }, {
    ...{ outcomes: h.outcomes },
    bindSourceReference: source => bindReviewSourceReference({ ...source,
      repositoryId: state.repositoryId, workItem: h.primary.reference.owner }),
    operationStore: h.operations, sourceStore: h.prepared.dependencies.sourceStore,
    receiptStore: new LocalForwardReviewReceiptStore(h.publisher, state.repositoryId),
    withLocalReviewLock: action => action(),
    resolveAuthority: async (evaluator, member, admission) =>
      (await h.prepared.dependencies.resolveAuthority(evaluator, member, admission)).authority,
    resolveGuidanceDigest: async () => state.guidanceDigest,
    confirmTarget: h.prepared.dependencies.confirmTarget, inspectMaterialization: async () => "materialized",
    releaseMaterialization: async () => {}, now: h.prepared.dependencies.now,
  });
  expect(result).toMatchObject({ state: "attested-current" });
  if (result.state !== "attested-current") throw new Error(JSON.stringify(result));
  const source = parseReviewSourceReferenceForOwner(result.payload.receiptRef, "attested-local",
    { repositoryId: state.repositoryId, workItem: h.primary.reference.owner });
  expect(source).toMatchObject({ repositoryId: state.repositoryId, workItem: h.primary.reference.owner,
    operationId: state.operationId, durableRef: state.operationId });
  expect((await h.outcomes.read(source.durableRef))?.value.local?.receipt?.reviewRunId).toBe("command-review");
  expect(await h.publisher.list({ root: "review-gate", namespace: "evidence" })).toEqual([]);
});
