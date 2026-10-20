/** Native approval publication binds canonical responses to actual portable producer outcomes. */
import { expect, it } from "vitest";
import { SlugSchema } from "../../../../../src/lib/kernel/schema/slug.js";
import { approveDispositionState, proposeDispositionSet } from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { localOutcome, frontlineOutcome, hostedOutcome } from "../../../../fixtures/review-outcome.js";
import { createHostedHandleFixture } from "../../../../fixtures/hosted-review.js";
import { reviewEvidenceFixture } from "../../../../fixtures/review-evidence.js";
import { createReviewOutcomePort } from "../../../../../src/lib/store/kinds/review/outcome/access.js";
import { createReviewEvidencePort } from "../../../../../src/lib/store/kinds/review/evidence/access.js";
import { ReviewOutcomeSchema } from "../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { reviewOutcomeKey } from "../../../../../src/lib/store/kinds/review/outcome/key.js";
import { composeReviewDispositionRecord } from "../../../../../src/lib/store/kinds/review/evidence/composed-record.js";
import { publishNativeReviewApproval } from "../../../../../src/scripts/review-gate/runtime/native-review-approval.js";

async function nativeApproval(kind: "local" | "frontline" | "hosted", disposition: "defer" | "fix" = "defer") {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example"), target = createHostedHandleFixture({ repositoryId: projectId }).admission.reviewTarget;
  const findings = [{ findingId: "finding-1", severity: "major" as const, locus: "src/example.ts:1",
    evidenceUrlOrId: "finding-1", sourceOrdinal: 1 }];
  const outcome = ReviewOutcomeSchema.parse(kind === "local" ? localOutcome({ target, outcome: "findings", findings,
    vehicle: { kind: "work-unit", identity: "example" } }) : kind === "frontline" ? frontlineOutcome({ target, findings })
    : hostedOutcome({ repositoryId: projectId, outcome: "findings", findings: [{ findingId: "finding-1", severity: "major",
      origin: "review-thread", threadId: "thread-1", commentId: "comment-1", settlement: "reply-and-resolve",
      sourceOrdinal: 1, locus: "src/example.ts:1", url: "https://example.invalid/thread-1" }, {
      findingId: "finding-2", severity: "minor", origin: "review-body", reviewId: "review-1", fingerprint: "body-1",
      settlement: "not-applicable", sourceOrdinal: 2, locus: "src/example.ts:2", url: "https://example.invalid/review-1", body: "A finding." }] }));
  const outcomes = createReviewOutcomePort(h.store, primary.reference.owner), evidence = createReviewEvidencePort(h.store, primary.reference.owner);
  await outcomes.create(outcome);
  const approved = reviewEvidenceFixture(outcome, disposition);
  const record = composeReviewDispositionRecord(outcome, [approved], primary.reference.owner);
  return { h, primary, outcome, approved, input: { record, outcomes, evidence, readProjectId: h.projectId,
    now: () => "2026-10-20T12:01:00Z" } };
}

it.each(["local", "frontline", "hosted"] as const)("publishes one %s approval under its disposition set and immutable result key", async kind => {
  const { primary, outcome, approved, input } = await nativeApproval(kind);
  const stored = await publishNativeReviewApproval(input);
  expect(stored.reference.owner).toEqual(primary.reference.owner);
  expect(stored.value).toMatchObject({ result: { outcomeKey: reviewOutcomeKey(outcome), resultDigest: approved.result.resultDigest },
    dispositionSet: approved.dispositionSet, approval: approved.approval, binding: null,
    predecessorDispositionSetId: null, successorDispositionSetId: null, responsePolicyRequest: approved.responsePolicyRequest });
  expect(stored.value).not.toHaveProperty("performance");
  expect(stored.value).not.toHaveProperty("advisoryFixTags");
  if (kind === "hosted") {
    expect(stored.value.settlement).toEqual({ findingActions: [
      { findingId: "finding-1", disposition: "defer", channelAction: "reply-and-resolve" },
      { findingId: "finding-2", disposition: "defer", channelAction: "record-only" } ], evidence: [{
      dispositionSetId: approved.dispositionSet.dispositionSetId, findingId: "finding-2", disposition: "defer",
      channelAction: "record-only", carriedFromDispositionSetId: null, performedAt: input.now() }] });
  }
  expect(await input.evidence.readDispositionRecord(outcome.attemptId)).toMatchObject({ source: input.record.source,
    currentDispositionSetId: approved.dispositionSet.dispositionSetId });
  expect(await publishNativeReviewApproval(input)).toEqual(stored);
  const listing = await input.evidence.list();
  expect(listing.status === "complete" && listing.records.length).toBe(1);
});

