/** Conditional supersession preflight keeps consumption authoritative after execution pruning. */
import { expect, it, onTestFinished } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createNativeConditionalFrontlineFixture, completeNativeConditionalFrontline, approveNextNativeConditionalFix } from "../../../../fixtures/native-conditional-pass.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import { NativeReviewInFlightStateStore } from "../../../../../src/scripts/review-gate/hosts/local/in-flight-state-store.js";
import { recordLaneAttempt } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { createFrontlineAdmission } from "../../../../../src/scripts/review-gate/core/frontline-admission.js";
import { publishNativeConditionalWithdrawal } from "../../../../../src/scripts/review-gate/runtime/native-conditional-withdrawal.js";
import { inspectNativeConditionalPassSupersession } from "../../../../../src/scripts/review-gate/runtime/native-conditional-supersession.js";

it.each(["pending", "ended"] as const)("refuses to supersede a consumed grant with a %s admission and preserves its valid continuation", async phase => {
  const h = await createNativeConditionalFrontlineFixture();
  onTestFinished(h.cleanup);
  await recordLaneAttempt(h.operations, h.pendingInput);
  if (phase === "ended") await completeNativeConditionalFrontline(h, "malformed");
  const checkout = phase === "ended" ? await createReviewCheckout(h.f.h) : null;
  if (checkout !== null) onTestFinished(checkout.cleanup);
  const inFlight = checkout === null ? h.operations : new NativeReviewInFlightStateStore({
    publisher: new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd), workItem: h.f.primary.reference.owner,
    outcomes: h.f.input.outcomes, evidence: h.f.input.evidence, decisions: h.f.input.decisions, projectId: h.f.input.readProjectId });
  const before = await h.f.input.decisions.read(h.authorizationId);
  expect(await inspectNativeConditionalPassSupersession({ ...h.f.input, inFlight, supersession: {
    ...h.f.input.capture, successorDispositionSetId: canonicalDigest({ successor: 1 }) } })).toMatchObject({
      state: "refused", reason: "fix-consumed" });
  expect(await h.f.input.decisions.read(h.authorizationId)).toEqual(before);
  if (phase === "pending") {
    await completeNativeConditionalFrontline(h, "clean");
    expect((await h.f.input.outcomes.read(h.admission.operationId))?.value.outcome).toBe("clean");
  } else {
    const admission = createFrontlineAdmission({ ...h.admission, retryGeneration: 1 });
    await recordLaneAttempt(h.operations, { ...h.pendingInput, attemptId: admission.operationId, retryGeneration: 1,
      frontline: { admission, effectiveCoverage: null }, conditionalPendingAdmission: {
        ...h.pendingInput.conditionalPendingAdmission, admissionId: admission.operationId } });
    await completeNativeConditionalFrontline({ ...h, admission }, "clean", h.admission.operationId);
    expect((await h.f.input.outcomes.read(admission.operationId))?.value).toMatchObject({ outcome: "clean", admittedBy: h.authorizationId });
  }
});

it("keeps an unconsumed or withdrawn grant eligible for succession without rewriting its decision", async () => {
  const h = await createNativeConditionalFrontlineFixture(false);
  onTestFinished(h.cleanup);
  const input = { ...h.f.input, inFlight: h.operations, supersession: {
    ...h.f.input.capture, successorDispositionSetId: canonicalDigest({ successor: 1 }) } };
  const before = await h.f.input.decisions.read(h.authorizationId);
  expect(await inspectNativeConditionalPassSupersession(input)).toEqual({ state: "ready" });
  await publishNativeConditionalWithdrawal({ ...h.f.input, inFlight: h.operations, withdrawal: {
    ...h.f.input.capture, authorizationId: h.authorizationId, withdrawnBy: h.f.input.capture.authorizedBy,
    now: "2026-10-20T13:01:00Z" } });
  expect(await inspectNativeConditionalPassSupersession(input)).toEqual({ state: "ready" });
  expect(await h.f.input.decisions.read(h.authorizationId)).toEqual(before);
  const pendingInput = await approveNextNativeConditionalFix(h);
  await recordLaneAttempt(h.operations, pendingInput);
  await completeNativeConditionalFrontline(h, "clean");
  expect((await h.f.input.outcomes.read(h.admission.operationId))?.value.outcome).toBe("clean");
});

it("refuses an unreadable execution snapshot and permits succession after its record is restored", async () => {
  const h = await createNativeConditionalFrontlineFixture(false);
  onTestFinished(h.cleanup);
  await recordLaneAttempt(h.operations, { ...h.pendingInput, conditionalPendingAdmission: undefined });
  const location = { root: "review-gate", namespace: "in-flight" } as const;
  const entry = (await h.publisher.snapshot(location))[0];
  if (entry?.kind !== "file") throw new Error("Expected the real pending execution record");
  const input = { ...h.f.input, inFlight: h.operations, supersession: {
    ...h.f.input.capture, successorDispositionSetId: canonicalDigest({ successor: 1 }) } };
  await h.publisher.update(location, entry.name, () => ({ kind: "write", content: "{}", result: undefined }));
  await expect(inspectNativeConditionalPassSupersession(input)).rejects.toThrow("Restore the native execution snapshot");
  await h.publisher.update(location, entry.name, () => ({ kind: "write", content: entry.content, result: undefined }));
  expect(await inspectNativeConditionalPassSupersession(input)).toEqual({ state: "ready" });
});
