/** Ended outcomes compose with clone-local pending execution for every lane read. */
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../../helpers/store/review-checkout.js";
import { queryEarlierReviewAttempts } from "../../../../../../src/scripts/review-gate/policy/earlier-review-attempts.js";
import { createHostedHandleFixture } from "../../../../../fixtures/hosted-review.js";
import { performedEvidenceFixture, reviewEvidenceFixture } from "../../../../../fixtures/review-evidence.js";
import { createReviewEvidencePort } from "../../../../../../src/lib/store/kinds/review/evidence/access.js";
import { storedLocalApproval } from "../../../../../fixtures/review-family-access.js";
import { localOutcome, hostedOutcome, frontlineOutcome } from "../../../../../fixtures/review-outcome.js";
import { ReviewOutcomeSchema, type ReviewOutcome } from "../../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { createReviewOutcomePort } from "../../../../../../src/lib/store/kinds/review/outcome/access.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../../src/lib/git-common-state.js";
import { laneProgressOperationId, recordLaneAttempt } from "../../../../../../src/scripts/review-gate/lane-progress.js";
import { LaneProgressStateSchema, LaneAttemptSchema } from "../../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { bindNativeReviewPorts } from "../../../../../helpers/store/native-review-ports.js";

const target = createHostedHandleFixture({ repositoryId: "123e4567-e89b-42d3-a456-426614174099" }).admission.reviewTarget;

async function fixture(values: readonly ReviewOutcome[]) {
  const h = createReviewHarness();
  await h.seedProject(target.repositoryId);
  const primary = await h.seedMeta("example"), checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  const outcomes = createReviewOutcomePort(h.store, primary.reference.owner);
  for (const value of values) await outcomes.create(value);
  const evidence = createReviewEvidencePort(h.store, primary.reference.owner);
  const operations = bindNativeReviewPorts({ store: h.store, owner: primary.reference.owner,
    publisher: new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd), projectId: h.projectId }).inFlight;
  return { h, primary, checkout, outcomes, evidence, operations };
}

it("reads an outcome-only local lane at version zero with its derived pass count", async () => {
  const outcome = ReviewOutcomeSchema.parse(localOutcome({ target }));
  const { operations } = await fixture([outcome]);
  const operationId = laneProgressOperationId({ lane: outcome.lane, repositoryId: outcome.target.repositoryId,
    headSha: outcome.target.headSha, lineage: outcome.lineage });
  const result = await operations.readOperation(operationId);
  expect(result).toMatchObject({ version: 0, state: { kind: "lane-progress", operationId,
    completedPasses: 1, updatedAt: outcome.endedAt, attempts: [{ attemptId: outcome.attemptId,
      outcome: "clean", terminalProducer: true, local: { requestId: outcome.local?.requestId } }] } });
  expect(LaneProgressStateSchema.safeParse(result.state).success).toBe(true);
  expect(await operations.readOperationSnapshot()).toMatchObject({ status: "complete", records: [result] });
});

it("raises an unreadable review listing from the snapshot as the store's refusal and recovers once readable", async () => {
  const outcome = ReviewOutcomeSchema.parse(localOutcome({ target }));
  const { h, operations } = await fixture([outcome]);
  h.store.state.unreadable.add("review");
  await expect(operations.readOperationSnapshot()).rejects.toMatchObject({ offBranch: true,
    refusal: { code: "record-malformed", class: "recoverable", rule: "review.listing-unreadable" } });
  h.store.state.unreadable.clear();
  expect(await operations.readOperationSnapshot()).toMatchObject({ status: "complete", records: [{ version: 0 }] });
});

it("orders retry outcomes by logical pass and end time while keeping the latest instant", async () => {
  const values = [
    ReviewOutcomeSchema.parse({ ...localOutcome({ target, logicalPass: 2 }), endedAt: "2026-10-19T14:00:00+02:00" }),
    ReviewOutcomeSchema.parse({ ...localOutcome({ target, outcome: "terminal-failure" }), endedAt: "2026-10-19T13:00:00Z" }),
    ReviewOutcomeSchema.parse({ ...localOutcome({ target, outcome: "terminal-failure", retryGeneration: 1 }), endedAt: "2026-10-19T13:01:00Z" }),
    ReviewOutcomeSchema.parse({ ...localOutcome({ target, retryGeneration: 2 }), endedAt: "2026-10-19T13:02:00Z" }),
  ];
  const { operations } = await fixture(values);
  const operationId = laneProgressOperationId({ lane: "standard", repositoryId: target.repositoryId,
    headSha: target.headSha, lineage: values[0]!.lineage });
  const result = await operations.readOperation(operationId);
  expect(result.state).toMatchObject({ completedPasses: 2, updatedAt: "2026-10-19T13:02:00Z" });
  if (result.state?.kind !== "lane-progress") throw new Error("Expected composed lane owner");
  expect(result.state.attempts.map(value => value.attemptId)).toEqual([values[1], values[2], values[3], values[0]].map(value => value!.attemptId));
});

