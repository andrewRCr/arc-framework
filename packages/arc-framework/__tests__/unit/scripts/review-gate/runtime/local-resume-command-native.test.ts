/** Local resume reads ended native attempts without requiring their execution files. */
import { expect, it, onTestFinished } from "vitest";
import { nativeLocalReview } from "../../../../fixtures/native-local-review.js";
import { createReviewReceipt, createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { recordLocalReceiptConclusion } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { resumeLocalReviewCommand, type LocalResumeDependencies } from "../../../../../src/scripts/review-gate/runtime/local-resume-command.js";
import { LocalForwardReviewReceiptStore } from "../../../../../src/scripts/review-gate/hosts/local/receipt-store.js";
import { StoredReviewResultReader } from "../../../../../src/scripts/review-gate/hosts/local/stored-result-reader.js";
import { bindReviewSourceReference, parseReviewSourceReference } from "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { storedLocalApproval } from "../../../../fixtures/review-family-access.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import { createProjectIdentityReader } from "../../../../../src/lib/store/project-identity.js";
import { createReviewOutcomePort } from "../../../../../src/lib/store/kinds/review/outcome/access.js";
import { RepositoryLocalReviewSourceStore } from "../../../../../src/scripts/review-gate/hosts/local/source-store.js";
import { createLocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import { attestLocalReviewCommand } from "../../../../../src/scripts/review-gate/runtime/local-attest-command.js";
import { bindNativeReviewPorts } from "../../../../helpers/store/native-review-ports.js";

function dependencies(h: Awaited<ReturnType<typeof nativeLocalReview>>): LocalResumeDependencies {
  return { outcomes: h.outcomes, operationStore: h.operations, sourceStore: h.prepared.dependencies.sourceStore,
    receiptStore: new LocalForwardReviewReceiptStore(h.publisher, h.state.repositoryId),
    resultReader: new StoredReviewResultReader({ outcomes: h.outcomes, evidence: h.evidence, readProjectId: h.projectId }),
    dispositionStore: h.evidence, bindSourceReference: source => bindReviewSourceReference({ ...source,
      repositoryId: h.state.repositoryId, workItem: h.primary.reference.owner }),
    sweep: async () => {}, withLocalReviewLock: action => action(),
    confirmTarget: h.prepared.dependencies.confirmTarget, materialize: h.prepared.dependencies.materialize,
    now: () => h.prepared.dependencies.now() };
}

async function completedReview(result: "clean" | "findings" | "failed" = "clean") {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const state = h.state;
  const receipt = createReviewReceipt({ target: state.target, requirement: state.requirement, request: state.request,
    applicabilityId: null, reviewRunId: "review-1", evaluatorIdentity: state.request.evaluatorIdentity,
    attestingRuntimeIdentity: state.attestation.runtimeIdentity, attestationMechanism: state.attestation.mechanism,
    providerEventIdentity: null, result, findings: result === "findings" ? [{ findingId: "finding-1", severity: "major",
      locus: "src/example.ts:1", evidenceUrlOrId: "finding-1", sourceOrdinal: 1 }] : [] });
  await recordLocalReceiptConclusion(h.operations, { state, receipt, now: h.prepared.dependencies.now() });
  return { h, ports: dependencies(h), receipt };
}

it("resumes a completed native local review after execution and its original source are absent", async () => {
  const { h, ports } = await completedReview();
  await h.publisher.update({ root: "review-gate", namespace: "sources" }, h.state.sourceRef,
    () => ({ kind: "delete", result: undefined }));
  expect(await h.operations.readOperation(h.state.operationId)).toMatchObject({ state: null });
  const stored = await h.outcomes.read(h.state.operationId);
  const resumed = await resumeLocalReviewCommand({ schemaVersion: 1, operationId: h.state.operationId }, ports);
  expect(resumed).toMatchObject({ state: "review-complete", nextAction: "reduce", payload: {
    operationId: h.state.operationId, persistedVersion: 1, currentTarget: h.state.target,
    operationRef: expect.stringMatching(/^arc-review-operation:v1:/) } });
  expect(resumed.payload).not.toHaveProperty("sourceRef");
  if (resumed.state !== "review-complete") throw new Error("Expected completed review");
  expect(parseReviewSourceReference(resumed.payload.receiptRef, "attested-local", true))
    .toEqual({ kind: "attested-local", repositoryId: h.state.repositoryId, workItem: h.primary.reference.owner,
      operationId: h.state.operationId, durableRef: h.state.operationId });
  expect(await h.outcomes.read(h.state.operationId)).toEqual(stored);
  expect(await h.publisher.list({ root: "review-gate", namespace: "evidence" })).toEqual([]);
});

it("resumes native findings with the stored finding set and the same owner-bound response source", async () => {
  const { h, ports, receipt } = await completedReview("findings");
  const resumed = await resumeLocalReviewCommand({ schemaVersion: 1, operationId: h.state.operationId }, ports);
  const receiptRef = bindReviewSourceReference({ kind: "attested-local", operationId: h.state.operationId,
    durableRef: h.state.operationId, repositoryId: h.state.repositoryId, workItem: h.primary.reference.owner });
  expect(resumed).toMatchObject({ state: "respond-to-findings", nextAction: "respond", payload: {
    persistedVersion: 1, currentTarget: h.state.target, receiptRef, responsePlan: { schemaVersion: 1,
      target: h.state.target, source: { kind: "attested-local", receiptRef }, findings: receipt.findings } } });
  expect(resumed.payload).not.toHaveProperty("sourceRef");
});

it("resumes portable approved findings on a checkout without original working files at version zero", async () => {
  const h = await storedLocalApproval(), checkout = await createReviewCheckout(h.harness);
  onTestFinished(checkout.cleanup);
  const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const outcomes = createReviewOutcomePort(h.harness.store, h.owner), readProjectId = createProjectIdentityReader(h.harness.store);
  const operationStore = bindNativeReviewPorts({ store: h.harness.store, owner: h.owner,
    publisher, projectId: readProjectId }).inFlight;
  const resumed = await resumeLocalReviewCommand({ schemaVersion: 1, operationId: h.outcome.attemptId }, {
    outcomes, operationStore, sourceStore: new RepositoryLocalReviewSourceStore(publisher),
    receiptStore: new LocalForwardReviewReceiptStore(publisher, h.outcome.target.repositoryId),
    resultReader: new StoredReviewResultReader({ outcomes, evidence: h.evidence, readProjectId }), dispositionStore: h.evidence,
    sweep: async () => {}, withLocalReviewLock: action => action(),
    confirmTarget: async target => ({ state: "current", target }),
    materialize: async () => { throw new Error("Ended review must not recreate a checkout"); },
    now: () => "2026-10-20T00:00:00Z" });
  expect(resumed).toMatchObject({ state: "review-complete", nextAction: "reduce", payload: {
    operationId: h.outcome.attemptId, currentTarget: h.outcome.target, persistedVersion: 0 } });
  expect(resumed.payload).not.toHaveProperty("sourceRef");
  if (resumed.state !== "review-complete") throw new Error("Expected completed approved review");
  expect(parseReviewSourceReference(resumed.payload.receiptRef, "attested-local", true))
    .toMatchObject({ workItem: h.owner, durableRef: h.outcome.attemptId, operationId: h.outcome.attemptId });
  for (const namespace of ["in-flight", "sources", "evidence"] as const) {
    expect(await publisher.list({ root: "review-gate", namespace })).toEqual([]);
  }
});

it("reports a moved native target without changing its already recorded receipt", async () => {
  const { h, ports } = await completedReview();
  const { targetId: ignored, ...coordinates } = h.state.target;
  void ignored;
  const currentTarget = createReviewTarget({ ...coordinates, headSha: "e".repeat(40), headTree: "f".repeat(40) });
  const stored = await h.outcomes.read(h.state.operationId);
  expect(await resumeLocalReviewCommand({ schemaVersion: 1, operationId: h.state.operationId }, { ...ports,
    confirmTarget: async attemptedTarget => ({ state: "stale-target", attemptedTarget, currentTarget }) }))
    .toMatchObject({ state: "stale-target", nextAction: "prepare-current-target", payload: {
      operationId: h.state.operationId, persistedVersion: 1, attemptedTarget: h.state.target, currentTarget } });
  expect(await h.outcomes.read(h.state.operationId)).toEqual(stored);
});

it("refuses a retained native source mismatch and resumes after the descriptor is repaired", async () => {
  const { h, ports } = await completedReview();
  const location = { root: "review-gate", namespace: "sources" } as const;
  const original = await h.publisher.read(location, h.state.sourceRef);
  const source = await ports.sourceStore.readSource(h.state.sourceRef);
  if (original === null || source === null) throw new Error("Expected retained source descriptor");
  const { sourceDigest: ignored, ...descriptor } = source;
  void ignored;
  const { targetId: ignoredTarget, ...coordinates } = h.state.target;
  void ignoredTarget;
  const target = createReviewTarget({ ...coordinates, headSha: "e".repeat(40), headTree: "f".repeat(40) });
  const foreign = createLocalReviewSource({ ...descriptor, targetId: target.targetId, headSha: target.headSha,
    headTree: target.headTree, reachabilityRef: "refs/arc/review/local/other-review", materializationRef: "/tmp/other-review" });
  await h.publisher.update(location, h.state.sourceRef,
    () => ({ kind: "write", content: JSON.stringify(foreign), result: undefined }));
  await expect(resumeLocalReviewCommand({ schemaVersion: 1, operationId: h.state.operationId }, ports))
    .rejects.toMatchObject({ code: "corrupt-state", message: "local review source snapshot mismatch" });
  await h.publisher.update(location, h.state.sourceRef, () => ({ kind: "write", content: original, result: undefined }));
  expect(await resumeLocalReviewCommand({ schemaVersion: 1, operationId: h.state.operationId }, ports))
    .toMatchObject({ state: "review-complete", nextAction: "reduce" });
});

it("keeps a receipt-less native evaluator failure terminal after execution is pruned", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const state = h.state, ports = dependencies(h);
  await attestLocalReviewCommand({ schemaVersion: 1, operationId: state.operationId,
    result: { status: "failed", result: null, evaluatorIdentity: state.request.evaluatorIdentity,
      reviewRunId: "failed-review", applicabilityId: null, findings: [] } }, {
    operationStore: h.operations, outcomes: h.outcomes, sourceStore: ports.sourceStore, receiptStore: ports.receiptStore,
    withLocalReviewLock: action => action(),
    resolveAuthority: async (evaluator, member, admission) =>
      (await h.prepared.dependencies.resolveAuthority(evaluator, member, admission)).authority,
    resolveGuidanceDigest: async () => state.guidanceDigest, confirmTarget: ports.confirmTarget,
    inspectMaterialization: async () => "materialized", releaseMaterialization: async () => {}, now: ports.now });
  const stored = await h.outcomes.read(state.operationId);
  expect(stored?.value).toMatchObject({ outcome: "terminal-failure" });
  expect(stored?.value.local).not.toHaveProperty("receipt");
  expect(await resumeLocalReviewCommand({ schemaVersion: 1, operationId: state.operationId }, ports))
    .toMatchObject({ state: "terminal-operation", nextAction: "rerun-review", payload: {
      operationId: state.operationId, persistedVersion: 1, currentTarget: state.target } });
  expect(await h.outcomes.read(state.operationId)).toEqual(stored);
});

it("sends a stored failed native receipt to reduction for the existing retry advice", async () => {
  const { h, ports } = await completedReview("failed");
  const resumed = await resumeLocalReviewCommand({ schemaVersion: 1, operationId: h.state.operationId }, ports);
  expect(resumed).toMatchObject({ state: "review-complete", nextAction: "reduce", payload: {
    operationId: h.state.operationId, persistedVersion: 1, currentTarget: h.state.target } });
});
