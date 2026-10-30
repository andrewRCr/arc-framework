/** Native preparation replays completed admissions from their portable results. */
import { expect, it, onTestFinished } from "vitest";
import { resolveNativeExtraPassJudgment } from "../../../../../src/scripts/review-gate/runtime/native-extra-pass.js";
import { DeliveryLocalReviewAdmissionSchema } from "../../../../../src/scripts/review-gate/policy/delivery-local-review-admission.js";
import { createDeliveryLocalReviewAdmission } from "../../../../fixtures/local-review-preparation.js";
import { nativeLocalReview } from "../../../../fixtures/native-local-review.js";
import { createReviewReceipt, createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { recordLocalReceiptConclusion } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { prepareLocalReview } from "../../../../../src/scripts/review-gate/runtime/local-prepare.js";
import { readLocalReviewReceipts } from "../../../../../src/scripts/review-gate/runtime/local-outcome-receipts.js";
import { LocalForwardReviewReceiptStore } from "../../../../../src/scripts/review-gate/hosts/local/receipt-store.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import { RepositoryLocalReviewSourceStore } from "../../../../../src/scripts/review-gate/hosts/local/source-store.js";
import { parseNativeReviewOperationReference } from "../../../../../src/scripts/review-gate/core/review-operation-reference.js";
import { createLocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import { bindNativeReviewPorts } from "../../../../helpers/store/native-review-ports.js";
import { createNativeLocalPassJudgmentResolver } from "../../../../../src/scripts/review-gate/runtime/native-local-pass-judgments.js";

async function completedReview(result: "clean" | "findings" = "clean") {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const state = h.state;
  const receipt = createReviewReceipt({ target: state.target, requirement: state.requirement, request: state.request,
    applicabilityId: null, reviewRunId: "review-1", evaluatorIdentity: state.request.evaluatorIdentity,
    attestingRuntimeIdentity: state.attestation.runtimeIdentity, attestationMechanism: state.attestation.mechanism,
    providerEventIdentity: null, result, findings: result === "findings" ? [{ findingId: "finding-1", severity: "major",
      locus: "src/example.ts:1", evidenceUrlOrId: "finding-1", sourceOrdinal: 1 }] : [] });
  await recordLocalReceiptConclusion(h.operations, { state, receipt, now: h.prepared.dependencies.now() });
  const receiptStore = new LocalForwardReviewReceiptStore(h.publisher, state.repositoryId);
  const dependencies = { ...h.prepared.dependencies, outcomes: h.outcomes,
    readReceipts: (targetId: string) => readLocalReviewReceipts({ receiptStore, outcomes: h.outcomes }, targetId),
    materialize: async () => { throw new Error("Completed admission must not rematerialize a source"); } };
  const request = { schemaVersion: 1, evaluatorIdentity: state.request.evaluatorIdentity,
    routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
      ownership: "self", surfaceAuthority: "ordinary" }, policyJudgment: { scopeMode: "whole-target" } };
  return { h, state, dependencies, request };
}

it("prepares the same ended native review without its execution or source descriptor", async () => {
  const { h, state, dependencies, request } = await completedReview();
  await h.publisher.update({ root: "review-gate", namespace: "sources" }, state.sourceRef,
    () => ({ kind: "delete", result: undefined }));
  const stored = await h.outcomes.read(state.operationId);
  expect(await prepareLocalReview(request, dependencies)).toMatchObject({ state: "review-complete", nextAction: "reduce",
    payload: { operationId: state.operationId, persistedVersion: 1, target: state.target } });
  expect(await h.outcomes.read(state.operationId)).toEqual(stored);
  expect(await h.publisher.list({ root: "review-gate", namespace: "sources" })).toEqual([]);
  expect(await h.publisher.list({ root: "review-gate", namespace: "evidence" })).toEqual([]);
});

it("prepares an ended native admission on another checkout with no original local files", async () => {
  const { h, state, dependencies, request } = await completedReview();
  const first = await prepareLocalReview(request, dependencies);
  if (first.state !== "review-complete" || first.payload.operationRef === undefined) throw new Error("Expected produced native reference");
  const reference = parseNativeReviewOperationReference(first.payload.operationRef);
  const checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const operations = bindNativeReviewPorts({ store: h.store, owner: reference.workItem,
    publisher, projectId: h.projectId }).inFlight;
  const replay = await prepareLocalReview(request, { ...dependencies, operationStore: operations,
    sourceStore: new RepositoryLocalReviewSourceStore(publisher) });
  expect(replay).toMatchObject({ state: "review-complete", payload: { operationId: state.operationId,
    operationRef: first.payload.operationRef, persistedVersion: 0, target: state.target } });
  expect(await publisher.list({ root: "review-gate", namespace: "in-flight" })).toEqual([]);
  expect(await publisher.list({ root: "review-gate", namespace: "sources" })).toEqual([]);
});

it("returns an unsettled native findings admission for reduction without launching another review", async () => {
  const { h, state, dependencies, request } = await completedReview("findings");
  const stored = await h.outcomes.read(state.operationId);
  expect(await prepareLocalReview(request, dependencies)).toMatchObject({ state: "review-complete", nextAction: "reduce",
    payload: { operationId: state.operationId, persistedVersion: 1, target: state.target } });
  expect(await h.outcomes.read(state.operationId)).toEqual(stored);
});

it("rechecks the live reservation on native completed replay and succeeds after its policy is repaired", async () => {
  const { state, dependencies, request } = await completedReview();
  dependencies.readReservedWorkUnitObligation = async () => ({ ...state.requirement, rubricDigest: `sha256:${"e".repeat(64)}` });
  await expect(prepareLocalReview(request, dependencies))
    .rejects.toMatchObject({ code: "corrupt-state", message: "local review routing does not match the reserved work-unit obligation" });
  dependencies.readReservedWorkUnitObligation = async () => state.requirement;
  expect(await prepareLocalReview(request, dependencies)).toMatchObject({ state: "review-complete",
    payload: { operationId: state.operationId } });
});

it("refuses a mismatched retained source on native preparation and replays after repair", async () => {
  const { h, state, dependencies, request } = await completedReview();
  const location = { root: "review-gate", namespace: "sources" } as const;
  const original = await h.publisher.read(location, state.sourceRef), source = await dependencies.sourceStore.readSource(state.sourceRef);
  if (original === null || source === null) throw new Error("Expected retained descriptor");
  const { targetId: ignoredTarget, ...coordinates } = state.target;
  const { sourceDigest: ignoredDigest, ...descriptor } = source;
  void ignoredTarget; void ignoredDigest;
  const target = createReviewTarget({ ...coordinates, headSha: "e".repeat(40), headTree: "f".repeat(40) });
  const foreign = createLocalReviewSource({ ...descriptor, targetId: target.targetId, headSha: target.headSha,
    headTree: target.headTree, reachabilityRef: "refs/arc/review/local/other-review", materializationRef: "/tmp/other-review" });
  await h.publisher.update(location, state.sourceRef, () => ({ kind: "write", content: JSON.stringify(foreign), result: undefined }));
  await expect(prepareLocalReview(request, dependencies)).rejects.toThrow("local review source reference mismatch");
  await h.publisher.update(location, state.sourceRef, () => ({ kind: "write", content: original, result: undefined }));
  expect(await prepareLocalReview(request, dependencies)).toMatchObject({ state: "review-complete",
    payload: { operationId: state.operationId } });
});

it.each(["ceilingOverride", "additionalPassAuthorization"] as const)("replays a native member admission across transient %s references", async field => {
  const deliveryAdmission = createDeliveryLocalReviewAdmission("f".repeat(40)), target = deliveryAdmission.target;
  const grant = field === "ceilingOverride" ? { target, lane: "standard" as const, exhaustedPassCount: 0, nextPass: 1 }
    : { target, lane: "standard" as const, precedingProducerId: "producer-1", completedPasses: 0, nextPass: 1 };
  const admission = DeliveryLocalReviewAdmissionSchema.parse({ ...deliveryAdmission, [field]: grant });
  const h = await nativeLocalReview(admission);
  onTestFinished(h.cleanup);
  const facts = h.operations.nativeFacts;
  if (facts === undefined) throw new Error("Expected native decision facts");
  const resolved = await resolveNativeExtraPassJudgment({ facts, repositoryId: h.state.repositoryId,
    subject: { lineage: h.state.lineage, headSha: h.state.target.headSha, subjectDigest: h.state.target.targetId },
    policyTarget: target, lane: "standard", completedPasses: 0, [field]: grant,
    actor: h.state.request.authorIdentity, now: h.prepared.dependencies.now() });
  const decisionKey = resolved.judgment?.[field]?.decisionKey;
  expect(decisionKey).toEqual(expect.stringMatching(/^sha256:/u));
  const snapshot = await h.operations.readOperationSnapshot(), version = await h.store.version();
  const replay = await prepareLocalReview({ schemaVersion: 1, evaluatorIdentity: h.state.request.evaluatorIdentity,
    routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
      ownership: "self", surfaceAuthority: "ordinary" }, memberHeadObjectId: admission.vehicle.head, deliveryAdmission: { ...admission,
      [field]: { ...grant, decisionKey } } }, h.prepared.dependencies);
  expect(replay).toMatchObject({ state: "ready", payload: { operationId: h.state.operationId } });
  expect(await h.operations.readOperationSnapshot()).toEqual(snapshot);
  expect(await h.store.version()).toEqual(version);
});

