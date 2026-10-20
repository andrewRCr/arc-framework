/** Native response performance advances actual checked evidence without half-recorded fix facts. */
import { expect, it, onTestFinished } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { lifecycleSuccess } from "../../../../helpers/store/lifecycle-harness.js";
import { performedEvidenceFixture, reviewEvidenceFixture } from "../../../../fixtures/review-evidence.js";
import { localOutcome, hostedOutcome } from "../../../../fixtures/review-outcome.js";
import { createHostedHandleFixture } from "../../../../fixtures/hosted-review.js";
import { TransientIdentityRecordSchema } from "../../../../../src/lib/errand/identity-record.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import { createReviewOutcomePort } from "../../../../../src/lib/store/kinds/review/outcome/access.js";
import { createReviewEvidencePort } from "../../../../../src/lib/store/kinds/review/evidence/access.js";
import { reviewOutcomeKey } from "../../../../../src/lib/store/kinds/review/outcome/key.js";
import { ReviewOutcomeSchema } from "../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { ReviewEvidenceSchema } from "../../../../../src/lib/store/kinds/review/evidence/schema.js";
import { composeReviewDispositionRecord } from "../../../../../src/lib/store/kinds/review/evidence/composed-record.js";
import { publishNativeReviewApproval } from "../../../../../src/scripts/review-gate/runtime/native-review-approval.js";
import { publishNativeReviewPerformance } from "../../../../../src/scripts/review-gate/runtime/native-review-performance.js";
import { NativeReviewInFlightStateStore } from "../../../../../src/scripts/review-gate/hosts/local/in-flight-state-store.js";
import { StoredReviewResultReader } from "../../../../../src/scripts/review-gate/hosts/local/stored-result-reader.js";
import { readLaneResponsePerformance } from "../../../../../src/scripts/review-gate/lane-progress.js";

async function responsePerformance(kind: "candidate" | "errand" | "delivery-member", options: { pendingPolicy?: boolean; noFix?: boolean } = {}) {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const errand = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "example",
    claimId: "1".repeat(32), intent: "Repair one issue", owner: "test-user", origin: "description", originEntry: null,
    branch: "fix/example", state: "open", savedHead: null, changeRequest: null,
    createdAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z" });
  if (errand.kind !== "errand") throw new Error("Expected ordinary Errand");
  const primary = kind === "errand" ? await h.seedErrand(errand) : await h.seedMeta("example");
  const seed = performedEvidenceFixture(kind), target = createHostedHandleFixture({ repositoryId: projectId }).admission.reviewTarget;
  const binding = seed.value.binding;
  if (binding === null) throw new Error("Expected owned response binding");
  if (kind === "delivery-member" && binding.kind !== "delivery-member") throw new Error("Expected member binding");
  const outcome = ReviewOutcomeSchema.parse(kind === "delivery-member" && binding.kind === "delivery-member"
    ? hostedOutcome({ repositoryId: projectId, vehicle: binding.deliveryMember, outcome: "findings",
      findings: seed.outcome.hosted?.sealedResult?.findings })
    : localOutcome({ target, outcome: "findings", findings: seed.outcome.findings, vehicle: { kind: "work-unit", identity: "example" },
      ...(kind === "errand" ? { vehicle: { kind: "errand", identity: errand.slug, claimId: errand.claimId },
        lineage: { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: errand.claimId, headSha: target.headSha } } : {}) }));
  const { value: fixed } = performedEvidenceFixture(kind, outcome);
  const noFix = reviewEvidenceFixture(outcome, "reject");
  const performed = options.noFix ? { ...noFix, binding: fixed.binding, performance: {
    schemaVersion: 1, producerId: outcome.attemptId, dispositionSetId: noFix.dispositionSet.dispositionSetId,
    originatingHeadSha: outcome.target.headSha, producedHeadSha: outcome.target.headSha,
    performedAt: "2026-10-20T12:01:00Z" } } : fixed;
  const value = ReviewEvidenceSchema.parse(kind === "errand" ? { ...performed,
    binding: { kind: "errand", errand: { key: errand.slug, claimId: errand.claimId, branch: errand.branch } } } : performed);
  if (value.performance === undefined) throw new Error("Expected complete performance fixture");
  const outcomes = createReviewOutcomePort(h.store, primary.reference.owner), evidence = createReviewEvidencePort(h.store, primary.reference.owner);
  const originalOutcome = await outcomes.create(outcome);
  const { performance: ignoredPerformance, ...approved } = value;
  void ignoredPerformance;
  const approval = composeReviewDispositionRecord(outcome, [approved], primary.reference.owner);
  const ports = { outcomes, evidence, readProjectId: h.projectId };
  const initial = await publishNativeReviewApproval({ ...ports, record: { ...approval,
    approvedDispositionLineage: approval.approvedDispositionLineage.map(node => ({ ...node,
      ...(options.pendingPolicy ? { policyProjectionPending: true as const } : {}) })) }, now: () => "2026-10-20T12:01:00Z" });
  const { fixResponse: ignoredResponse, ...performance } = value.performance;
  void ignoredResponse;
  return { h, primary, outcome, originalOutcome, initial, value, ports, approval,
    input: { ...ports, record: composeReviewDispositionRecord(outcome, [value], primary.reference.owner), performance } };
}

