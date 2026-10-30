/** Native response performance advances actual checked evidence without half-recorded fix facts. */
import { createNativeReviewPerformanceFixture } from "../../../../fixtures/native-review-performance.js";
import { ReviewEvidenceSchema } from "../../../../../src/lib/store/kinds/review/evidence/schema.js";
import { expect, it, onTestFinished } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { lifecycleSuccess } from "../../../../helpers/store/lifecycle-harness.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import { reviewOutcomeKey } from "../../../../../src/lib/store/kinds/review/outcome/key.js";
import { publishNativeReviewApproval } from "../../../../../src/scripts/review-gate/runtime/native-review-approval.js";
import { publishNativeReviewPerformance } from "../../../../../src/scripts/review-gate/runtime/native-review-performance.js";
import { StoredReviewResultReader } from "../../../../../src/scripts/review-gate/hosts/local/stored-result-reader.js";
import { readLaneResponsePerformance } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { bindNativeReviewPorts } from "../../../../helpers/store/native-review-ports.js";


it.each(["candidate", "errand", "delivery-member"] as const)("publishes complete %s performance in one evidence version and composes it for readers", async kind => {
  const { h, primary, outcome, originalOutcome, initial, value, ports, input } = await createNativeReviewPerformanceFixture(kind);
  const stored = await publishNativeReviewPerformance(input);
  expect(stored.value.performance).toEqual(value.performance);
  expect(stored.value.binding).toEqual(initial.value.binding);
  expect(stored.version).not.toBe(initial.version);
  const history = lifecycleSuccess(await h.store.history({ reference: stored.reference }));
  expect(history).toHaveLength(2);
  expect(history.map(entry => entry.content === null ? null : ReviewEvidenceSchema.parse(JSON.parse(entry.content)).performance))
    .toEqual([value.performance, undefined]);
  expect(await publishNativeReviewPerformance({ ...input, performance: { ...input.performance,
    performedAt: "2026-10-20T13:00:00Z" } })).toEqual(stored);
  expect(await ports.outcomes.read(reviewOutcomeKey(outcome))).toEqual(originalOutcome);
  const checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const operations = bindNativeReviewPorts({ store: h.store, owner: primary.reference.owner,
    publisher, projectId: h.projectId }).inFlight;
  const result = await new StoredReviewResultReader(ports).readResult(outcome.attemptId);
  expect(await readLaneResponsePerformance(operations, result)).toEqual(input.performance);
  expect(await publisher.list({ root: "review-gate", namespace: "in-flight" })).toEqual([]);
});

it("refuses performance while policy projection is pending and continues after projection completes", async () => {
  const { input, ports, approval, initial } = await createNativeReviewPerformanceFixture("errand", { pendingPolicy: true });
  await expect(publishNativeReviewPerformance(input)).rejects.toThrow("Complete the approved response policy projection");
  expect(await ports.evidence.read(initial.value.dispositionSet.dispositionSetId)).toEqual(initial);
  await publishNativeReviewApproval({ ...ports, record: approval, now: () => "2026-10-20T12:02:00Z" });
  expect((await publishNativeReviewPerformance(input)).value.performance).toMatchObject(input.performance);
});

it("binds a Candidate response once, preserves the performance timestamp, and replays the bound response", async () => {
  const { h, input, ports } = await createNativeReviewPerformanceFixture("candidate");
  const performed = await publishNativeReviewPerformance(input);
  const candidateResponseId = canonicalDigest({ response: 1 });
  const bound = await publishNativeReviewPerformance({ ...input, performance: { ...input.performance,
    candidateResponseId, performedAt: "2026-10-20T14:00:00Z" } });
  expect(bound.value.performance).toEqual({ ...performed.value.performance, candidateResponseId });
  expect(bound.version).not.toBe(performed.version);
  expect(lifecycleSuccess(await h.store.history({ reference: bound.reference }))).toHaveLength(3);
  expect(await publishNativeReviewPerformance(input)).toEqual(bound);
  expect(await ports.evidence.read(input.performance.dispositionSetId)).toEqual(bound);
});

it("refuses replacement of a bound Candidate response and continues with the original response", async () => {
  const { input, ports } = await createNativeReviewPerformanceFixture("candidate");
  const candidateResponseId = canonicalDigest({ response: 1 });
  const original = { ...input, performance: { ...input.performance, candidateResponseId } };
  const stored = await publishNativeReviewPerformance(original);
  await expect(publishNativeReviewPerformance({ ...input, performance: { ...input.performance,
    candidateResponseId: canonicalDigest({ response: 2 }) } })).rejects.toThrow("permitted in-place advances");
  expect(await ports.evidence.read(input.performance.dispositionSetId)).toEqual(stored);
  expect(await publishNativeReviewPerformance(original)).toEqual(stored);
});

it.each(["errand", "delivery-member"] as const)("retains a no-fix %s performance header without inventing a fix transition", async kind => {
  const { h, input, value } = await createNativeReviewPerformanceFixture(kind, { noFix: true });
  const stored = await publishNativeReviewPerformance(input);
  expect(stored.value.performance).toEqual(value.performance);
  expect(stored.value.performance?.fixResponse).toBeUndefined();
  expect(await publishNativeReviewPerformance(input)).toEqual(stored);
  expect(lifecycleSuccess(await h.store.history({ reference: stored.reference }))).toHaveLength(2);
});
