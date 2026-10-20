/** Native withdrawal preserves capture authority and records one immutable withdrawal with stable replay. */
import { expect, it, onTestFinished } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createFrontlineAdmission } from "../../../../../src/scripts/review-gate/core/frontline-admission.js";
import { recordLaneAttempt } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { createNativeConditionalFrontlineFixture, completeNativeConditionalFrontline, approveNextNativeConditionalFix } from "../../../../fixtures/native-conditional-pass.js";
import { lifecycleSuccess } from "../../../../helpers/store/lifecycle-harness.js";
import { reviewDecisionKey } from "../../../../../src/lib/store/kinds/review/decision/key.js";
import { publishNativeConditionalWithdrawal } from "../../../../../src/scripts/review-gate/runtime/native-conditional-withdrawal.js";

async function withdrawalInput(perform = false) {
  const h = await createNativeConditionalFrontlineFixture(perform);
  onTestFinished(h.cleanup);
  const { capture, ...ports } = h.f.input;
  return { h, input: { ...ports, inFlight: h.operations, withdrawal: {
    authorizationId: h.authorizationId, lane: capture.lane, repositoryId: capture.repositoryId, headSha: capture.headSha,
    lineage: capture.lineage, producerId: capture.producerId, dispositionSetId: capture.dispositionSetId,
    withdrawnBy: capture.authorizedBy, now: "2026-10-20T14:00:00Z" } } };
}

it.each([false, true])("withdraws an unconsumed pass with performance %s once and preserves its original capture", async perform => {
  const { h, input } = await withdrawalInput(perform);
  const approval = await input.evidence.read(input.withdrawal.dispositionSetId);
  const result = await publishNativeConditionalWithdrawal(input);
  if (result.state === "refused") throw new Error(result.detail);
  expect(result.state).toBe("withdrawn");
  expect(result.decision.value).toEqual({ ...h.decision.value,
    choice: { kind: "withdrawal", decisionKey: h.authorizationId }, decidedAt: input.withdrawal.now });
  expect(result.decision.reference.key).toBe(reviewDecisionKey(result.decision.value));
  expect(await publishNativeConditionalWithdrawal({ ...input, withdrawal: { ...input.withdrawal,
    now: "2026-10-20T15:00:00Z" } })).toEqual({ ...result, state: "already-withdrawn" });
  expect(await input.decisions.read(h.authorizationId)).toEqual(h.decision);
  expect(await input.evidence.read(input.withdrawal.dispositionSetId)).toEqual(approval);
  expect(lifecycleSuccess(await h.f.h.store.history({ reference: result.decision.reference }))).toHaveLength(1);
  expect(await h.publisher.list({ root: "review-gate", namespace: "operations" })).toEqual([]);
  expect(await h.publisher.list({ root: "review-gate", namespace: "in-flight" })).toEqual([]);
});

it.each(["author", "set", "producer", "head", "lane", "lineage", "project"] as const)("refuses a withdrawal with a different %s and continues with its original authority", async field => {
  const { h, input } = await withdrawalInput();
  const withdrawal = { ...input.withdrawal,
    ...(field === "author" ? { withdrawnBy: "another-authorizer" } : field === "set"
      ? { dispositionSetId: canonicalDigest({ disposition: "another" }) } : field === "producer"
      ? { producerId: "another-producer" } : field === "head" ? { headSha: "a".repeat(40) }
      : field === "lane" ? { lane: "standard" as const } : field === "lineage"
      ? { lineage: { kind: "candidate" as const, candidateId: canonicalDigest({ candidate: "another" }) } }
      : { repositoryId: "123e4567-e89b-42d3-a456-426614174100" }) };
  expect(await publishNativeConditionalWithdrawal({ ...input, withdrawal })).toMatchObject({ state: "refused", reason: "foreign-authority" });
  expect(await input.decisions.list()).toEqual({ status: "complete", records: [h.decision] });
  expect(await publishNativeConditionalWithdrawal(input)).toMatchObject({ state: "withdrawn" });
});

it.each(["pending", "ended"] as const)("refuses withdrawal after a %s attempt cites the decision and preserves its valid continuation", async state => {
  const { h, input } = await withdrawalInput(true);
  await recordLaneAttempt(h.operations, h.pendingInput);
  if (state === "ended") await completeNativeConditionalFrontline(h, "malformed");
  expect(await publishNativeConditionalWithdrawal(input)).toMatchObject({ state: "refused", reason: "consumed" });
  expect(await input.decisions.list()).toEqual({ status: "complete", records: [h.decision] });
  let admission = h.admission;
  if (state === "ended") {
    admission = createFrontlineAdmission({ ...h.admission, retryGeneration: 1 });
    await recordLaneAttempt(h.operations, { ...h.pendingInput, attemptId: admission.operationId, retryGeneration: 1,
      frontline: { admission, effectiveCoverage: null }, conditionalPendingAdmission: {
        ...h.pendingInput.conditionalPendingAdmission, admissionId: admission.operationId } });
  }
  await completeNativeConditionalFrontline({ ...h, admission }, "clean", state === "ended" ? h.admission.operationId : undefined);
  expect((await input.outcomes.read(admission.operationId))?.value).toMatchObject({ outcome: "clean", admittedBy: h.authorizationId });
  expect(await input.decisions.read(h.authorizationId)).toEqual(h.decision);
});

it("refuses withdrawal after succession and continues through the successor's approved pass", async () => {
  const { h, input } = await withdrawalInput();
  const next = await approveNextNativeConditionalFix(h);
  expect(await publishNativeConditionalWithdrawal(input)).toMatchObject({ state: "refused", reason: "superseded" });
  const decisions = await input.decisions.list();
  expect(decisions.status === "complete" && decisions.records.some(record => record.value.choice.kind === "withdrawal")).toBe(false);
  const admitted = await recordLaneAttempt(h.operations, next);
  expect(admitted.attempts.find(attempt => attempt.attemptId === h.admission.operationId)?.admittedBy)
    .toBe(next.conditionalPendingAdmission.authorizationId);
});

it("replays the author's withdrawal after succession and refuses another author", async () => {
  const { h, input } = await withdrawalInput();
  const first = await publishNativeConditionalWithdrawal(input);
  if (first.state === "refused") throw new Error(first.detail);
  await approveNextNativeConditionalFix(h);
  expect(await publishNativeConditionalWithdrawal(input)).toEqual({ ...first, state: "already-withdrawn" });
  expect(await publishNativeConditionalWithdrawal({ ...input, withdrawal: { ...input.withdrawal,
    withdrawnBy: "another-authorizer" } })).toMatchObject({ state: "refused", reason: "foreign-authority" });
  expect(await input.decisions.read(reviewDecisionKey(first.decision.value))).toEqual(first.decision);
});
