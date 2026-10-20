/** Common attempt transitions publish ended local review facts through the selected backend. */
import { expect, it, onTestFinished } from "vitest";
import { nativeLocalReview } from "../../../fixtures/native-local-review.js";
import { createReviewReceipt, createReviewTarget } from "../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { attestLocalReviewCommand } from "../../../../src/scripts/review-gate/runtime/local-attest-command.js";
import { prepareLocalReview } from "../../../../src/scripts/review-gate/runtime/local-prepare.js";
import { laneProgressOperationId, recordLocalReceiptConclusion } from "../../../../src/scripts/review-gate/lane-progress.js";

it("ends a native local clean review with one immutable outcome on its exact work item", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const state = h.state;
  const receipt = createReviewReceipt({ target: state.target, requirement: state.requirement, request: state.request,
    applicabilityId: null, reviewRunId: "completed-review", evaluatorIdentity: state.request.evaluatorIdentity,
    attestingRuntimeIdentity: state.attestation.runtimeIdentity, attestationMechanism: state.attestation.mechanism,
    providerEventIdentity: null, result: "clean", findings: [] });
  const lane = await recordLocalReceiptConclusion(h.operations, { state, receipt, now: "2026-10-20T12:00:00Z" });
  const listing = await h.outcomes.list();
  expect(listing).toMatchObject({ status: "complete", records: [{ reference: { owner: h.primary.reference.owner },
    value: { attemptId: state.operationId, outcome: "clean", local: { receipt, request: state.request,
      policyBindingDigest: state.policyBindingDigest, sourceDigest: state.sourceDigest, guidanceDigest: state.guidanceDigest } } }] });
  if (listing.status !== "complete") throw new Error("Expected complete outcomes");
  expect(listing.records).toHaveLength(1);
  expect(lane).toMatchObject({ completedPasses: 1, attempts: [{ outcome: "clean", terminalProducer: true }] });
  expect(await h.operations.readOperation(state.operationId)).toMatchObject({ state: null });
  expect(await h.publisher.list({ root: "review-gate", namespace: "operations" })).toEqual([]);
});

it("stores a receipt-less evaluator failure and numbers its successful retry at the same pass", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const state = h.state;
  const failed = await attestLocalReviewCommand({ schemaVersion: 1, operationId: state.operationId,
    result: { status: "failed", result: null, evaluatorIdentity: state.request.evaluatorIdentity,
      reviewRunId: "failed-review", applicabilityId: null, findings: [] } }, {
    withLocalReviewLock: action => action(), operationStore: h.operations, sourceStore: h.prepared.dependencies.sourceStore,
    receiptStore: { readReceipts: h.prepared.dependencies.readReceipts,
      appendReceipt: async () => { throw new Error("Unexpected receipt for failed execution"); } },
    resolveAuthority: async () => { throw new Error("Unexpected authority refresh for failed execution"); },
    resolveGuidanceDigest: async () => state.guidanceDigest,
    confirmTarget: h.prepared.dependencies.confirmTarget, inspectMaterialization: async () => "materialized",
    releaseMaterialization: async () => {}, now: h.prepared.dependencies.now,
  });
  expect(failed).toMatchObject({ state: "not-attestable" });
  const outcome = await h.outcomes.read(state.operationId);
  expect(outcome?.value).toMatchObject({ outcome: "terminal-failure", logicalPass: 1, retryGeneration: 0,
    effectiveCoverage: null, local: { request: state.request } });
  expect(outcome?.value.local).not.toHaveProperty("receipt");
  const laneId = laneProgressOperationId({ lane: "standard", repositoryId: state.repositoryId,
    headSha: state.target.headSha, lineage: state.lineage });
  expect(await h.operations.readOperation(laneId)).toMatchObject({ state: { completedPasses: 0 } });
  const retried = await prepareLocalReview({ schemaVersion: 1, evaluatorIdentity: state.request.evaluatorIdentity,
    routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
      ownership: "self", surfaceAuthority: "ordinary" }, policyJudgment: { scopeMode: "whole-target" } }, h.prepared.dependencies);
  expect(retried).toMatchObject({ state: "ready" });
  const snapshot = await h.operations.readOperationSnapshot();
  if (snapshot.status !== "complete") throw new Error(snapshot.reason);
  const retry = snapshot.records.find(record => record.state.kind === "local-review")?.state;
  if (retry?.kind !== "local-review") throw new Error("Expected retry admission");
  expect(retry).toMatchObject({ logicalPass: 1, retryGeneration: 1 });
  const receipt = createReviewReceipt({ target: retry.target, requirement: retry.requirement, request: retry.request,
    applicabilityId: null, reviewRunId: "successful-retry", evaluatorIdentity: retry.request.evaluatorIdentity,
    attestingRuntimeIdentity: retry.attestation.runtimeIdentity, attestationMechanism: retry.attestation.mechanism,
    providerEventIdentity: null, result: "clean", findings: [] });
  await recordLocalReceiptConclusion(h.operations, { state: retry, receipt, now: h.prepared.dependencies.now() });
  expect(await h.outcomes.list()).toMatchObject({ status: "complete", records: [expect.anything(), expect.anything()] });
  expect(await h.operations.readOperation(laneId)).toMatchObject({ state: { completedPasses: 1 } });
});