it.each(["absent", "present"] as const)("retains an absent binding and %s advisory tags on approval replay", async tags => {
  const { outcome, input } = await nativeApproval("local", "fix");
  const tagged = { ...input, record: { ...input.record, approvedDispositionLineage: input.record.approvedDispositionLineage.map(node => ({
    ...node, ...(tags === "absent" ? {} : { advisoryFixTags: [{ findingId: "finding-1", tag: "new-design" as const }] }) })) } };
  const first = await publishNativeReviewApproval(tagged);
  expect(first.value.advisoryFixTags).toEqual(tags === "absent" ? undefined : [{ findingId: "finding-1", tag: "new-design" }]);
  if (outcome.lineage.kind !== "candidate") throw new Error("Expected Candidate-lineage producer");
  const changed = { ...tagged, record: { ...tagged.record, candidate: { workUnit: SlugSchema.parse("example"), candidateId: outcome.lineage.candidateId },
    approvedDispositionLineage: tagged.record.approvedDispositionLineage.map(node => ({ ...node,
      advisoryFixTags: [{ findingId: "finding-1", tag: "local-correction" as const }] })) } };
  expect(await publishNativeReviewApproval(changed)).toEqual(first);
  expect(await input.evidence.read(first.value.dispositionSet.dispositionSetId)).toEqual(first);
});

it("finishes pending policy projection once while retaining the original hosted settlement", async () => {
  const { input } = await nativeApproval("hosted");
  const pending = { ...input, record: { ...input.record, approvedDispositionLineage: input.record.approvedDispositionLineage.map(node => ({
    ...node, policyProjectionPending: true as const })) } };
  const first = await publishNativeReviewApproval(pending);
  expect(first.value.policyProjectionPending).toBe(true);
  const corrected = { ...input, record: { ...input.record, approvedDispositionLineage: input.record.approvedDispositionLineage.map(node => ({
    ...node, responsePolicyRequest: { ...node.responsePolicyRequest, frontlineActive: true } })) } };
  const second = await publishNativeReviewApproval(corrected);
  expect(second.value).not.toHaveProperty("policyProjectionPending");
  expect(second.value.responsePolicyRequest.frontlineActive).toBe(true);
  expect(second.value.settlement).toEqual(first.value.settlement);
  expect(second.version).not.toBe(first.version);
  expect(await publishNativeReviewApproval(corrected)).toEqual(second);
});

it("refuses a replacement approval for an existing set and replays the original after repair", async () => {
  const { input } = await nativeApproval("frontline");
  const first = await publishNativeReviewApproval(input);
  const approved = approveDispositionState({ proposed: proposeDispositionSet(first.value.dispositionSet),
    approvedBy: "another-approver", approvedAt: "2026-10-20T13:00:00Z" });
  const changed = { ...input, record: { ...input.record, approvedDispositionLineage: input.record.approvedDispositionLineage.map(node => ({
    ...node, approvedDisposition: approved })) } };
  await expect(publishNativeReviewApproval(changed)).rejects.toThrow("replay the original approval");
  expect(await input.evidence.read(first.value.dispositionSet.dispositionSetId)).toEqual(first);
  expect(await publishNativeReviewApproval(input)).toEqual(first);
});
