/** Pin cleanup reads retained native execution rather than legacy operation files. */
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { nativeLocalReview } from "../../../../../fixtures/native-local-review.js";
import { createNativeLocalSourceSweepRecords } from "../../../../../../src/scripts/review-gate/hosts/local/source-sweep-records.js";
import { sweepLocalReviewSources } from "../../../../../../src/scripts/review-gate/core/local-source-sweep.js";
import { LocalForwardReviewReceiptStore } from "../../../../../../src/scripts/review-gate/hosts/local/receipt-store.js";
import { createReviewReceipt } from "../../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createReviewOutcomePort } from "../../../../../../src/lib/store/kinds/review/outcome/access.js";
import { nativeReviewInFlightRecordName } from "../../../../../../src/scripts/review-gate/hosts/local/in-flight-state-store.js";
import { LocalOperationStateStoreError } from "../../../../../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { RepositoryLocalReviewSourceStore } from "../../../../../../src/scripts/review-gate/hosts/local/source-store.js";
import { attestLocalReviewCommand } from "../../../../../../src/scripts/review-gate/runtime/local-attest-command.js";
import { prepareLocalReview } from "../../../../../../src/scripts/review-gate/runtime/local-prepare.js";
import { createLocalReviewPreparationFixture } from "../../../../../fixtures/local-review-preparation.js";
import { recordLocalReceiptConclusion } from "../../../../../../src/scripts/review-gate/lane-progress.js";
import { bindNativeReviewPorts } from "../../../../../helpers/store/native-review-ports.js";
import { cancelLocalReviewCommand } from "../../../../../../src/scripts/review-gate/runtime/local-cancel-command.js";
import type { ReviewOperationStateStore, ReviewOutcomePort } from "../../../../../../src/scripts/review-gate/core/ports.js";

it("keeps an unfinished native review's pin until its cleanup deadline", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const pins = new Set([h.state.operationId]);
  const records = await createNativeLocalSourceSweepRecords({ publisher: h.publisher, store: h.store, projectId: h.projectId,
    operationIds: [...pins] });
  const receipts = new LocalForwardReviewReceiptStore(h.publisher, h.state.repositoryId);
  expect(await sweepLocalReviewSources({ ...records, listOperationIds: async () => [...pins],
    readReceipts: targetId => receipts.readReceipts(targetId), release: async id => { pins.delete(id); },
    now: () => h.state.updatedAt })).toEqual({ reaped: [] });
  expect([...pins]).toEqual([h.state.operationId]);
  expect(await sweepLocalReviewSources({ ...records, listOperationIds: async () => [...pins],
    readReceipts: targetId => receipts.readReceipts(targetId), release: async id => { pins.delete(id); },
    now: () => new Date(Date.parse(h.state.updatedAt) + h.state.cleanupTtlMs).toISOString() }))
    .toEqual({ reaped: [{ operationId: h.state.operationId, reason: "terminally-expired" }] });
  expect([...pins]).toEqual([]);
});

it("releases a finished native review's pin by its outcome without a receipt ledger", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const state = h.state;
  const receipt = createReviewReceipt({ target: state.target, requirement: state.requirement, request: state.request,
    applicabilityId: null, reviewRunId: "review-1", evaluatorIdentity: state.request.evaluatorIdentity,
    attestingRuntimeIdentity: state.attestation.runtimeIdentity, attestationMechanism: state.attestation.mechanism,
    providerEventIdentity: null, result: "clean", findings: [] });
  await recordLocalReceiptConclusion(h.operations, { state, receipt, now: h.prepared.dependencies.now() });
  expect(await h.operations.readOperation(state.operationId)).toMatchObject({ state: null });
  const pins = new Set([state.operationId]);
  const records = await createNativeLocalSourceSweepRecords({ publisher: h.publisher, store: h.store, projectId: h.projectId,
    operationIds: [...pins] });
  const receipts = new LocalForwardReviewReceiptStore(h.publisher, state.repositoryId);
  expect(await sweepLocalReviewSources({ ...records, listOperationIds: async () => [...pins],
    readReceipts: targetId => receipts.readReceipts(targetId), release: async id => { pins.delete(id); },
    now: () => state.updatedAt })).toEqual({ reaped: [{ operationId: state.operationId, reason: "completed" }] });
  expect([...pins]).toEqual([]);
  expect(await h.publisher.list({ root: "review-gate", namespace: "evidence" })).toEqual([]);
});

