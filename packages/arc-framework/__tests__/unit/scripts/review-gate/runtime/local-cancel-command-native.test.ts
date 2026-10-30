/** Native cancellation stores its ended attempt and replays from that outcome after execution is pruned. */
import { expect, it, onTestFinished } from "vitest";
import { nativeLocalReview } from "../../../../fixtures/native-local-review.js";
import { cancelLocalReviewCommand, type LocalCancelDependencies } from "../../../../../src/scripts/review-gate/runtime/local-cancel-command.js";
import { LocalForwardReviewReceiptStore } from "../../../../../src/scripts/review-gate/hosts/local/receipt-store.js";
import { attestLocalReviewCommand, type LocalAttestDependencies } from "../../../../../src/scripts/review-gate/runtime/local-attest-command.js";
import { bindReviewSourceReference } from "../../../../../src/scripts/review-gate/core/review-source-reference.js";

type NativeReview = Awaited<ReturnType<typeof nativeLocalReview>>;

function dependencies(h: NativeReview, release: (operationId: string) => Promise<void> = async () => {}) {
  const released: string[] = [];
  const ports: LocalCancelDependencies = { outcomes: h.outcomes, operationStore: h.operations,
    receiptStore: new LocalForwardReviewReceiptStore(h.publisher, h.state.repositoryId),
    withLocalReviewLock: action => action(), now: () => h.prepared.dependencies.now(),
    releaseMaterialization: async operationId => { await release(operationId); released.push(operationId); } };
  return { ports, released };
}

function attestDependencies(h: NativeReview): LocalAttestDependencies {
  return { outcomes: h.outcomes, operationStore: h.operations, sourceStore: h.prepared.dependencies.sourceStore,
    receiptStore: new LocalForwardReviewReceiptStore(h.publisher, h.state.repositoryId),
    bindSourceReference: source => bindReviewSourceReference({ ...source, repositoryId: h.state.repositoryId,
      workItem: h.primary.reference.owner }), withLocalReviewLock: action => action(),
    resolveAuthority: async (evaluator, member, admission) =>
      (await h.prepared.dependencies.resolveAuthority(evaluator, member, admission)).authority,
    resolveGuidanceDigest: async () => h.state.guidanceDigest, confirmTarget: h.prepared.dependencies.confirmTarget,
    inspectMaterialization: async () => "materialized", releaseMaterialization: async () => {},
    now: () => h.prepared.dependencies.now() };
}

function request(h: NativeReview) {
  return { schemaVersion: 1, operationId: h.state.operationId };
}

it("stores a cancelled native dispatch's outcome with no receipt and no consumed pass", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const { ports, released } = dependencies(h);
  expect(await cancelLocalReviewCommand(request(h), ports)).toMatchObject({ state: "cancelled", nextAction: "rerun-review",
    payload: { operationId: h.state.operationId } });
  expect(released).toEqual([h.state.operationId]);
  const stored = await h.outcomes.read(h.state.operationId);
  expect(stored?.value).toMatchObject({ attemptId: h.state.operationId, outcome: "terminal-failure", effectiveCoverage: null,
    local: { operationId: h.state.operationId, requestId: h.state.requestId } });
  expect(stored?.value.local?.receipt).toBeUndefined();
  const snapshot = await h.operations.readOperationSnapshot();
  if (snapshot.status !== "complete") throw new Error("Expected a complete in-flight snapshot");
  expect(snapshot.records.map(record => record.state)).toMatchObject([{ kind: "lane-progress", completedPasses: 0,
    attempts: [{ attemptId: h.state.operationId, outcome: "terminal-failure", logicalPass: 1, retryGeneration: 0 }] }]);
});

it("replays a pruned native cancellation as terminal and finishes its interrupted cleanup", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const interrupted = dependencies(h, async () => { throw new Error("cleanup interrupted"); });
  await expect(cancelLocalReviewCommand(request(h), interrupted.ports)).rejects.toThrow("cleanup interrupted");
  expect(await h.operations.readOperation(h.state.operationId)).toMatchObject({ state: null });
  const stored = await h.outcomes.read(h.state.operationId);
  const { ports, released } = dependencies(h);
  expect(await cancelLocalReviewCommand(request(h), ports)).toMatchObject({ state: "terminal-operation",
    nextAction: "resume-review", payload: { operationId: h.state.operationId } });
  expect(released).toEqual([h.state.operationId]);
  expect(await h.outcomes.read(h.state.operationId)).toEqual(stored);
});

it("replays an attested native operation as terminal without releasing its materialization", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  expect(await attestLocalReviewCommand({ schemaVersion: 1, operationId: h.state.operationId, result: { status: "complete",
    result: "clean", evaluatorIdentity: h.state.request.evaluatorIdentity, reviewRunId: "native-review", applicabilityId: null,
    findings: [] } }, attestDependencies(h))).toMatchObject({ state: "attested-current" });
  const stored = await h.outcomes.read(h.state.operationId);
  const { ports, released } = dependencies(h);
  expect(await cancelLocalReviewCommand(request(h), ports)).toMatchObject({ state: "terminal-operation",
    nextAction: "resume-review" });
  expect(released).toEqual([]);
  expect(await h.outcomes.read(h.state.operationId)).toEqual(stored);
});
