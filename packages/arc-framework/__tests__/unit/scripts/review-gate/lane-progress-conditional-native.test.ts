/** Existing lane transitions select native decision authority when their adapter carries it. */
import { expect, it, onTestFinished } from "vitest";
import { createNativeConditionalPassFixture, createNativeConditionalFrontlineFixture, completeNativeConditionalFrontline, approveNextNativeConditionalFix } from "../../../fixtures/native-conditional-pass.js";
import { createReviewCheckout } from "../../../helpers/store/review-checkout.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { createDispositionSet } from "../../../../src/scripts/review-gate/core/dispositions.js";
import { canonicalDigest } from "../../../../src/lib/kernel/index.js";
import { RepositoryGitCommonStatePublisher } from "../../../../src/lib/git-common-state.js";
import { NativeReviewInFlightStateStore } from "../../../../src/scripts/review-gate/hosts/local/in-flight-state-store.js";
import { captureConditionalNextPassAuthorization, withdrawConditionalNextPassAuthorization, inspectConditionalNextPassInvalidation, invalidateConditionalNextPassAuthorization, recordLaneAttempt } from "../../../../src/scripts/review-gate/lane-progress.js";

it.each(["local", "frontline", "hosted"] as const)("captures a %s conditional pass through the existing transition without writing execution status", async kind => {
  const f = await createNativeConditionalPassFixture(kind);
  const checkout = await createReviewCheckout(f.h);
  onTestFinished(checkout.cleanup);
  const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const operations = new NativeReviewInFlightStateStore({ publisher, workItem: f.primary.reference.owner,
    outcomes: f.input.outcomes, evidence: f.input.evidence, decisions: f.input.decisions, projectId: f.input.readProjectId });
  const captured = await captureConditionalNextPassAuthorization(operations, f.input.capture);
  const decision = await f.input.decisions.read(captured.authorizationId);
  expect(decision?.value).toMatchObject({ choice: { kind: "extra-pass", passCount: f.outcome.logicalPass,
    precondition: { kind: "approved-fix", producerId: f.outcome.attemptId } }, decidedBy: f.input.capture.authorizedBy });
  expect(captured.progress.attempts.find(attempt => attempt.attemptId === f.outcome.attemptId)?.conditionalPassAuthorizations).toBeUndefined();
  expect((await captureConditionalNextPassAuthorization(operations, { ...f.input.capture, now: "2026-10-20T16:00:00Z" })).authorizationId)
    .toBe(captured.authorizationId);
  expect(await f.input.decisions.read(captured.authorizationId)).toEqual(decision);
  if (decision === null) throw new Error("Expected captured native authority");
  expect(lifecycleSuccess(await f.h.store.history({ reference: decision.reference }))).toHaveLength(1);
  expect(await publisher.list({ root: "review-gate", namespace: "in-flight" })).toEqual([]);
});

it("withdraws and replays an unused native grant through the existing transition without mutable status", async () => {
  const h = await createNativeConditionalFrontlineFixture(false);
  onTestFinished(h.cleanup);
  const input = { ...h.f.input.capture, authorizationId: h.authorizationId, withdrawnBy: h.f.input.capture.authorizedBy };
  const before = await h.f.input.decisions.read(h.authorizationId);
  const confirmCurrent = h.pendingInput.conditionalPendingAdmission.confirmDispositionSetCurrent;
  const first = await withdrawConditionalNextPassAuthorization(h.operations, input, confirmCurrent);
  expect(first).toMatchObject({ state: "withdrawn", authorizationId: h.authorizationId,
    dispositionSetId: h.f.input.capture.dispositionSetId });
  expect(await withdrawConditionalNextPassAuthorization(h.operations, { ...input, now: "2026-10-20T16:00:00Z" }, confirmCurrent))
    .toMatchObject({ state: "already-withdrawn", authorizationId: h.authorizationId });
  expect(await h.f.input.decisions.read(h.authorizationId)).toEqual(before);
  const listing = await h.f.input.decisions.list();
  if (listing.status !== "complete") throw new Error("Expected complete decisions");
  expect(listing.records).toHaveLength(2);
  const withdrawal = listing.records.find(record => record.value.choice.kind === "withdrawal");
  if (withdrawal === undefined) throw new Error("Expected the recorded withdrawal");
  expect(lifecycleSuccess(await h.f.h.store.history({ reference: withdrawal.reference }))).toHaveLength(1);
  expect(await h.publisher.list({ root: "review-gate", namespace: "in-flight" })).toEqual([]);
});

it.each(["inspect", "invalidate"] as const)("%s refuses consumed native conditional authority and preserves the admitted run", async action => {
  const h = await createNativeConditionalFrontlineFixture();
  onTestFinished(h.cleanup);
  await recordLaneAttempt(h.operations, h.pendingInput);
  const input = { ...h.f.input.capture, successorDispositionSetId: canonicalDigest({ successor: 1 }) };
  const before = await h.publisher.snapshot({ root: "review-gate", namespace: "in-flight" });
  if (action === "inspect") expect(await inspectConditionalNextPassInvalidation(h.operations, input))
    .toMatchObject({ state: "refused", reason: "fix-consumed" });
  else await expect(invalidateConditionalNextPassAuthorization(h.operations, input)).rejects.toThrow("conditional pass was consumed");
  expect(await h.publisher.snapshot({ root: "review-gate", namespace: "in-flight" })).toEqual(before);
  await completeNativeConditionalFrontline(h, "clean");
  expect((await h.f.input.outcomes.read(h.admission.operationId))?.value).toMatchObject({ outcome: "clean", admittedBy: h.authorizationId });
});

it("requires the exact approved successor link and then confirms it without writing execution status", async () => {
  const h = await createNativeConditionalFrontlineFixture(false);
  onTestFinished(h.cleanup);
  const { dispositionSetId: ignored, ...identity } = h.f.approved.dispositionSet;
  void ignored;
  const successor = createDispositionSet({ ...identity, proposedBy: "next-response-proposer" });
  const input = { ...h.f.input.capture, successorDispositionSetId: successor.dispositionSetId };
  expect(await inspectConditionalNextPassInvalidation(h.operations, input)).toEqual({ state: "ready" });
  await expect(invalidateConditionalNextPassAuthorization(h.operations, input)).rejects.toThrow("Approve the exact successor response");
  const pending = await approveNextNativeConditionalFix(h);
  const original = await h.f.input.decisions.read(h.authorizationId);
  expect(await invalidateConditionalNextPassAuthorization(h.operations, input)).toMatchObject({ kind: "lane-progress" });
  expect(await inspectConditionalNextPassInvalidation(h.operations, input)).toEqual({ state: "ready" });
  expect(await h.f.input.decisions.read(h.authorizationId)).toEqual(original);
  expect(await h.publisher.list({ root: "review-gate", namespace: "in-flight" })).toEqual([]);
  await recordLaneAttempt(h.operations, pending);
  await completeNativeConditionalFrontline(h, "clean");
  expect((await h.f.input.outcomes.read(h.admission.operationId))?.value.outcome).toBe("clean");
});
