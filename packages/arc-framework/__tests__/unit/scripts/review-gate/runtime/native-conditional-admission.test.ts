/** Conditional authority is consumed by actual pending admissions and retained by portable ended producers. */
import { expect, it, onTestFinished } from "vitest";
import { createNativeConditionalAdmissionFixture } from "../../../../fixtures/native-conditional-pass.js";
import { createFrontlineFixture } from "../../../../fixtures/frontline-review.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { lifecycleSuccess } from "../../../../helpers/store/lifecycle-harness.js";
import { createDispositionSet, approveDispositionSet } from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { composeReviewDispositionRecord } from "../../../../../src/lib/store/kinds/review/evidence/composed-record.js";
import { publishNativeReviewSuccessor } from "../../../../../src/scripts/review-gate/runtime/native-review-successor.js";
import { publishNativeConditionalPass } from "../../../../../src/scripts/review-gate/runtime/native-conditional-pass.js";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import { reviewDecisionKey } from "../../../../../src/lib/store/kinds/review/decision/key.js";
import { publishNativeReviewPerformance } from "../../../../../src/scripts/review-gate/runtime/native-review-performance.js";
import { NativeReviewInFlightStateStore } from "../../../../../src/scripts/review-gate/hosts/local/in-flight-state-store.js";
import { createFrontlineAdmission } from "../../../../../src/scripts/review-gate/core/frontline-admission.js";
import { recordLaneAttempt, recordFrontlineAttempt } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { executeFrontlineRun } from "../../../../../src/scripts/review-gate/policy/frontline-operation.js";
import { normalizeFrontlineOutcome } from "../../../../../src/scripts/review-gate/policy/frontline-outcome.js";
import { LocalFrontlineOutcomeStore } from "../../../../../src/scripts/review-gate/hosts/local/frontline-outcome-store.js";

async function conditionalAdmission(perform = true) {
  const common = await createNativeConditionalAdmissionFixture("frontline", perform,
    { kind: "candidate", candidateId: canonicalDigest({ candidate: "conditional-review" }) });
  onTestFinished(common.cleanup);
  const { f, decision, authorizationId, target, publisher, operations, performanceInput } = common;
  const fixture = createFrontlineFixture(target, { lineage: f.outcome.lineage });
  const admission = createFrontlineAdmission({ ...fixture.admission, logicalPass: f.input.capture.nextPass });
  const pendingInput = { lane: "frontline" as const, repositoryId: target.repositoryId,
    changeRequestId: null, headSha: target.headSha, lineage: admission.lineage, logicalPass: admission.logicalPass,
    retryGeneration: admission.retryGeneration, attemptId: admission.operationId, sourceId: fixture.outcomeRecord.sourceIdentity,
    outcome: "pending" as const, consumedPass: false, frontline: { admission, effectiveCoverage: null }, now: "2026-10-20T14:00:00Z",
    conditionalPendingAdmission: { authorizationId, repositoryId: target.repositoryId, lane: "frontline" as const, lineage: admission.lineage,
      producedHeadSha: target.headSha, nextPass: admission.logicalPass, admissionId: admission.operationId, now: "2026-10-20T14:00:00Z",
      confirmDispositionSetCurrent: async (producer: string, id: string) => {
        const evidence = await f.input.evidence.read(id);
        return evidence?.value.dispositionSet.producerId === producer && evidence.value.successorDispositionSetId === null;
      } } };
  return { f, decision, authorizationId, target, fixture, admission, publisher, operations, pendingInput, performanceInput };
}

it("cites an approved-fix decision on admission and keeps that citation after frontline execution ends", async () => {
  const { f, decision, authorizationId, target, fixture, admission, publisher, operations, pendingInput } = await conditionalAdmission();
  const pending = await recordLaneAttempt(operations, pendingInput);
  expect(pending.attempts.find(attempt => attempt.attemptId === admission.operationId)?.admittedBy).toBe(authorizationId);
  const outcome = normalizeFrontlineOutcome({ providerResult: { kind: "clean" }, source: fixture.outcomeRecord.outcome.source,
    target, pass: admission.logicalPass, maxPasses: admission.maxPasses });
  await executeFrontlineRun({ operationStore: operations, outcomeStore: new LocalFrontlineOutcomeStore(publisher),
    outcomes: f.input.outcomes, withOperationLock: async (_id, _wait, action) => action(),
    execute: async () => ({ outcome, executableIdentity: fixture.outcomeRecord.executableIdentity }),
    now: () => "2026-10-20T14:01:00Z" }, { admission, lockWaitMs: 1 });
  await recordFrontlineAttempt(operations, { admission, outcome, now: "2026-10-20T14:02:00Z" });
  expect((await f.input.outcomes.read(admission.operationId))?.value.admittedBy).toBe(authorizationId);
  expect(lifecycleSuccess(await f.h.store.history({ reference: decision.reference }))).toHaveLength(1);
  expect(await f.input.decisions.read(authorizationId)).toEqual(decision);
  const second = await createReviewCheckout(f.h);
  onTestFinished(second.cleanup);
  const secondPublisher = new RepositoryGitCommonStatePublisher(second.exec, second.cwd);
  const secondOperations = new NativeReviewInFlightStateStore({ publisher: secondPublisher, workItem: f.primary.reference.owner,
    outcomes: f.input.outcomes, evidence: f.input.evidence, decisions: f.input.decisions, projectId: f.input.readProjectId });
  const snapshot = await secondOperations.readOperationSnapshot();
  expect(snapshot.status === "complete" && snapshot.records.some(record => record.state.kind === "lane-progress"
    && record.state.attempts.some(attempt => attempt.attemptId === admission.operationId && attempt.admittedBy === authorizationId))).toBe(true);
  expect(await secondPublisher.list({ root: "review-gate", namespace: "in-flight" })).toEqual([]);
});