it("keeps pending execution last and preserves its CAS version after composing ended attempts", async () => {
  const ended = ReviewOutcomeSchema.parse(localOutcome({ target }));
  const pending = ReviewOutcomeSchema.parse(localOutcome({ target, logicalPass: 2 }));
  const { operations } = await fixture([ended]);
  const admission = LaneAttemptSchema.shape.local.unwrap().strip().parse(pending.local);
  await recordLaneAttempt(operations, { lane: "standard", repositoryId: target.repositoryId,
    lineage: pending.lineage, attemptId: pending.attemptId, logicalPass: pending.logicalPass,
    retryGeneration: pending.retryGeneration, changeRequestId: null, headSha: target.headSha,
    sourceId: pending.source.sourceId, outcome: "pending", consumedPass: false,
    local: { ...admission, effectiveCoverage: null }, now: "2026-10-19T14:00:00Z" });
  const operationId = laneProgressOperationId({ lane: "standard", repositoryId: target.repositoryId,
    headSha: target.headSha, lineage: pending.lineage });
  const result = await operations.readOperation(operationId);
  expect(result).toMatchObject({ version: 1, state: { completedPasses: 1, updatedAt: "2026-10-19T14:00:00Z",
    attempts: [{ attemptId: ended.attemptId, outcome: "clean" }, { attemptId: pending.attemptId, outcome: "pending" }] } });
  if (result.state === null) throw new Error("Expected composed owner");
  expect(await operations.publishOperation(result.state, result.version)).toEqual({ version: 1 });
  expect(await operations.readOperationSnapshot()).toMatchObject({ status: "complete", records: [result] });
});

it("composes a hosted fallback after a local failure at the same logical pass", async () => {
  const local = ReviewOutcomeSchema.parse(localOutcome({ target, outcome: "terminal-failure" }));
  const hosted = ReviewOutcomeSchema.parse({ ...hostedOutcome({ repositoryId: target.repositoryId, lineage: local.lineage }),
    endedAt: "2026-10-19T13:01:00Z" });
  const { operations } = await fixture([local, hosted]);
  const operationId = laneProgressOperationId({ lane: "standard", repositoryId: target.repositoryId,
    headSha: target.headSha, lineage: local.lineage });
  expect(await operations.readOperation(operationId)).toMatchObject({ version: 0, state: {
    completedPasses: 1, attempts: [{ attemptId: local.attemptId, terminalProducer: false },
      { attemptId: hosted.attemptId, changeRequestId: `pull/${hosted.hosted!.target.pullRequest}`, terminalProducer: true, hosted: { admission: hosted.hosted?.admission,
        sealedResult: hosted.hosted?.sealedResult } }] } });
});

it("composes imported frontline admission without restoring executable paths", async () => {
  const outcome = ReviewOutcomeSchema.parse(frontlineOutcome({ target }));
  const { operations } = await fixture([outcome]);
  const operationId = laneProgressOperationId({ lane: "frontline", repositoryId: target.repositoryId,
    headSha: target.headSha, lineage: outcome.lineage });
  const result = await operations.readOperation(operationId);
  expect(result).toMatchObject({ version: 0, state: { completedPasses: 1, attempts: [{
    attemptId: outcome.attemptId, terminalProducer: true, frontline: { admission: outcome.frontline?.admission,
      effectiveCoverage: "complete" } }] } });
  expect(LaneProgressStateSchema.safeParse(result.state).success).toBe(true);
  if (result.state?.kind !== "lane-progress") throw new Error("Expected frontline lane owner");
  expect(result.state.attempts[0]?.frontline?.admission.frontlineReview.source).not.toHaveProperty("executable");
});

