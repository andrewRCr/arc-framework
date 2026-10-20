/** Native retry remedies recover consumed authority from portable attempts without execution-local status. */
import { expect, it, onTestFinished } from "vitest";
import { createNativeConditionalFrontlineFixture, completeNativeConditionalFrontline } from "../../../../fixtures/native-conditional-pass.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import { NativeReviewInFlightStateStore } from "../../../../../src/scripts/review-gate/hosts/local/in-flight-state-store.js";
import { LocalFrontlineOutcomeStore } from "../../../../../src/scripts/review-gate/hosts/local/frontline-outcome-store.js";
import { recordLaneAttempt, laneProgressOperationId } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { createFrontlineAdmission } from "../../../../../src/scripts/review-gate/core/frontline-admission.js";
import { executeFrontlineRun, FrontlineOperationRetryError } from "../../../../../src/scripts/review-gate/policy/frontline-operation.js";
import { readStoredFrontlineRetryCeilingOverride } from "../../../../../src/scripts/review-gate/runtime/native-frontline-retry-authority.js";
import { withFrontlineRetryAuthorization } from "../../../../../src/scripts/review-gate/runtime/frontline-retry-remedy.js";

it.each([false, true])("recovers a consumed decision for a stale retry with a fresh checkout %s and admits its next generation", async fresh => {
  const h = await createNativeConditionalFrontlineFixture();
  onTestFinished(h.cleanup);
  await recordLaneAttempt(h.operations, h.pendingInput);
  await completeNativeConditionalFrontline(h, "malformed");
  const checkout = fresh ? await createReviewCheckout(h.f.h) : null;
  if (checkout !== null) onTestFinished(checkout.cleanup);
  const publisher = checkout === null ? h.publisher : new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const operations = checkout === null ? h.operations : new NativeReviewInFlightStateStore({ publisher,
    workItem: h.f.primary.reference.owner, outcomes: h.f.input.outcomes, evidence: h.f.input.evidence,
    decisions: h.f.input.decisions, projectId: h.f.input.readProjectId });
  const owner = await operations.readOperation(laneProgressOperationId({ lane: "frontline", repositoryId: h.target.repositoryId,
    headSha: h.target.headSha, lineage: h.admission.lineage }));
  if (owner.state?.kind !== "lane-progress" || operations.nativeFacts === undefined) throw new Error("Expected native retry context");
  let failure: unknown;
  try {
    await withFrontlineRetryAuthorization(owner.state, h.admission, () => executeFrontlineRun({ operationStore: operations,
      outcomes: h.f.input.outcomes, outcomeStore: new LocalFrontlineOutcomeStore(publisher),
      withOperationLock: async (_id, _wait, action) => action(), now: () => "2026-10-20T14:03:00Z",
      execute: async () => { throw new Error("A stale retry must not invoke its provider"); } },
    { admission: h.admission, retryOfOperationId: h.admission.operationId, lockWaitMs: 1 }), operations.nativeFacts);
  } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(FrontlineOperationRetryError);
  if (!(failure instanceof FrontlineOperationRetryError)) throw new Error("Expected a refused stale retry");
  expect(failure.reason).toBe("stale-admission");
  const override = failure.ceilingOverride;
  expect(override).toEqual({ exhaustedPassCount: h.f.outcome.logicalPass, nextPass: h.admission.logicalPass,
    conditionalPassAuthorizationId: h.authorizationId });
  if (override === undefined) throw new Error("Expected the original consumed authority");
  const admission = createFrontlineAdmission({ ...h.admission, retryGeneration: 1 });
  const pending = await recordLaneAttempt(operations, { ...h.pendingInput, attemptId: admission.operationId, retryGeneration: 1,
    frontline: { admission, effectiveCoverage: null }, conditionalPendingAdmission: { ...h.pendingInput.conditionalPendingAdmission,
      authorizationId: override.conditionalPassAuthorizationId, nextPass: override.nextPass, admissionId: admission.operationId } });
  expect(pending.attempts.find(attempt => attempt.attemptId === admission.operationId)?.admittedBy).toBe(h.authorizationId);
  await completeNativeConditionalFrontline({ ...h, operations, publisher, admission }, "clean", h.admission.operationId);
  expect((await h.f.input.outcomes.read(admission.operationId))?.value).toMatchObject({ outcome: "clean", admittedBy: h.authorizationId,
    logicalPass: h.admission.logicalPass, retryGeneration: 1 });
});

it("does not carry a consumed decision into a changed policy even when the operation identity is unchanged", async () => {
  const h = await createNativeConditionalFrontlineFixture();
  onTestFinished(h.cleanup);
  await recordLaneAttempt(h.operations, h.pendingInput);
  await completeNativeConditionalFrontline(h, "malformed");
  const admission = createFrontlineAdmission({ ...h.admission,
    frontlineReview: { ...h.admission.frontlineReview, promptText: "Review a different contract." } });
  expect(admission.operationId).toBe(h.admission.operationId);
  if (h.operations.nativeFacts === undefined) throw new Error("Expected native authority");
  expect(await readStoredFrontlineRetryCeilingOverride(h.operations.nativeFacts, admission)).toBeUndefined();
  expect(await readStoredFrontlineRetryCeilingOverride(h.operations.nativeFacts, h.admission)).toMatchObject({
    conditionalPassAuthorizationId: h.authorizationId });
});

it("does not recover retry authority after the cited pass has finished", async () => {
  const h = await createNativeConditionalFrontlineFixture();
  onTestFinished(h.cleanup);
  await recordLaneAttempt(h.operations, h.pendingInput);
  await completeNativeConditionalFrontline(h, "clean");
  if (h.operations.nativeFacts === undefined) throw new Error("Expected native authority");
  expect(await readStoredFrontlineRetryCeilingOverride(h.operations.nativeFacts, h.admission)).toBeUndefined();
});

it("does not infer consumption from an unused matching decision", async () => {
  const h = await createNativeConditionalFrontlineFixture();
  onTestFinished(h.cleanup);
  await recordLaneAttempt(h.operations, { ...h.pendingInput, conditionalPendingAdmission: undefined });
  await completeNativeConditionalFrontline(h, "malformed");
  expect((await h.f.input.outcomes.read(h.admission.operationId))?.value.admittedBy).toBeUndefined();
  expect(await h.f.input.decisions.read(h.authorizationId)).not.toBeNull();
  if (h.operations.nativeFacts === undefined) throw new Error("Expected native authority");
  expect(await readStoredFrontlineRetryCeilingOverride(h.operations.nativeFacts, h.admission)).toBeUndefined();
});
