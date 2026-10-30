/** Checked native settlement keeps portable outcomes immutable while responses accumulate host receipts. */
import { expect, it, onTestFinished } from "vitest";
import { hostedOutcome } from "../../../../fixtures/review-outcome.js";
import { ReviewOutcomeSchema } from "../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { lifecycleSuccess } from "../../../../helpers/store/lifecycle-harness.js";
import { hostedSettlementFixture, reviewEvidenceFixture, performedEvidenceFixture } from "../../../../fixtures/review-evidence.js";
import { createReviewOutcomePort } from "../../../../../src/lib/store/kinds/review/outcome/access.js";
import { createReviewEvidencePort } from "../../../../../src/lib/store/kinds/review/evidence/access.js";
import { composeReviewDispositionRecord } from "../../../../../src/lib/store/kinds/review/evidence/composed-record.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import { outcomeLaneOperationId } from "../../../../../src/scripts/review-gate/hosts/local/lane-outcome-composition.js";
import { StoredReviewResultReader } from "../../../../../src/scripts/review-gate/hosts/local/stored-result-reader.js";
import { publishNativeReviewPerformance } from "../../../../../src/scripts/review-gate/runtime/native-review-performance.js";
import { publishNativeReviewApproval } from "../../../../../src/scripts/review-gate/runtime/native-review-approval.js";
import { publishNativeHostedSettlement } from "../../../../../src/scripts/review-gate/runtime/native-hosted-settlement.js";
import { bindNativeReviewPorts } from "../../../../helpers/store/native-review-ports.js";

async function nativeSettlement(fix = false, perform = true) {
  const h = createReviewHarness(), seed = hostedSettlementFixture();
  const outcome = ReviewOutcomeSchema.parse(hostedOutcome({ repositoryId: "123e4567-e89b-42d3-a456-426614174099",
    outcome: "findings", findings: seed.outcome.hosted?.sealedResult?.findings }));
  if (outcome.hosted === undefined) throw new Error("Expected a hosted outcome");
  const prior = fix ? performedEvidenceFixture("candidate", outcome).value : reviewEvidenceFixture(outcome);
  const entry = { ...seed.entry, disposition: fix ? "fix" as const : "defer" as const,
    fixTarget: fix ? { ...outcome.hosted.target, headSha: prior.performance?.producedHeadSha ?? "e".repeat(40) } : null,
    dispositionSetId: prior.dispositionSet.dispositionSetId, target: outcome.hosted.target };
  await h.seedProject(outcome.target.repositoryId);
  const primary = await h.seedMeta("example");
  const outcomes = createReviewOutcomePort(h.store, primary.reference.owner), evidence = createReviewEvidencePort(h.store, primary.reference.owner);
  const original = await outcomes.create(outcome);
  const ports = { outcomes, evidence, readProjectId: h.projectId };
  const approved = await publishNativeReviewApproval({ ...ports,
    record: composeReviewDispositionRecord(outcome, [{ ...prior, performance: undefined }], primary.reference.owner), now: () => "2026-10-20T12:00:00Z" });
  const performanceInput = prior.performance === undefined ? null : { ...ports,
    record: composeReviewDispositionRecord(outcome, [prior], primary.reference.owner),
    performance: prior.performance };
  if (perform && prior.performance !== undefined) {
    const { fixResponse: ignoredResponse, ...performance } = prior.performance;
    void ignoredResponse;
    await publishNativeReviewPerformance({ ...ports,
      record: composeReviewDispositionRecord(outcome, [prior], primary.reference.owner), performance });
  }
  return { h, primary, outcome, original, approved, ports, performanceInput, input: { ...ports, producerId: outcome.attemptId, settlement: entry } };
}