it("releases another work item's finished pin while preserving this work item's unfinished review", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const { state, operations, prepared } = await prepareSibling(h,
    { kind: "candidate", candidateId: `sha256:${"8".repeat(64)}` });
  const receipt = createReviewReceipt({ target: state.target, requirement: state.requirement, request: state.request,
    applicabilityId: null, reviewRunId: "other-review", evaluatorIdentity: state.request.evaluatorIdentity,
    attestingRuntimeIdentity: state.attestation.runtimeIdentity, attestationMechanism: state.attestation.mechanism,
    providerEventIdentity: null, result: "clean", findings: [] });
  await recordLocalReceiptConclusion(operations, { state, receipt, now: prepared.dependencies.now() });
  expect(await h.outcomes.read(state.operationId)).toBeNull();
  const pins = new Set([h.state.operationId, state.operationId]);
  const records = await createNativeLocalSourceSweepRecords({ publisher: h.publisher, store: h.store, projectId: h.projectId,
    operationIds: [...pins] });
  const receipts = new LocalForwardReviewReceiptStore(h.publisher, state.repositoryId);
  expect(await sweepLocalReviewSources({ ...records, listOperationIds: async () => [...pins],
    readReceipts: targetId => receipts.readReceipts(targetId), release: async id => { pins.delete(id); },
    now: () => state.updatedAt })).toEqual({ reaped: [{ operationId: state.operationId, reason: "completed" }] });
  expect([...pins]).toEqual([h.state.operationId]);
});

it("refuses malformed execution inventory with a repair route and resumes after repair", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const owner = h.primary.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected admitted UID");
  const uid = owner.uid;
  const name = nativeReviewInFlightRecordName(uid, h.state.operationId);
  const location = { root: "review-gate", namespace: "in-flight" } as const;
  const original = await h.publisher.read(location, name);
  if (original === null) throw new Error("Expected retained native execution");
  await h.publisher.update(location, name, () => ({ kind: "write", content: "{", result: undefined }));
  const input = { publisher: h.publisher, store: h.store, projectId: h.projectId, operationIds: [h.state.operationId] };
  await expect(createNativeLocalSourceSweepRecords(input)).rejects.toMatchObject({ code: "malformed-operation-state",
    message: expect.stringMatching(new RegExp(`^Native execution record '${name}' is malformed: .+\\. Repair or remove it, then retry\\.$`, "su")) });
  await h.publisher.update(location, name, () => ({ kind: "write", content: original, result: undefined }));
  expect(await (await createNativeLocalSourceSweepRecords(input)).readOperation(h.state.operationId))
    .toMatchObject({ state: { operationId: h.state.operationId, workItem: h.primary.reference.owner } });
});