it("keeps executable admission mandatory for a pending frontline attempt", () => {
  const outcome = ReviewOutcomeSchema.parse(frontlineOutcome({ target }));
  expect(LaneAttemptSchema.safeParse({ attemptId: outcome.attemptId, logicalPass: outcome.logicalPass,
    retryGeneration: outcome.retryGeneration, headSha: target.headSha, changeRequestId: null,
    terminalProducer: false, sourceId: outcome.source.sourceId, outcome: "pending",
    frontline: { admission: outcome.frontline?.admission, effectiveCoverage: null } }).success).toBe(false);
});

it("derives settled local findings from the exact stored approved response", async () => {
  const h = await storedLocalApproval();
  const checkout = await createReviewCheckout(h.harness);
  onTestFinished(checkout.cleanup);
  const operations = bindNativeReviewPorts({ store: h.harness.store, owner: h.owner,
    publisher: new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd) }).inFlight;
  const outcome = h.outcome;
  const operationId = laneProgressOperationId({ lane: outcome.lane, repositoryId: outcome.target.repositoryId,
    headSha: outcome.target.headSha, lineage: outcome.lineage });
  expect(await operations.readOperation(operationId)).toMatchObject({ version: 0, state: {
    completedPasses: 1, attempts: [{ attemptId: outcome.attemptId, outcome: "settled-findings", terminalProducer: true }] } });
});

it("composes performed fix evidence without copying it into execution state", async () => {
  const producer = ReviewOutcomeSchema.parse(localOutcome({ target, outcome: "findings", findings: [{
    findingId: "finding-1", severity: "major", locus: "src/main.ts:1", evidenceUrlOrId: "finding:1", sourceOrdinal: 1,
  }] }));
  const performed = performedEvidenceFixture("candidate", producer);
  const { operations, evidence } = await fixture([producer]);
  const { performance, ...initial } = performed.value;
  const approved = await evidence.create(initial);
  const operationId = laneProgressOperationId({ lane: producer.lane, repositoryId: target.repositoryId,
    headSha: target.headSha, lineage: producer.lineage });
  expect(await operations.readOperation(operationId)).toMatchObject({ state: { attempts: [{ outcome: "findings" }] } });
  await evidence.advance({ ...initial, performance }, approved.version);
  const result = await operations.readOperation(operationId);
  expect(result).toMatchObject({ version: 0, state: { attempts: [{ outcome: "settled-findings", responsePerformance: performance }] } });
});

it("admits an earlier stored review on a clone with no working-state version", async () => {
  const outcome = ReviewOutcomeSchema.parse(localOutcome({ target }));
  const { operations } = await fixture([outcome]);
  expect(queryEarlierReviewAttempts({ schemaVersion: 1, repositoryId: target.repositoryId,
    repository: "owner/repo", pullRequest: 42, currentHead: "e".repeat(40), lane: "standard",
    sourceId: outcome.source.sourceId, lineage: outcome.lineage }, await operations.readOperationSnapshot()))
    .toMatchObject({ status: "complete", candidates: [{ attemptId: outcome.attemptId, version: 0 }] });
});

it("composes hosted settlement authority from its approved evidence", async () => {
  const outcome = ReviewOutcomeSchema.parse(hostedOutcome({ repositoryId: target.repositoryId, outcome: "findings",
    findings: [{ findingId: "finding-1", sourceOrdinal: 1, severity: "major", origin: "review-body", reviewId: "review-1",
      fingerprint: "finding-1", settlement: "not-applicable", locus: "src/main.ts:1",
      url: "https://example.invalid/review", body: "A retained finding." }] }));
  const { operations, evidence } = await fixture([outcome]);
  const approved = (await evidence.create(reviewEvidenceFixture(outcome))).value;
  const operationId = laneProgressOperationId({ lane: outcome.lane, repositoryId: target.repositoryId,
    headSha: target.headSha, lineage: outcome.lineage });
  const result = await operations.readOperation(operationId);
  expect(result).toMatchObject({ version: 0, state: { attempts: [{ outcome: "settled-findings", hosted: {
    dispositionSetId: approved.dispositionSet.dispositionSetId,
    dispositionSetLineage: [{ dispositionSetId: approved.dispositionSet.dispositionSetId,
      findingActions: approved.settlement?.findingActions }],
    settlementEvidence: approved.settlement?.evidence, settledFindingIds: ["finding-1"],
  } }] } });
  expect(LaneProgressStateSchema.safeParse(result.state).success).toBe(true);
});