it("appends each hosted receipt once and derives settlement in a checkout without execution files", async () => {
  const { h, primary, outcome, original, approved, ports, input } = await nativeSettlement();
  const reader = new StoredReviewResultReader(ports);
  expect(await reader.readResult(outcome.attemptId)).toMatchObject({ settled: false });
  const first = await publishNativeHostedSettlement(input);
  expect(first.value.settlement?.evidence).toEqual([input.settlement]);
  expect(first.version).not.toBe(approved.version);
  expect(await publishNativeHostedSettlement({ ...input, settlement: { ...input.settlement,
    performedAt: "2026-10-20T13:00:00Z" } })).toEqual(first);
  const secondEntry = { ...input.settlement, findingId: "thread-2", commentId: "comment-2", threadId: "thread-2", replyId: "reply-2" };
  const complete = await publishNativeHostedSettlement({ ...input, settlement: secondEntry });
  expect(complete.value.settlement?.evidence).toEqual([input.settlement, secondEntry]);
  expect(lifecycleSuccess(await h.store.history({ reference: complete.reference }))).toHaveLength(3);
  expect(await reader.readResult(outcome.attemptId)).toMatchObject({ originalOutcome: "findings", settled: true });
  expect(await ports.outcomes.read(approved.value.result.outcomeKey)).toEqual(original);
  const checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const operations = bindNativeReviewPorts({ store: h.store, owner: primary.reference.owner,
    publisher, projectId: h.projectId }).inFlight;
  expect((await operations.readOperation(outcomeLaneOperationId(outcome))).state).toMatchObject({ kind: "lane-progress",
    attempts: [{ outcome: "settled-findings", hosted: { settledFindingIds: ["thread-1", "thread-2"],
      settlementEvidence: [input.settlement, secondEntry] } }] });
  expect(await publisher.list({ root: "review-gate", namespace: "in-flight" })).toEqual([]);
});

it("refuses conflicting host receipts without changing evidence and replays the original receipt after repair", async () => {
  const { input, ports } = await nativeSettlement();
  const stored = await publishNativeHostedSettlement(input);
  await expect(publishNativeHostedSettlement({ ...input, settlement: { ...input.settlement,
    replyId: "another-reply" } })).rejects.toThrow("replay the original host receipt");
  expect(await ports.evidence.read(input.settlement.dispositionSetId)).toEqual(stored);
  expect(await publishNativeHostedSettlement(input)).toEqual(stored);
});

it("refuses complete fix settlement at an unverified head and continues with the verified response head", async () => {
  const { input, ports } = await nativeSettlement(true);
  const first = await publishNativeHostedSettlement(input);
  const second = { ...input.settlement, findingId: "thread-2", commentId: "comment-2", threadId: "thread-2", replyId: "reply-2" };
  await expect(publishNativeHostedSettlement({ ...input, settlement: { ...second,
    fixTarget: { ...input.settlement.target, headSha: "f".repeat(40) } } })).rejects.toThrow("response-head evidence");
  expect(await ports.evidence.read(input.settlement.dispositionSetId)).toEqual(first);
  const complete = await publishNativeHostedSettlement({ ...input, settlement: second });
  expect(complete.value.settlement?.evidence).toEqual([input.settlement, second]);
  expect(await new StoredReviewResultReader(ports).readResult(input.producerId)).toMatchObject({ settled: true });
});

it("validates already-settled host heads when performance arrives last and continues after correction", async () => {
  const { input, ports, performanceInput } = await nativeSettlement(true, false);
  if (performanceInput === null) throw new Error("Expected a fix performance input");
  await publishNativeHostedSettlement(input);
  const settled = await publishNativeHostedSettlement({ ...input, settlement: { ...input.settlement,
    findingId: "thread-2", commentId: "comment-2", threadId: "thread-2", replyId: "reply-2" } });
  expect(await new StoredReviewResultReader(ports).readResult(input.producerId)).toMatchObject({ settled: false });
  await expect(publishNativeReviewPerformance({ ...performanceInput, performance: { ...performanceInput.performance,
    producedHeadSha: "f".repeat(40) } })).rejects.toThrow("response-head evidence");
  expect(await ports.evidence.read(input.settlement.dispositionSetId)).toEqual(settled);
  await publishNativeReviewPerformance(performanceInput);
  expect(await new StoredReviewResultReader(ports).readResult(input.producerId)).toMatchObject({ settled: true });
});
