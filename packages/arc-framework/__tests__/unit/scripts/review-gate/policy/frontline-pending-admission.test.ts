/** Native unrun admissions retain consumed conditional authority while ordinary pending work can be dropped. */
import { expect, it, onTestFinished } from "vitest";
import { createNativeConditionalFrontlineFixture, completeNativeConditionalFrontline } from "../../../../fixtures/native-conditional-pass.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import { NativeReviewInFlightStateStore } from "../../../../../src/scripts/review-gate/hosts/local/in-flight-state-store.js";
import { reviewDecisionKey } from "../../../../../src/lib/store/kinds/review/decision/key.js";
import { recordLaneAttempt } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { withdrawUnrunFrontlineAdmission } from "../../../../../src/scripts/review-gate/policy/frontline-pending-admission.js";
import { ReviewInFlightRecordSchema } from "../../../../../src/scripts/review-gate/core/in-flight-state-schema.js";

it("retains an unrun admission that cites approved-fix authority and continues from its ready admission", async () => {
  const h = await createNativeConditionalFrontlineFixture();
  onTestFinished(h.cleanup);
  const pending = await recordLaneAttempt(h.operations, h.pendingInput);
  const before = await h.operations.readOperation(pending.operationId);
  if (before.state?.kind !== "lane-progress") throw new Error("Expected admitted lane owner");
  await expect(withdrawUnrunFrontlineAdmission(h.operations, before.state, before.version, h.admission,
    "2026-10-20T14:01:00Z", async (_id, action) => action())).rejects.toMatchObject({ reason: "conditional-authority-consumed" });
  expect(await h.operations.readOperation(pending.operationId)).toEqual(before);
  expect(await recordLaneAttempt(h.operations, h.pendingInput)).toEqual(before.state);
  await completeNativeConditionalFrontline(h, "clean");
  expect((await h.f.input.outcomes.read(h.admission.operationId))?.value).toMatchObject({ outcome: "clean", admittedBy: h.authorizationId });
  expect(await h.publisher.list({ root: "review-gate", namespace: "operations" })).toEqual([]);
});

it("drops an ordinary unrun admission from native execution without changing outcomes or decisions", async () => {
  const h = await createNativeConditionalFrontlineFixture();
  onTestFinished(h.cleanup);
  const outcomes = await h.f.input.outcomes.list(), decisions = await h.f.input.decisions.list();
  const pending = await recordLaneAttempt(h.operations, { ...h.pendingInput, conditionalPendingAdmission: undefined });
  const before = await h.operations.readOperation(pending.operationId);
  if (before.state?.kind !== "lane-progress") throw new Error("Expected admitted lane owner");
  expect(await withdrawUnrunFrontlineAdmission(h.operations, before.state, before.version, h.admission,
    "2026-10-20T14:01:00Z", async (_id, action) => action())).toMatchObject({ version: before.version + 1 });
  const after = await h.operations.readOperation(pending.operationId);
  expect(after.state?.kind === "lane-progress" && after.state.attempts.some(attempt => attempt.attemptId === h.admission.operationId)).toBe(false);
  const execution = await h.publisher.snapshot({ root: "review-gate", namespace: "in-flight" });
  expect(execution.every(entry => {
    if (entry.kind !== "file") return false;
    const state = ReviewInFlightRecordSchema.parse(JSON.parse(entry.content)).state;
    return state.kind === "lane-progress" && state.attempts.length === 0;
  })).toBe(true);
  expect(await h.f.input.outcomes.list()).toEqual(outcomes);
  expect(await h.f.input.decisions.list()).toEqual(decisions);
  expect(await h.publisher.list({ root: "review-gate", namespace: "operations" })).toEqual([]);
});

