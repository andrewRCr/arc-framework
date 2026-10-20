/** Native attestation re-entry uses immutable outcomes after execution is pruned. */
import { expect, it, onTestFinished } from "vitest";
import { createLocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { nativeLocalReview } from "../../../../fixtures/native-local-review.js";
import { attestLocalReviewCommand, type LocalAttestDependencies } from "../../../../../src/scripts/review-gate/runtime/local-attest-command.js";
import { LocalForwardReviewReceiptStore } from "../../../../../src/scripts/review-gate/hosts/local/receipt-store.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import { createProjectIdentityReader } from "../../../../../src/lib/store/project-identity.js";
import { createReviewOutcomePort } from "../../../../../src/lib/store/kinds/review/outcome/access.js";
import { NativeReviewInFlightStateStore } from "../../../../../src/scripts/review-gate/hosts/local/in-flight-state-store.js";
import { RepositoryLocalReviewSourceStore } from "../../../../../src/scripts/review-gate/hosts/local/source-store.js";
import { parseNativeReviewOperationReference } from "../../../../../src/scripts/review-gate/core/review-operation-reference.js";
import { bindReviewSourceReference, parseReviewSourceReference } from "../../../../../src/scripts/review-gate/core/review-source-reference.js";

function dependencies(h: Awaited<ReturnType<typeof nativeLocalReview>>): LocalAttestDependencies {
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

function resultRequest(h: Awaited<ReturnType<typeof nativeLocalReview>>) {
  return { schemaVersion: 1, operationId: h.state.operationId,
    result: { status: "complete", result: "clean", evaluatorIdentity: h.state.request.evaluatorIdentity,
      reviewRunId: "native-review", applicabilityId: null, findings: [] } };
}

it("replays the same native attestation after its ended execution is pruned without rewriting the result", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const request = resultRequest(h);
  const ports = dependencies(h);
  const first = await attestLocalReviewCommand(request, ports);
  expect(first).toMatchObject({ state: "attested-current" });
  expect(await h.operations.readOperation(h.state.operationId)).toMatchObject({ state: null });
  const stored = await h.outcomes.read(h.state.operationId);
  expect(await attestLocalReviewCommand(request, ports)).toMatchObject(first);
  expect(await h.outcomes.read(h.state.operationId)).toEqual(stored);
  expect(await h.publisher.list({ root: "review-gate", namespace: "evidence" })).toEqual([]);
});

it("omits an absent original source locator when replaying a completed native attestation", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const request = resultRequest(h), ports = dependencies(h);
  const first = await attestLocalReviewCommand(request, ports);
  await h.publisher.update({ root: "review-gate", namespace: "sources" }, h.state.sourceRef,
    () => ({ kind: "delete", result: undefined }));
  const replay = await attestLocalReviewCommand(request, ports);
  expect(replay).toMatchObject({ state: "attested-current", payload: { persistedVersion: 1,
    operationRef: expect.stringMatching(/^arc-review-operation:v1:/) } });
  expect(replay.payload).not.toHaveProperty("sourceRef");
  if (first.state !== "attested-current" || replay.state !== "attested-current") throw new Error("Expected immutable attestation replay");
  expect(replay.payload.receiptRef).toBe(first.payload.receiptRef);
});

it("refuses a conflicting completed native receipt and accepts the original request again", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const request = resultRequest(h), ports = dependencies(h);
  await attestLocalReviewCommand(request, ports);
  const stored = await h.outcomes.read(h.state.operationId);
  await expect(attestLocalReviewCommand({ ...request, result: { ...request.result, reviewRunId: "different-review" } }, ports))
    .rejects.toMatchObject({ code: "corrupt-state", message: "local review operation already has a terminal receipt" });
  expect(await attestLocalReviewCommand(request, ports)).toMatchObject({ state: "attested-current" });
  expect(await h.outcomes.read(h.state.operationId)).toEqual(stored);
});