it("refuses an unperformed approved fix and admits after its performance is recorded", async () => {
  const { f, operations, pendingInput, performanceInput, authorizationId, admission, publisher } = await conditionalAdmission(false);
  await expect(recordLaneAttempt(operations, pendingInput)).rejects.toThrow("not performed");
  expect(await publisher.list({ root: "review-gate", namespace: "in-flight" })).toEqual([]);
  await publishNativeReviewPerformance(performanceInput);
  const pending = await recordLaneAttempt(operations, pendingInput);
  expect(pending.attempts.find(attempt => attempt.attemptId === admission.operationId)?.admittedBy).toBe(authorizationId);
  expect((await f.input.outcomes.list()).status).toBe("complete");
});

it.each(["lane", "lineage", "pass"] as const)("refuses a conditional admission with a different %s and continues after correction", async field => {
  const { operations, pendingInput, admission, authorizationId, publisher } = await conditionalAdmission();
  const conditional = { ...pendingInput.conditionalPendingAdmission,
    ...(field === "lane" ? { lane: "standard" as const } : field === "lineage"
      ? { lineage: { kind: "candidate" as const, candidateId: canonicalDigest({ candidate: "another" }) } }
      : { nextPass: pendingInput.logicalPass + 1 }) };
  await expect(recordLaneAttempt(operations, { ...pendingInput, conditionalPendingAdmission: conditional }))
    .rejects.toThrow("does not match the named admission");
  expect(await publisher.list({ root: "review-gate", namespace: "in-flight" })).toEqual([]);
  const pending = await recordLaneAttempt(operations, pendingInput);
  expect(pending.attempts.find(attempt => attempt.attemptId === admission.operationId)?.admittedBy).toBe(authorizationId);
});

it("replays a cited pending admission without changing its working-state version", async () => {
  const { operations, pendingInput, decision, f } = await conditionalAdmission();
  const pending = await recordLaneAttempt(operations, pendingInput);
  const before = await operations.readOperation(pending.operationId);
  expect(await recordLaneAttempt(operations, pendingInput)).toEqual(before.state);
  expect(await operations.readOperation(pending.operationId)).toEqual(before);
  expect(await f.input.decisions.read(reviewDecisionKey(decision.value))).toEqual(decision);
});

it("refuses a different produced head and admits after restoring the verified fix head", async () => {
  const { operations, pendingInput, authorizationId, admission, publisher } = await conditionalAdmission();
  await expect(recordLaneAttempt(operations, { ...pendingInput, conditionalPendingAdmission: {
    ...pendingInput.conditionalPendingAdmission, producedHeadSha: "a".repeat(40) } })).rejects.toThrow("produced head");
  expect(await publisher.list({ root: "review-gate", namespace: "in-flight" })).toEqual([]);
  expect((await recordLaneAttempt(operations, pendingInput)).attempts
    .find(attempt => attempt.attemptId === admission.operationId)?.admittedBy).toBe(authorizationId);
});

async function endConditionalFrontline(h: Awaited<ReturnType<typeof conditionalAdmission>>, result: "clean" | "malformed",
  retryOfOperationId?: string) {
  const outcome = normalizeFrontlineOutcome({ providerResult: result === "clean" ? { kind: "clean" } : { kind: "malformed" },
    source: h.fixture.outcomeRecord.outcome.source, target: h.admission.target,
    pass: h.admission.logicalPass, maxPasses: h.admission.maxPasses });
  await executeFrontlineRun({ operationStore: h.operations, outcomeStore: new LocalFrontlineOutcomeStore(h.publisher),
    outcomes: h.f.input.outcomes, withOperationLock: async (_id, _wait, action) => action(),
    execute: async () => ({ outcome, executableIdentity: h.fixture.outcomeRecord.executableIdentity }),
    now: () => "2026-10-20T14:01:00Z" }, { admission: h.admission, lockWaitMs: 1,
    ...(retryOfOperationId === undefined ? {} : { retryOfOperationId }) });
  await recordFrontlineAttempt(h.operations, { admission: h.admission, outcome, now: "2026-10-20T14:02:00Z" });
}

