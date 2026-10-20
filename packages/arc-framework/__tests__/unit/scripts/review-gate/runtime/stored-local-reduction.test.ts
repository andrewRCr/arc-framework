/** Reduction over actual native outcomes after machine-local execution has ended. */
import { expect, it, onTestFinished } from "vitest";
import { nativeLocalReview } from "../../../../fixtures/native-local-review.js";
import { createReviewReceipt } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { recordLocalReceiptConclusion } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { RepositoryLocalReviewSourceStore } from "../../../../../src/scripts/review-gate/hosts/local/source-store.js";
import { storedLocalApproval } from "../../../../fixtures/review-family-access.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { createReviewOutcomePort } from "../../../../../src/lib/store/kinds/review/outcome/access.js";
import { createProjectIdentityReader } from "../../../../../src/lib/store/project-identity.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import { NativeReviewInFlightStateStore } from "../../../../../src/scripts/review-gate/hosts/local/in-flight-state-store.js";
import { LocalFrontlineOutcomeStore } from "../../../../../src/scripts/review-gate/hosts/local/frontline-outcome-store.js";
import { StoredReviewResultReader } from "../../../../../src/scripts/review-gate/hosts/local/stored-result-reader.js";
import { DurableReviewReductionPort } from "../../../../../src/scripts/review-gate/runtime/reduce-command.js";
import { bindReviewSourceReference } from "../../../../../src/scripts/review-gate/core/review-source-reference.js";

async function completedLocalReview(result: "clean" | "findings" | "failed" = "clean", retainSource = false) {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const state = h.state;
  if (!retainSource) await h.publisher.update({ root: "review-gate", namespace: "sources" }, state.sourceRef,
    () => ({ kind: "delete", result: undefined }));
  const receipt = createReviewReceipt({ target: state.target, requirement: state.requirement, request: state.request,
    applicabilityId: null, reviewRunId: "review-1", evaluatorIdentity: state.request.evaluatorIdentity,
    attestingRuntimeIdentity: state.attestation.runtimeIdentity, attestationMechanism: state.attestation.mechanism,
    providerEventIdentity: null, result, findings: result === "findings" ? [{ findingId: "finding-1", severity: "major",
      locus: "src/example.ts:1", evidenceUrlOrId: "finding-1", sourceOrdinal: 1 }] : [] });
  await recordLocalReceiptConclusion(h.operations, { state, receipt, now: h.prepared.dependencies.now() });
  expect(await h.operations.readOperation(state.operationId)).toMatchObject({ state: null });
  const port = new DurableReviewReductionPort({ outcomes: h.outcomes, operationStore: h.operations,
    sourceStore: new RepositoryLocalReviewSourceStore(h.publisher),
    resultReader: new StoredReviewResultReader({ outcomes: h.outcomes, evidence: h.evidence, readProjectId: h.projectId }),
    dispositionStore: h.evidence, confirmTarget: h.prepared.dependencies.confirmTarget,
    bindSourceReference: source => bindReviewSourceReference({ ...source, repositoryId: state.repositoryId,
      workItem: h.primary.reference.owner }),
    readReceiptEntries: async () => [],
    outcomeStore: new LocalFrontlineOutcomeStore(h.publisher),
  });
  return { h, port, state };
}

it("reduces a completed native local review after execution state is pruned", async () => {
  const { h, port, state } = await completedLocalReview();
  expect(await port.reduce(state.operationId)).toMatchObject({ state: "advisory-complete", nextAction: "none",
    payload: { operationId: state.operationId, persistedVersion: 1, currentTarget: state.target } });
  expect(await h.publisher.list({ root: "review-gate", namespace: "evidence" })).toEqual([]);
});

it("reduces a portable approved finding on a checkout with no execution, source, or receipt records", async () => {
  const h = await storedLocalApproval(), checkout = await createReviewCheckout(h.harness);
  onTestFinished(checkout.cleanup);
  const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const outcomes = createReviewOutcomePort(h.harness.store, h.owner), readProjectId = createProjectIdentityReader(h.harness.store);
  const operations = new NativeReviewInFlightStateStore({ publisher, workItem: h.owner,
    outcomes, evidence: h.evidence, projectId: readProjectId });
  const reader = new StoredReviewResultReader({ outcomes, evidence: h.evidence, readProjectId });
  const port = new DurableReviewReductionPort({ outcomes, operationStore: operations,
    sourceStore: new RepositoryLocalReviewSourceStore(publisher), resultReader: reader, dispositionStore: h.evidence,
    confirmTarget: async target => ({ state: "current", target }),
    bindSourceReference: source => bindReviewSourceReference({ ...source, repositoryId: h.outcome.target.repositoryId,
      workItem: h.owner }), readReceiptEntries: async () => [], outcomeStore: new LocalFrontlineOutcomeStore(publisher) });
  expect(await port.reduce(h.outcome.attemptId)).toMatchObject({ state: "settled", nextAction: "none",
    payload: { operationId: h.outcome.attemptId, persistedVersion: 0, currentTarget: h.outcome.target } });
  expect(await publisher.list({ root: "review-gate", namespace: "sources" })).toEqual([]);
  expect(await publisher.list({ root: "review-gate", namespace: "evidence" })).toEqual([]);
});

it("reduces native findings with their owner-bound outcome reference and no invented source reference", async () => {
  const { h, port, state } = await completedLocalReview("findings");
  const receiptRef = bindReviewSourceReference({ kind: "attested-local", operationId: state.operationId,
    durableRef: state.operationId, repositoryId: state.repositoryId, workItem: h.primary.reference.owner });
  expect(await port.reduce(state.operationId)).toMatchObject({ state: "findings", nextAction: "respond",
    payload: { persistedVersion: 1, projection: { sourceRefs: [receiptRef] },
      responseSource: { kind: "attested-local", receiptRef } } });
  expect(await h.publisher.list({ root: "review-gate", namespace: "sources" })).toEqual([]);
});

it("preserves retry advice for a stored failed local receipt", async () => {
  const { port, state } = await completedLocalReview("failed");
  expect(await port.reduce(state.operationId)).toMatchObject({ state: "retryable", nextAction: "retry",
    payload: { operationId: state.operationId, persistedVersion: 1, retryCommand: "local-attest", requestRef: state.requestId } });
});

it("retains the actual descriptor locator beside its portable result after execution ends", async () => {
  const { h, port, state } = await completedLocalReview("findings", true);
  const receiptRef = bindReviewSourceReference({ kind: "attested-local", operationId: state.operationId,
    durableRef: state.operationId, repositoryId: state.repositoryId, workItem: h.primary.reference.owner });
  expect(await port.reduce(state.operationId)).toMatchObject({ state: "findings",
    payload: { persistedVersion: 1, projection: { sourceRefs: [receiptRef, state.sourceRef] } } });
  expect(await new RepositoryLocalReviewSourceStore(h.publisher).readSource(state.sourceRef))
    .toMatchObject({ sourceDigest: state.sourceDigest });
});