it("replays from a produced source owner on another checkout with no original execution files", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const request = resultRequest(h), first = await attestLocalReviewCommand(request, dependencies(h));
  if (first.state !== "attested-current") throw new Error("Expected produced source reference");
  const reference = parseReviewSourceReference(first.payload.receiptRef, "attested-local", true);
  if (!("workItem" in reference)) throw new Error("Expected native source owner");
  const checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const outcomes = createReviewOutcomePort(h.store, reference.workItem);
  const operationStore = new NativeReviewInFlightStateStore({ publisher, workItem: reference.workItem,
    outcomes, projectId: createProjectIdentityReader(h.store) });
  const stored = await outcomes.read(request.operationId);
  const replay = await attestLocalReviewCommand(request, { ...dependencies(h), outcomes, operationStore,
    sourceStore: new RepositoryLocalReviewSourceStore(publisher),
    receiptStore: new LocalForwardReviewReceiptStore(publisher, reference.repositoryId),
    bindSourceReference: source => bindReviewSourceReference({ ...source, repositoryId: reference.repositoryId,
      workItem: reference.workItem }) });
  expect(replay).toMatchObject({ state: "attested-current", payload: { persistedVersion: 0,
    receiptRef: first.payload.receiptRef, target: h.state.target } });
  expect(replay.payload).not.toHaveProperty("sourceRef");
  if (replay.payload.operationRef === undefined) throw new Error("Expected portable operation reference");
  expect(parseNativeReviewOperationReference(replay.payload.operationRef)).toEqual({ operationId: request.operationId,
    repositoryId: reference.repositoryId, workItem: reference.workItem });
  expect(await outcomes.read(request.operationId)).toEqual(stored);
  expect(await publisher.list({ root: "review-gate", namespace: "in-flight" })).toEqual([]);
  expect(await publisher.list({ root: "review-gate", namespace: "sources" })).toEqual([]);
  expect(await publisher.list({ root: "review-gate", namespace: "evidence" })).toEqual([]);
});

it("keeps an already recorded native receipt when its current target has moved", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const request = resultRequest(h), ports = dependencies(h);
  const first = await attestLocalReviewCommand(request, ports);
  if (first.state !== "attested-current") throw new Error("Expected recorded receipt");
  const { targetId: ignored, ...coordinates } = h.state.target;
  void ignored;
  const currentTarget = createReviewTarget({ ...coordinates, headSha: "e".repeat(40), headTree: "f".repeat(40) });
  expect(await attestLocalReviewCommand(request, { ...ports,
    confirmTarget: async attemptedTarget => ({ state: "stale-target", attemptedTarget, currentTarget }) }))
    .toMatchObject({ state: "stale-target", nextAction: "prepare-current-target", payload: { receiptRecorded: true,
      receiptRef: first.payload.receiptRef, attemptedTarget: h.state.target, currentTarget } });
});

it("refuses a retained source belonging to another target and resumes after its descriptor is repaired", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const request = resultRequest(h), ports = dependencies(h);
  await attestLocalReviewCommand(request, ports);
  const location = { root: "review-gate", namespace: "sources" } as const;
  const original = await h.publisher.read(location, h.state.sourceRef);
  const source = await ports.sourceStore.readSource(h.state.sourceRef);
  if (original === null || source === null) throw new Error("Expected original descriptor");
  const { targetId: ignoredTarget, ...coordinates } = h.state.target;
  const { sourceDigest: ignoredDigest, ...descriptor } = source;
  void ignoredTarget; void ignoredDigest;
  const target = createReviewTarget({ ...coordinates, headSha: "e".repeat(40), headTree: "f".repeat(40) });
  const foreign = createLocalReviewSource({ ...descriptor, targetId: target.targetId, headSha: target.headSha,
    headTree: target.headTree, reachabilityRef: "refs/arc/review/local/other-review", materializationRef: "/tmp/other-review" });
  await h.publisher.update(location, h.state.sourceRef,
    () => ({ kind: "write", content: JSON.stringify(foreign), result: undefined }));
  await expect(attestLocalReviewCommand(request, ports)).rejects.toMatchObject({ code: "corrupt-state",
    message: "local review source snapshot mismatch" });
  await h.publisher.update(location, h.state.sourceRef, () => ({ kind: "write", content: original, result: undefined }));
  expect(await attestLocalReviewCommand(request, ports)).toMatchObject({ state: "attested-current" });
});

it("keeps a receipt-less failed attempt terminal when a later complete result is submitted", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const request = resultRequest(h), ports = dependencies(h);
  expect(await attestLocalReviewCommand({ ...request, result: { ...request.result, status: "failed", result: null } }, ports))
    .toMatchObject({ state: "not-attestable" });
  const stored = await h.outcomes.read(h.state.operationId);
  expect(stored?.value).toMatchObject({ outcome: "terminal-failure" });
  expect(stored?.value.local).not.toHaveProperty("receipt");
  expect(await attestLocalReviewCommand(request, ports)).toMatchObject({ state: "terminal-operation",
    nextAction: "rerun-review", payload: { operationId: h.state.operationId, persistedVersion: 1,
      operationRef: expect.stringMatching(/^arc-review-operation:v1:/) } });
  expect(await h.outcomes.read(h.state.operationId)).toEqual(stored);
});