it("releases a terminal evaluator failure's pin even when no receipt was written", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const state = h.state, receipts = new LocalForwardReviewReceiptStore(h.publisher, state.repositoryId);
  await attestLocalReviewCommand({ schemaVersion: 1, operationId: state.operationId,
    result: { status: "failed", result: null, evaluatorIdentity: state.request.evaluatorIdentity,
      reviewRunId: "failed-review", applicabilityId: null, findings: [] } }, {
    operationStore: h.operations, sourceStore: h.prepared.dependencies.sourceStore, receiptStore: receipts,
    withLocalReviewLock: action => action(),
    resolveAuthority: async (evaluator, member, admission) =>
      (await h.prepared.dependencies.resolveAuthority(evaluator, member, admission)).authority,
    resolveGuidanceDigest: async () => state.guidanceDigest, confirmTarget: h.prepared.dependencies.confirmTarget,
    inspectMaterialization: async () => "materialized", releaseMaterialization: async () => {},
    now: () => h.prepared.dependencies.now(),
  });
  expect((await h.outcomes.read(state.operationId))?.value).toMatchObject({ outcome: "terminal-failure" });
  expect((await h.outcomes.read(state.operationId))?.value.local).not.toHaveProperty("receipt");
  const pins = new Set([state.operationId]);
  const records = await createNativeLocalSourceSweepRecords({ publisher: h.publisher, store: h.store, projectId: h.projectId,
    operationIds: [...pins] });
  expect(await sweepLocalReviewSources({ ...records, listOperationIds: async () => [...pins],
    readReceipts: targetId => receipts.readReceipts(targetId), release: async id => { pins.delete(id); },
    now: () => state.updatedAt })).toEqual({ reaped: [{ operationId: state.operationId, reason: "completed" }] });
  expect([...pins]).toEqual([]);
  expect(await h.publisher.list({ root: "review-gate", namespace: "evidence" })).toEqual([]);
});

async function prepareSibling(h: Awaited<ReturnType<typeof nativeLocalReview>>, lineage = h.state.lineage) {
  const other = await h.seedMeta("another-work-item");
  const outcomes = createReviewOutcomePort(h.store, other.reference.owner);
  const operations = bindNativeReviewPorts({ store: h.store, owner: other.reference.owner,
    publisher: h.publisher, projectId: h.projectId }).inFlight;
  const prepared = createLocalReviewPreparationFixture({ repositoryId: h.state.repositoryId });
  prepared.dependencies.operationStore = operations;
  prepared.dependencies.sourceStore = new RepositoryLocalReviewSourceStore(h.publisher);
  prepared.dependencies.resolveLineage = async () => lineage;
  const admitted = await prepareLocalReview({ schemaVersion: 1, evaluatorIdentity: "evaluator-1",
    routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
      ownership: "self", surfaceAuthority: "ordinary" }, policyJudgment: { scopeMode: "whole-target" } }, prepared.dependencies);
  expect(admitted.state).toBe("ready");
  const snapshot = await operations.readOperationSnapshot();
  if (snapshot.status !== "complete") throw new Error(snapshot.reason);
  const state = snapshot.records.find(({ state }) => state.kind === "local-review")?.state;
  if (state?.kind !== "local-review") throw new Error("Expected another admitted local review");
  return { other, outcomes, operations, prepared, state };
}

it("repairs duplicate ownership by cancelling reviews, retaining source until the final owner completes", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const sibling = await prepareSibling(h);
  expect(sibling.state.operationId).toBe(h.state.operationId);
  const input = { publisher: h.publisher, store: h.store, projectId: h.projectId, operationIds: [h.state.operationId] };
  const inventory = await createNativeLocalSourceSweepRecords(input);
  const owner = sibling.other.reference.owner, primary = h.primary.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined || primary.type !== "work-item" || primary.uid === undefined) {
    throw new Error("Expected both owners' UIDs");
  }
  const uid = owner.uid, primaryUid = primary.uid;
  const refused = await inventory.readOperation(h.state.operationId).then(() => null, (error: unknown) => error);
  expect(refused).toBeInstanceOf(LocalOperationStateStoreError);
  expect(refused).toMatchObject({ code: "malformed-operation-state" });
  expect([primaryUid, uid].filter(id => (refused as Error).message.includes(id))).toEqual([primaryUid, uid]);
  const receipts = new LocalForwardReviewReceiptStore(h.publisher, h.state.repositoryId);
  const cancel = (operationStore: ReviewOperationStateStore, outcomes: ReviewOutcomePort) => cancelLocalReviewCommand(
    { schemaVersion: 1, operationId: h.state.operationId }, { operationStore, outcomes, receiptStore: receipts,
      withLocalReviewLock: action => action(), releaseMaterialization: async () => {}, now: () => h.state.updatedAt });
  expect(await cancel(sibling.operations, sibling.outcomes)).toMatchObject({ state: "cancelled" });
  expect(await (await createNativeLocalSourceSweepRecords(input)).readOperation(h.state.operationId))
    .toMatchObject({ state: { workItem: h.primary.reference.owner } });
  expect(await cancel(h.operations, h.outcomes)).toMatchObject({ state: "cancelled" });
  const pins = new Set([h.state.operationId]);
  const records = await createNativeLocalSourceSweepRecords(input);
  expect(await sweepLocalReviewSources({ ...records, listOperationIds: async () => [...pins],
    readReceipts: targetId => receipts.readReceipts(targetId), release: async id => { pins.delete(id); },
    now: () => h.state.updatedAt })).toEqual({ reaped: [{ operationId: h.state.operationId, reason: "completed" }] });
  expect([...pins]).toEqual([]);
});

