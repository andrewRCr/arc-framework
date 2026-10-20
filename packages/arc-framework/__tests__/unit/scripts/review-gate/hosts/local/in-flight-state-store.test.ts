/** Native pending execution persists separately from legacy operation snapshots. */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../../helpers/store/review-checkout.js";
import { createLocalReviewPreparationFixture } from "../../../../../fixtures/local-review-preparation.js";
import { prepareLocalReview } from "../../../../../../src/scripts/review-gate/runtime/local-prepare.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../../src/lib/git-common-state.js";
import { createReviewOutcomePort } from "../../../../../../src/lib/store/kinds/review/outcome/access.js";
import { NativeReviewInFlightStateStore } from "../../../../../../src/scripts/review-gate/hosts/local/in-flight-state-store.js";
import { createReviewReceipt, createReviewTarget } from "../../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { mapReviewAttempt } from "../../../../../../src/lib/store/kinds/review/mapping-outcomes.js";
import { canonicalDigest } from "../../../../../../src/lib/kernel/index.js";
import { recordLocalReceiptConclusion, recordLaneAttempt, recordHostedRequestAdmission, acknowledgeHostedRequest,
} from "../../../../../../src/scripts/review-gate/lane-progress.js";
import { createHostedHandleFixture, createHostedTerminalAttemptFixture } from "../../../../../fixtures/hosted-review.js";
import { createFrontlineFixture } from "../../../../../fixtures/frontline-review.js";
import { mapHostedAttempt } from "../../../../../../src/lib/store/kinds/review/mapping-hosted.js";
import { lifecycleSuccess } from "../../../../../helpers/store/lifecycle-harness.js";

async function fixture() {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example");
  const checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  const prepared = createLocalReviewPreparationFixture({ repositoryId: projectId });
  const result = await prepareLocalReview({ schemaVersion: 1, evaluatorIdentity: "evaluator-1",
    routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
      ownership: "self", surfaceAuthority: "ordinary" }, policyJudgment: { scopeMode: "whole-target" } }, prepared.dependencies);
  if (result.state !== "ready") throw new Error(JSON.stringify(result));
  const lane = prepared.laneProgress(), local = prepared.published();
  if (lane?.kind !== "lane-progress" || local?.kind !== "local-review") throw new Error("Expected pending local admission");
  const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const outcomes = createReviewOutcomePort(h.store, primary.reference.owner);
  return { ...checkout, primary, prepared, lane, local, publisher, outcomes,
    operations: new NativeReviewInFlightStateStore({ publisher, workItem: primary.reference.owner,
      outcomes, projectId: h.projectId }) };
}

it("round-trips pending local execution in its own namespace without legacy lane facts", async () => {
  const h = await fixture();
  expect(await h.operations.publishOperation(h.lane, 0)).toEqual({ version: 1 });
  expect(await h.operations.publishOperation(h.local, 0)).toEqual({ version: 1 });
  const directory = join(h.commonDir, "arc/review-gate/in-flight");
  const files = await readdir(directory);
  expect(files).toHaveLength(2);
  const raw = await Promise.all(files.map(async file => JSON.parse(await readFile(join(directory, file), "utf8")) as unknown));
  expect(raw).toContainEqual(expect.objectContaining({ state: expect.objectContaining({ kind: "lane-progress" }) }));
  for (const record of raw) expect(record).not.toHaveProperty("state.completedPasses");
  expect(await h.operations.readOperation(h.lane.operationId)).toEqual({ version: 1,
    state: { ...h.lane, workItem: h.primary.reference.owner } });
  expect(await h.operations.readOperation(h.local.operationId)).toEqual({ version: 1,
    state: { ...h.local, workItem: h.primary.reference.owner } });
  expect(await h.publisher.list({ root: "review-gate", namespace: "operations" })).toEqual([]);
});

it("retains the admitting decision while composing a pending attempt", async () => {
  const h = await fixture(), admittedBy = canonicalDigest({ decision: "extra-pass" });
  const lane = { ...h.lane, attempts: h.lane.attempts.map(attempt => ({ ...attempt, admittedBy })) };
  await h.operations.publishOperation(lane, 0);
  expect(await h.operations.readOperation(lane.operationId)).toMatchObject({ state: { attempts: [{ admittedBy }] } });
});