it("recognizes an ended native admission in a fresh checkout without changing its completed lane", async () => {
  const h = await createNativeConditionalFrontlineFixture();
  onTestFinished(h.cleanup);
  const pending = await recordLaneAttempt(h.operations, { ...h.pendingInput, conditionalPendingAdmission: undefined });
  await completeNativeConditionalFrontline(h, "clean");
  const checkout = await createReviewCheckout(h.f.h);
  onTestFinished(checkout.cleanup);
  const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const operations = new NativeReviewInFlightStateStore({ publisher, workItem: h.f.primary.reference.owner,
    outcomes: h.f.input.outcomes, evidence: h.f.input.evidence, decisions: h.f.input.decisions, projectId: h.f.input.readProjectId });
  const owner = await operations.readOperation(pending.operationId);
  if (owner.state?.kind !== "lane-progress") throw new Error("Expected completed lane owner");
  expect(owner.version).toBe(0);
  expect(await withdrawUnrunFrontlineAdmission(operations, owner.state, owner.version, h.admission,
    "2026-10-20T14:03:00Z", async (_id, action) => action())).toBeNull();
  expect(await operations.readOperation(pending.operationId)).toEqual(owner);
  expect(await publisher.list({ root: "review-gate", namespace: "in-flight" })).toEqual([]);
});

it("drops an unrun ceiling-cited admission without treating it as approved-fix consumption", async () => {
  const h = await createNativeConditionalFrontlineFixture();
  onTestFinished(h.cleanup);
  const pending = await recordLaneAttempt(h.operations, { ...h.pendingInput, conditionalPendingAdmission: undefined });
  const before = await h.operations.readOperation(pending.operationId);
  if (before.state?.kind !== "lane-progress") throw new Error("Expected admitted lane owner");
  const ceiling = await h.f.input.decisions.create({ schemaVersion: 1,
    subject: { lineage: h.admission.lineage, headSha: h.target.headSha, subjectDigest: null }, lane: "frontline",
    choice: { kind: "extra-pass", passCount: h.f.outcome.logicalPass, precondition: { kind: "ceiling", targetBinding: { kind: "call-target" } } },
    decidedBy: h.f.input.capture.authorizedBy, decidedAt: "2026-10-20T14:00:00Z", basis: null });
  const written = await h.operations.publishOperation({ ...before.state, attempts: before.state.attempts.map(attempt =>
    attempt.attemptId === h.admission.operationId ? { ...attempt, admittedBy: reviewDecisionKey(ceiling.value) } : attempt) }, before.version);
  const cited = await h.operations.readOperation(pending.operationId);
  if (cited.state?.kind !== "lane-progress") throw new Error("Expected cited lane owner");
  expect(await withdrawUnrunFrontlineAdmission(h.operations, cited.state, written.version, h.admission,
    "2026-10-20T14:01:00Z", async (_id, action) => action())).toMatchObject({ version: written.version + 1 });
  expect(await h.f.input.decisions.read(reviewDecisionKey(ceiling.value))).toEqual(ceiling);
});

it("keeps a cited admission when its decision reader is absent and continues after the full native context is restored", async () => {
  const h = await createNativeConditionalFrontlineFixture();
  onTestFinished(h.cleanup);
  const pending = await recordLaneAttempt(h.operations, h.pendingInput);
  const partial = new NativeReviewInFlightStateStore({ publisher: h.publisher, workItem: h.f.primary.reference.owner,
    outcomes: h.f.input.outcomes, evidence: h.f.input.evidence, projectId: h.f.input.readProjectId });
  const before = await partial.readOperation(pending.operationId);
  if (before.state?.kind !== "lane-progress") throw new Error("Expected cited lane owner");
  await expect(withdrawUnrunFrontlineAdmission(partial, before.state, before.version, h.admission,
    "2026-10-20T14:01:00Z", async (_id, action) => action())).rejects.toThrow("native decision reader");
  expect(await partial.readOperation(pending.operationId)).toEqual(before);
  expect(await recordLaneAttempt(h.operations, h.pendingInput)).toEqual(before.state);
  await completeNativeConditionalFrontline(h, "clean");
  expect((await h.f.input.outcomes.read(h.admission.operationId))?.value.outcome).toBe("clean");
});