it.each(["candidate", "errand", "delivery-member"] as const)("publishes complete %s performance in one evidence version and composes it for readers", async kind => {
  const { h, primary, outcome, originalOutcome, initial, value, ports, input } = await responsePerformance(kind);
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
  const operations = new NativeReviewInFlightStateStore({ publisher, workItem: primary.reference.owner,
    outcomes: ports.outcomes, evidence: ports.evidence, projectId: h.projectId });
  const result = await new StoredReviewResultReader(ports).readResult(outcome.attemptId);
  expect(await readLaneResponsePerformance(operations, result)).toEqual(input.performance);
  expect(await publisher.list({ root: "review-gate", namespace: "in-flight" })).toEqual([]);
});

it("refuses performance while policy projection is pending and continues after projection completes", async () => {
  const { input, ports, approval, initial } = await responsePerformance("errand", { pendingPolicy: true });
  await expect(publishNativeReviewPerformance(input)).rejects.toThrow("Complete the approved response policy projection");
  expect(await ports.evidence.read(initial.value.dispositionSet.dispositionSetId)).toEqual(initial);
  await publishNativeReviewApproval({ ...ports, record: approval, now: () => "2026-10-20T12:02:00Z" });
  expect((await publishNativeReviewPerformance(input)).value.performance).toMatchObject(input.performance);
});

it("binds a Candidate response once, preserves the performance timestamp, and replays the bound response", async () => {
  const { h, input, ports } = await responsePerformance("candidate");
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
  const { input, ports } = await responsePerformance("candidate");
  const candidateResponseId = canonicalDigest({ response: 1 });
  const original = { ...input, performance: { ...input.performance, candidateResponseId } };
  const stored = await publishNativeReviewPerformance(original);
  await expect(publishNativeReviewPerformance({ ...input, performance: { ...input.performance,
    candidateResponseId: canonicalDigest({ response: 2 }) } })).rejects.toThrow("permitted in-place advances");
  expect(await ports.evidence.read(input.performance.dispositionSetId)).toEqual(stored);
  expect(await publishNativeReviewPerformance(original)).toEqual(stored);
});

it.each(["errand", "delivery-member"] as const)("retains a no-fix %s performance header without inventing a fix transition", async kind => {
  const { h, input, value } = await responsePerformance(kind, { noFix: true });
  const stored = await publishNativeReviewPerformance(input);
  expect(stored.value.performance).toEqual(value.performance);
  expect(stored.value.performance?.fixResponse).toBeUndefined();
  expect(await publishNativeReviewPerformance(input)).toEqual(stored);
  expect(lifecycleSuccess(await h.store.history({ reference: stored.reference }))).toHaveLength(2);
});