it.each([["ceilingOverride", "keyless"], ["ceilingOverride", "keyed"], ["additionalPassAuthorization", "keyless"],
  ["additionalPassAuthorization", "keyed"]] as const)("replays a completed native member admission granted by a prior %s "
  + "decision on a %s re-entry", async (field, form) => {
  const deliveryAdmission = createDeliveryLocalReviewAdmission("f".repeat(40)), target = deliveryAdmission.target;
  const grant = field === "ceilingOverride" ? { target, lane: "standard" as const, exhaustedPassCount: 0, nextPass: 1 }
    : { target, lane: "standard" as const, precedingProducerId: "producer-1", completedPasses: 0, nextPass: 1 };
  const admission = DeliveryLocalReviewAdmissionSchema.parse({ ...deliveryAdmission, [field]: grant });
  const h = await nativeLocalReview(admission);
  onTestFinished(h.cleanup);
  const facts = h.operations.nativeFacts;
  if (facts === undefined) throw new Error("Expected native decision facts");
  const resolved = await resolveNativeExtraPassJudgment({ facts, repositoryId: h.state.repositoryId,
    subject: { lineage: h.state.lineage, headSha: h.state.target.headSha, subjectDigest: h.state.target.targetId },
    policyTarget: target, lane: "standard", completedPasses: 0, [field]: grant,
    actor: h.state.request.authorIdentity, now: h.prepared.dependencies.now() });
  const decisionKey = resolved.judgment?.[field]?.decisionKey;
  const receipt = createReviewReceipt({ target: h.state.target, requirement: h.state.requirement, request: h.state.request,
    applicabilityId: null, reviewRunId: "review-1", evaluatorIdentity: h.state.request.evaluatorIdentity,
    attestingRuntimeIdentity: h.state.attestation.runtimeIdentity, attestationMechanism: h.state.attestation.mechanism,
    providerEventIdentity: null, result: "clean", findings: [] });
  await recordLocalReceiptConclusion(h.operations, { state: h.state, receipt, now: h.prepared.dependencies.now() });
  const receiptStore = new LocalForwardReviewReceiptStore(h.publisher, h.state.repositoryId);
  const dependencies = { ...h.prepared.dependencies, outcomes: h.outcomes,
    readReceipts: (targetId: string) => readLocalReviewReceipts({ receiptStore, outcomes: h.outcomes }, targetId),
    materialize: async () => { throw new Error("Completed admission must not rematerialize a source"); },
    resolvePassJudgments: createNativeLocalPassJudgmentResolver({ input: { ...h, workItem: h.primary.reference.owner },
      operationStore: h.operations, subjects: h.prepared.dependencies, deriveTarget: h.prepared.dependencies.deriveTarget,
      validateDeliveryAdmission: h.prepared.dependencies.validateDeliveryAdmission }) };
  const version = await h.store.version();
  const replay = await prepareLocalReview({ schemaVersion: 1, evaluatorIdentity: h.state.request.evaluatorIdentity,
    routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
      ownership: "self", surfaceAuthority: "ordinary" }, memberHeadObjectId: admission.vehicle.head,
    deliveryAdmission: form === "keyless" ? admission : { ...admission, [field]: { ...grant, decisionKey } } }, dependencies);
  expect(replay, JSON.stringify(replay)).toMatchObject({ state: "review-complete", payload: { operationId: h.state.operationId } });
  expect(await h.store.version()).toEqual(version);
});