async function finishLocal(h: Awaited<ReturnType<typeof fixture>>) {
  const receipt = createReviewReceipt({ target: h.local.target, requirement: h.local.requirement, request: h.local.request,
    applicabilityId: null, reviewRunId: "run-1", evaluatorIdentity: h.local.request.evaluatorIdentity,
    attestingRuntimeIdentity: h.local.attestation.runtimeIdentity, attestationMechanism: h.local.attestation.mechanism,
    providerEventIdentity: null, result: "clean", findings: [] });
  const endedLane = await recordLocalReceiptConclusion(h.prepared.dependencies.operationStore,
    { state: h.local, receipt, now: h.local.updatedAt });
  const attempt = endedLane.attempts[0];
  if (attempt === undefined) throw new Error("Expected actual pending attempt");
  const outcome = mapReviewAttempt(attempt, endedLane,
    h.lane.updatedAt, { operations: new Map([[h.local.operationId, h.local]]), discarded: new Map(),
      operationVersions: new Map(), frontline: new Map(), receipts: [{ source: "receipt", receipts: [receipt] }] });
  await h.outcomes.create(outcome);
  return outcome;
}

it("treats an outcome as ended before pruning and retains an emptied lane's version", async () => {
  const h = await fixture();
  await h.operations.publishOperation(h.lane, 0);
  await finishLocal(h);
  const ended = await h.operations.readOperation(h.lane.operationId);
  expect(ended).toMatchObject({ version: 1, state: { attempts: [] } });
  if (ended.state === null) throw new Error("Expected retained lane envelope");
  expect(await h.operations.publishOperation(ended.state, ended.version)).toEqual({ version: 2 });
  expect(await h.operations.readOperation(h.lane.operationId)).toMatchObject({ version: 2, state: { attempts: [] } });
  const entries = await h.publisher.snapshot({ root: "review-gate", namespace: "in-flight" });
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({ kind: "file", content: expect.stringContaining('"attempts":[]') });
});

it("refuses a new local attempt at a finished pass and admits its next pass", async () => {
  const h = await fixture();
  const outcome = await finishLocal(h), receipt = outcome.local?.receipt;
  if (receipt === undefined) throw new Error("Expected completed local receipt");
  h.prepared.dependencies.readReceipts = async targetId => ({ ledgerVersion: 1,
    receipts: receipt.targetId === targetId ? [receipt] : [] });
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: h.local.repositoryId, baseRef: "main", diffBaseSha: h.local.target.diffBaseSha,
    diffBaseTree: h.local.target.diffBaseTree, headSha: "e".repeat(40), headTree: "f".repeat(40) });
  h.prepared.deriveTarget.mockResolvedValue(target);
  h.prepared.dependencies.readCurrentHeadSha = async () => target.headSha;
  h.prepared.validatePolicyAdmission.mockResolvedValue({ state: "ready", pass: 2, coverageAdmission: { requestedCoverage: "complete" } });
  const result = await prepareLocalReview({ schemaVersion: 1, evaluatorIdentity: "evaluator-1",
    routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
      ownership: "self", surfaceAuthority: "ordinary" }, policyJudgment: { scopeMode: "whole-target" } }, h.prepared.dependencies);
  const next = h.prepared.laneProgress();
  if (result.state !== "ready" || next?.kind !== "lane-progress") throw new Error(JSON.stringify(result));
  const pending = next.attempts.find(attempt => attempt.outcome === "pending");
  if (pending === undefined) throw new Error("Expected actual next-pass admission");
  await expect(h.operations.publishOperation({ ...next, completedPasses: 0,
    attempts: [{ ...pending, logicalPass: 1 }] }, 0)).rejects.toMatchObject({ code: "logical-pass-already-finished" });
  expect(await h.operations.publishOperation(next, 0)).toEqual({ version: 1 });
});

it("round-trips a frontline admission and pending run through native execution state", async () => {
  const h = await fixture(), { admission, run } = createFrontlineFixture(h.local.target);
  const progress = await recordLaneAttempt(h.operations, { lane: "frontline", repositoryId: h.local.repositoryId,
    lineage: admission.lineage, logicalPass: admission.logicalPass, retryGeneration: admission.retryGeneration,
    attemptId: admission.operationId, changeRequestId: null, headSha: admission.target.headSha,
    sourceId: admission.frontlineReview.source!.sourceId, outcome: "pending", consumedPass: false,
    frontline: { admission, effectiveCoverage: null }, now: run.updatedAt });
  await h.operations.publishOperation({ ...run, outcome: "pending" }, 0);
  expect(await h.operations.readOperation(progress.operationId)).toEqual({ version: 1,
    state: { ...progress, workItem: h.primary.reference.owner } });
  expect(await h.operations.readOperation(run.operationId)).toMatchObject({ version: 1, state: { outcome: "pending" } });
  expect(await h.publisher.list({ root: "review-gate", namespace: "operations" })).toEqual([]);
});