it("skips another operation's damaged execution record, keeping this pin's cleanup", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const { state, other } = await prepareSibling(h, { kind: "candidate", candidateId: `sha256:${"8".repeat(64)}` });
  const owner = other.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected the sibling's admitted UID");
  await h.publisher.update({ root: "review-gate", namespace: "in-flight" }, nativeReviewInFlightRecordName(owner.uid, state.operationId),
    () => ({ kind: "write", content: "{", result: undefined }));
  const pins = new Set([h.state.operationId]);
  const records = await createNativeLocalSourceSweepRecords({ publisher: h.publisher, store: h.store, projectId: h.projectId,
    operationIds: [...pins] });
  const receipts = new LocalForwardReviewReceiptStore(h.publisher, h.state.repositoryId);
  expect(await sweepLocalReviewSources({ ...records, listOperationIds: async () => [...pins],
    readReceipts: targetId => receipts.readReceipts(targetId), release: async id => { pins.delete(id); },
    now: () => new Date(Date.parse(h.state.updatedAt) + h.state.cleanupTtlMs).toISOString() }))
    .toEqual({ reaped: [{ operationId: h.state.operationId, reason: "terminally-expired" }] });
  expect([...pins]).toEqual([]);
});

it("skips another operation's non-file entry, and refuses one at a pinned record's name until a record replaces it", async () => {
  const h = await nativeLocalReview();
  onTestFinished(h.cleanup);
  const owner = h.primary.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected admitted UID");
  const location = { root: "review-gate", namespace: "in-flight" } as const;
  const directory = join(h.commonDir, "arc", location.root, location.namespace);
  const name = nativeReviewInFlightRecordName(owner.uid, h.state.operationId);
  const input = { publisher: h.publisher, store: h.store, projectId: h.projectId, operationIds: [h.state.operationId] };
  await mkdir(join(directory, "stray"));
  await mkdir(join(directory, nativeReviewInFlightRecordName(owner.uid, "another-operation")));
  expect(await (await createNativeLocalSourceSweepRecords(input)).readOperation(h.state.operationId))
    .toMatchObject({ state: { operationId: h.state.operationId } });
  const original = await h.publisher.read(location, name);
  if (original === null) throw new Error("Expected retained native execution");
  await h.publisher.update(location, name, () => ({ kind: "delete", result: undefined }));
  await mkdir(join(directory, name));
  await expect(createNativeLocalSourceSweepRecords(input)).rejects.toMatchObject({ code: "malformed-operation-state",
    message: `Native execution record '${name}' is malformed: it is not a record file. Repair or remove it, then retry.` });
  await rm(join(directory, name), { recursive: true });
  await h.publisher.update(location, name, () => ({ kind: "write", content: original, result: undefined }));
  expect(await (await createNativeLocalSourceSweepRecords(input)).readOperation(h.state.operationId))
    .toMatchObject({ state: { operationId: h.state.operationId } });
});