it("refuses a consumed decision's retry under a changed source and accepts its original contract one generation higher", async () => {
  const h = await conditionalAdmission();
  await recordLaneAttempt(h.operations, h.pendingInput);
  await endConditionalFrontline(h, "malformed");
  const source = h.admission.frontlineReview.source;
  if (source === null) throw new Error("Expected executable frontline source");
  const altered = createFrontlineAdmission({ ...h.admission, retryGeneration: 1,
    frontlineReview: { ...h.admission.frontlineReview, source: { ...source, sourceId: "alternate-cli" } } });
  const alteredInput = { ...h.pendingInput, retryGeneration: 1, attemptId: altered.operationId, sourceId: "alternate-cli",
    frontline: { admission: altered, effectiveCoverage: null }, conditionalPendingAdmission: {
      ...h.pendingInput.conditionalPendingAdmission, admissionId: altered.operationId } };
  await expect(recordLaneAttempt(h.operations, alteredInput)).rejects.toThrow("retry must retain");
  const admission = createFrontlineAdmission({ ...h.admission, retryGeneration: 1 });
  const pendingInput = { ...h.pendingInput, retryGeneration: 1, attemptId: admission.operationId,
    frontline: { admission, effectiveCoverage: null }, conditionalPendingAdmission: {
      ...h.pendingInput.conditionalPendingAdmission, admissionId: admission.operationId } };
  const pending = await recordLaneAttempt(h.operations, pendingInput);
  expect(pending.attempts.find(attempt => attempt.attemptId === admission.operationId)?.admittedBy).toBe(h.authorizationId);
  await endConditionalFrontline({ ...h, admission }, "clean", h.admission.operationId);
  expect((await h.f.input.outcomes.read(admission.operationId))?.value).toMatchObject({ retryGeneration: 1,
    logicalPass: h.admission.logicalPass, outcome: "clean", admittedBy: h.authorizationId });
});

async function approveNextConditionalFix(h: Awaited<ReturnType<typeof conditionalAdmission>>) {
  const id = h.f.input.capture.dispositionSetId, prior = await h.f.input.evidence.read(id);
  if (prior === null) throw new Error("Expected prior approval");
  const { dispositionSetId: ignored, ...identity } = prior.value.dispositionSet;
  void ignored;
  const dispositionSet = createDispositionSet({ ...identity, proposedBy: "next-response-proposer" });
  const next = { ...prior.value, dispositionSet, approval: approveDispositionSet({ dispositionSet,
    approvedBy: h.f.input.capture.authorizedBy, approvedAt: "2026-10-20T13:01:00Z" }), predecessorDispositionSetId: id };
  const record = composeReviewDispositionRecord(h.f.outcome, [{ ...prior.value,
    successorDispositionSetId: dispositionSet.dispositionSetId }, next], h.f.primary.reference.owner);
  await publishNativeReviewSuccessor({ ...h.f.approvalInput, record, store: h.f.h.store, inFlight: h.operations });
  const grant = await publishNativeConditionalPass({ ...h.f.input, capture: { ...h.f.input.capture,
    dispositionSetId: dispositionSet.dispositionSetId, now: "2026-10-20T13:02:00Z" } });
  const current = await h.f.input.evidence.readDispositionRecord(h.f.outcome.attemptId);
  if (current === null) throw new Error("Expected current approval");
  await publishNativeReviewPerformance({ ...h.performanceInput, record: current,
    performance: { ...h.performanceInput.performance, dispositionSetId: dispositionSet.dispositionSetId,
      performedAt: "2026-10-20T13:03:00Z" } });
  return { ...h.pendingInput, conditionalPendingAdmission: { ...h.pendingInput.conditionalPendingAdmission,
    authorizationId: reviewDecisionKey(grant.value) } };
}

it("refuses a superseded grant and admits a new approved fix's decision after correction", async () => {
  const h = await conditionalAdmission(false);
  const next = await approveNextConditionalFix(h);
  await expect(recordLaneAttempt(h.operations, h.pendingInput)).rejects.toThrow("superseded");
  const admitted = await recordLaneAttempt(h.operations, next);
  expect(admitted.attempts.find(attempt => attempt.attemptId === h.admission.operationId)?.admittedBy)
    .toBe(next.conditionalPendingAdmission.authorizationId);
  expect(await h.f.input.decisions.read(h.authorizationId)).toEqual(h.decision);
});

it("refuses a stored withdrawal and admits a fresh approved-fix decision after the old response is superseded", async () => {
  const h = await conditionalAdmission(false);
  await h.f.input.decisions.create({ ...h.decision.value, choice: { kind: "withdrawal", decisionKey: h.authorizationId },
    decidedAt: "2026-10-20T13:00:01Z" });
  await expect(recordLaneAttempt(h.operations, h.pendingInput)).rejects.toThrow("withdrawn");
  const next = await approveNextConditionalFix(h);
  expect((await recordLaneAttempt(h.operations, next)).attempts
    .find(attempt => attempt.attemptId === h.admission.operationId)?.admittedBy).toBe(next.conditionalPendingAdmission.authorizationId);
});