it("retains native findings and replays the same conclusion without rewriting its outcome", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const state = h.state;
  const receipt = createReviewReceipt({ target: state.target, requirement: state.requirement, request: state.request,
    applicabilityId: null, reviewRunId: "review-with-findings", evaluatorIdentity: state.request.evaluatorIdentity,
    attestingRuntimeIdentity: state.attestation.runtimeIdentity, attestationMechanism: state.attestation.mechanism,
    providerEventIdentity: null, result: "findings", findings: [{ findingId: "finding-1", severity: "major",
      locus: "src/main.ts:1", evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }] });
  await recordLocalReceiptConclusion(h.operations, { state, receipt, now: h.prepared.dependencies.now() });
  const outcome = await h.outcomes.read(state.operationId);
  expect(outcome?.value).toMatchObject({ outcome: "findings", findings: receipt.findings, local: { receipt } });
  const replay = await recordLocalReceiptConclusion(h.operations, { state, receipt, now: h.prepared.dependencies.now() });
  expect(replay).toMatchObject({ completedPasses: 1, attempts: [{ outcome: "findings" }] });
  expect(await h.outcomes.read(state.operationId)).toEqual(outcome);
});

it("stores an abandoned stale-target admission before preparing its replacement", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const state = h.state, { targetId: ignored, ...coordinates } = state.target;
  void ignored;
  const target = createReviewTarget({ ...coordinates, headSha: "e".repeat(40), headTree: "f".repeat(40) });
  h.prepared.deriveTarget.mockResolvedValue(target);
  h.prepared.dependencies.readCurrentHeadSha = async () => target.headSha;
  h.prepared.dependencies.confirmTarget = async attempted => attempted.targetId === target.targetId
    ? { state: "current", target } : { state: "stale-target", attemptedTarget: attempted, currentTarget: target };
  const result = await prepareLocalReview({ schemaVersion: 1, evaluatorIdentity: state.request.evaluatorIdentity,
    routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
      ownership: "self", surfaceAuthority: "ordinary" }, policyJudgment: { scopeMode: "whole-target" } }, h.prepared.dependencies);
  expect(result).toMatchObject({ state: "ready" });
  const stored = await h.outcomes.read(state.operationId);
  expect(stored?.value).toMatchObject({ attemptId: state.operationId, outcome: "stale-target", effectiveCoverage: null,
    logicalPass: 1, retryGeneration: 0, local: { request: state.request } });
  expect(stored?.value.local).not.toHaveProperty("receipt");
  const snapshot = await h.operations.readOperationSnapshot();
  if (snapshot.status !== "complete") throw new Error(snapshot.reason);
  const owner = snapshot.records.find(record => record.state.kind === "lane-progress")?.state;
  expect(owner).toMatchObject({ completedPasses: 0, attempts: [{ attemptId: state.operationId, outcome: "stale-target" },
    { outcome: "pending", logicalPass: 1, retryGeneration: 1, headSha: target.headSha }] });
});