it("round-trips hosted acknowledgment and prunes it by its admission identity", async () => {
  const h = await fixture();
  const handle = createHostedHandleFixture({ repositoryId: h.local.repositoryId, lineage: h.local.lineage });
  const admitted = await recordHostedRequestAdmission(h.operations, { repositoryId: h.local.repositoryId,
    lineage: handle.admission.lineage, request: { schemaVersion: 1, target: handle.target,
      provider: handle.provider, coverage: handle.requestedCoverage },
    reviewTarget: handle.admission.reviewTarget, requirement: handle.admission.requirement,
    actorIdentity: handle.admission.actorIdentity, authorizeCapacity: async () => {}, now: handle.artifact.createdAt });
  if (admitted.state !== "admitted") throw new Error("Expected admitted hosted request");
  const progress = await acknowledgeHostedRequest(h.operations, { admission: admitted.admission, handle, now: handle.artifact.createdAt });
  expect(progress.attempts[0]?.attemptId).not.toBe(admitted.admission.admissionId);
  expect(await h.operations.readOperation(progress.operationId)).toMatchObject({ state: { attempts: [{ hosted: { handle } }] } });
  const terminal = createHostedTerminalAttemptFixture({ admission: admitted.admission, artifact: handle.artifact, outcome: "clean" });
  const pending = progress.attempts[0];
  if (pending === undefined) throw new Error("Expected acknowledged attempt");
  const outcome = mapHostedAttempt({ ...pending, ...terminal, outcome: "clean", terminalProducer: true }, progress, progress.updatedAt);
  await h.outcomes.create(outcome);
  expect(await h.operations.readOperation(progress.operationId)).toMatchObject({ state: { attempts: [] } });
  expect(await h.publisher.list({ root: "review-gate", namespace: "operations" })).toEqual([]);
});

it("ignores legacy operation shapes when reading the native snapshot", async () => {
  const h = await fixture();
  await h.publisher.update({ root: "review-gate", namespace: "operations" }, "leftover.json",
    () => ({ kind: "write", content: "older operation bytes", result: undefined }));
  await h.operations.publishOperation(h.lane, 0);
  expect(await h.operations.readOperationSnapshot()).toEqual({ status: "complete", records: [{ version: 1,
    state: { ...h.lane, workItem: h.primary.reference.owner } }] });
});

it("isolates a reused slug's pending records by exact UID", async () => {
  const h = await fixture();
  await h.operations.publishOperation(h.lane, 0);
  lifecycleSuccess(await h.store.write({ action: "remove", reference: h.primary.reference, expected: h.primary.version,
    provenance: { verb: "remove", lifecycleAction: "remove" } }));
  const replacement = await h.seedMeta("example");
  const operations = new NativeReviewInFlightStateStore({ publisher: h.publisher, workItem: replacement.reference.owner,
    outcomes: createReviewOutcomePort(h.store, replacement.reference.owner), projectId: h.projectId });
  expect(await operations.readOperation(h.lane.operationId)).toEqual({ version: 0, state: null });
  await operations.publishOperation(h.lane, 0);
  expect(await h.operations.readOperationSnapshot()).toMatchObject({ status: "complete", records: [{ state: {
    workItem: h.primary.reference.owner } }] });
  expect(await operations.readOperationSnapshot()).toMatchObject({ status: "complete", records: [{ state: {
    workItem: replacement.reference.owner } }] });
});

it("refuses a stale write and accepts the same update after refreshing its version", async () => {
  const h = await fixture();
  await h.operations.publishOperation(h.lane, 0);
  const next = { ...h.lane, updatedAt: "2026-10-20T12:00:00Z" };
  await expect(h.operations.publishOperation(next, 0)).rejects.toMatchObject({ code: "version-conflict" });
  const current = await h.operations.readOperation(h.lane.operationId);
  expect(await h.operations.publishOperation(next, current.version)).toEqual({ version: 2 });
  expect(await h.operations.publishOperation(next, 0)).toEqual({ version: 2 });
});
