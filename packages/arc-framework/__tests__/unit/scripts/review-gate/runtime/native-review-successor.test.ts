/** Native response succession is checked against actual predecessor and result records. */
import { expect, it, onTestFinished } from "vitest";
import { hostedSettlementFixture } from "../../../../fixtures/review-evidence.js";
import { publishNativeHostedSettlement } from "../../../../../src/scripts/review-gate/runtime/native-hosted-settlement.js";
import { createNativeReviewApprovalFixture } from "../../../../fixtures/native-review-approval.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { lifecycleSuccess } from "../../../../helpers/store/lifecycle-harness.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import { createDispositionSet, approveDispositionSet } from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { ReviewEvidenceSchema } from "../../../../../src/lib/store/kinds/review/evidence/schema.js";
import { composeReviewDispositionRecord } from "../../../../../src/lib/store/kinds/review/evidence/composed-record.js";
import { publishNativeReviewPerformance } from "../../../../../src/scripts/review-gate/runtime/native-review-performance.js";
import { publishNativeReviewApproval } from "../../../../../src/scripts/review-gate/runtime/native-review-approval.js";
import { publishNativeReviewSuccessor } from "../../../../../src/scripts/review-gate/runtime/native-review-successor.js";
import { bindNativeReviewPorts } from "../../../../helpers/store/native-review-ports.js";

async function nativeSuccessor(kind: "local" | "frontline" | "hosted", tags?: "absent" | "present") {
  const f = await createNativeReviewApprovalFixture(kind, tags === undefined ? "defer" : "fix");
  const tagged = { ...f.input, record: { ...f.input.record, approvedDispositionLineage: f.input.record.approvedDispositionLineage.map(node => ({
    ...node, ...(tags === "present" ? { advisoryFixTags: node.approvedDisposition.dispositionSet.findings.map(finding => ({
      findingId: finding.findingId, tag: "new-design" as const })) } : {}) })) } };
  const prior = await publishNativeReviewApproval(tagged);
  const { dispositionSetId: ignored, ...original } = prior.value.dispositionSet;
  void ignored;
  const dispositionSet = createDispositionSet({ ...original, proposedBy: "successor-proposer" });
  const approval = approveDispositionSet({ dispositionSet, approvedBy: "andrew", approvedAt: "2026-10-20T13:00:00Z" });
  const next = ReviewEvidenceSchema.parse({ ...prior.value, dispositionSet, approval,
    ...(tags === undefined ? {} : { advisoryFixTags: dispositionSet.findings.map(finding => ({
      findingId: finding.findingId, tag: "local-correction" as const })) }),
    predecessorDispositionSetId: prior.value.dispositionSet.dispositionSetId,
    ...(prior.value.settlement === undefined ? {} : { settlement: { ...prior.value.settlement, evidence: [] } }) });
  const record = composeReviewDispositionRecord(f.outcome, [{ ...prior.value,
    successorDispositionSetId: dispositionSet.dispositionSetId }, next], f.primary.reference.owner);
  const checkout = await createReviewCheckout(f.h);
  onTestFinished(checkout.cleanup);
  const inFlight = bindNativeReviewPorts({ store: f.h.store, owner: f.primary.reference.owner,
    publisher: new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd), projectId: f.h.projectId }).inFlight;
  return { ...f, prior, next, input: { ...f.input, record, inFlight, store: f.h.store } };
}

it.each(["local", "frontline", "hosted"] as const)("links a %s successor atomically and composes the new current set", async kind => {
  const { h, prior, next, input } = await nativeSuccessor(kind);
  const stored = await publishNativeReviewSuccessor(input);
  const parent = await input.evidence.read(prior.value.dispositionSet.dispositionSetId);
  expect(stored.value).toMatchObject({ result: prior.value.result, binding: prior.value.binding,
    dispositionSet: next.dispositionSet, approval: next.approval, predecessorDispositionSetId: prior.value.dispositionSet.dispositionSetId,
    successorDispositionSetId: null });
  expect(parent?.value).toEqual({ ...prior.value, successorDispositionSetId: next.dispositionSet.dispositionSetId });
  expect(lifecycleSuccess(await h.store.history({ reference: stored.reference }))).toHaveLength(1);
  expect(lifecycleSuccess(await h.store.history({ reference: prior.reference }))).toHaveLength(2);
  if (kind === "hosted") expect(stored.value.settlement?.evidence).toEqual(prior.value.settlement?.evidence.map(entry => ({
    ...entry, dispositionSetId: next.dispositionSet.dispositionSetId, carriedFromDispositionSetId: prior.value.dispositionSet.dispositionSetId })));
  expect(await input.evidence.readDispositionRecord(input.record.operationId)).toMatchObject({
    currentDispositionSetId: next.dispositionSet.dispositionSetId, approvedDispositionLineage: [
      { successorDispositionSetId: next.dispositionSet.dispositionSetId }, { predecessorDispositionSetId: prior.value.dispositionSet.dispositionSetId }] });
  expect(await publishNativeReviewSuccessor(input)).toEqual(stored);
  expect(await input.evidence.read(prior.value.dispositionSet.dispositionSetId)).toEqual(parent);
});

it("refuses a second successor to the same predecessor and continues by replaying its current approval", async () => {
  const { outcome, primary, prior, next, input } = await nativeSuccessor("local");
  const first = await publishNativeReviewSuccessor(input);
  const { dispositionSetId: ignored, ...identity } = next.dispositionSet;
  void ignored;
  const dispositionSet = createDispositionSet({ ...identity, proposedBy: "competing-proposer" });
  const competitor = { ...next, dispositionSet, approval: approveDispositionSet({ dispositionSet,
    approvedBy: "andrew", approvedAt: "2026-10-20T14:00:00Z" }) };
  const record = composeReviewDispositionRecord(outcome, [{ ...prior.value,
    successorDispositionSetId: dispositionSet.dispositionSetId }, competitor], primary.reference.owner);
  await expect(publishNativeReviewSuccessor({ ...input, record })).rejects.toThrow("replay the current approval");
  expect(await input.evidence.read(dispositionSet.dispositionSetId)).toBeNull();
  expect(await publishNativeReviewSuccessor(input)).toEqual(first);
});

it("refuses succession after performance and preserves replay of the performed response", async () => {
  const { outcome, primary, prior, input } = await nativeSuccessor("frontline");
  const performanceInput = { outcomes: input.outcomes, evidence: input.evidence, readProjectId: input.readProjectId,
    record: composeReviewDispositionRecord(outcome, [prior.value], primary.reference.owner),
    performance: { schemaVersion: 1 as const, producerId: outcome.attemptId,
      dispositionSetId: prior.value.dispositionSet.dispositionSetId, originatingHeadSha: outcome.target.headSha,
      producedHeadSha: outcome.target.headSha, performedAt: "2026-10-20T13:00:00Z" } };
  const performed = await publishNativeReviewPerformance(performanceInput);
  await expect(publishNativeReviewSuccessor(input)).rejects.toThrow("replay that response");
  expect(await input.evidence.read(input.record.currentDispositionSetId)).toBeNull();
  expect(await input.evidence.read(prior.value.dispositionSet.dispositionSetId)).toEqual(performed);
  expect(await publishNativeReviewPerformance(performanceInput)).toEqual(performed);
});

it.each(["absent", "present"] as const)("preserves %s predecessor tags while recording the successor's own tags", async tags => {
  const { prior, next, input } = await nativeSuccessor("local", tags);
  const stored = await publishNativeReviewSuccessor(input);
  expect(stored.value.advisoryFixTags).toEqual(next.advisoryFixTags);
  const parent = await input.evidence.read(prior.value.dispositionSet.dispositionSetId);
  expect(parent?.value.advisoryFixTags).toEqual(prior.value.advisoryFixTags);
  expect(parent?.value).toEqual({ ...prior.value, successorDispositionSetId: next.dispositionSet.dispositionSetId });
});

it("carries an actual replied-and-resolved predecessor receipt without changing its host proof", async () => {
  const { outcome, prior, next, input } = await nativeSuccessor("hosted");
  if (outcome.hosted === undefined) throw new Error("Expected a hosted producer");
  const receipt = { ...hostedSettlementFixture().entry, dispositionSetId: prior.value.dispositionSet.dispositionSetId,
    findingId: "finding-1", target: outcome.hosted.target };
  const settled = await publishNativeHostedSettlement({ ...input, producerId: outcome.attemptId, settlement: receipt });
  const stored = await publishNativeReviewSuccessor(input);
  expect(stored.value.settlement?.evidence).toEqual(settled.value.settlement?.evidence.map(entry => ({
    ...entry, dispositionSetId: next.dispositionSet.dispositionSetId, carriedFromDispositionSetId: prior.value.dispositionSet.dispositionSetId })));
  expect(await input.evidence.read(prior.value.dispositionSet.dispositionSetId)).toMatchObject({
    value: { settlement: settled.value.settlement } });
});

it("finishes a successor's pending policy projection once while preserving both lineage records", async () => {
  const { prior, input } = await nativeSuccessor("frontline");
  const record = { ...input.record, approvedDispositionLineage: input.record.approvedDispositionLineage.map(node => ({ ...node,
    ...(node.approvedDisposition.dispositionSet.dispositionSetId === input.record.currentDispositionSetId
      ? { policyProjectionPending: true as const } : {}) })) };
  const pending = await publishNativeReviewSuccessor({ ...input, record });
  expect(pending.value.policyProjectionPending).toBe(true);
  const parent = await input.evidence.read(prior.value.dispositionSet.dispositionSetId);
  const completed = await publishNativeReviewSuccessor(input);
  expect(completed.value).not.toHaveProperty("policyProjectionPending");
  expect(completed.version).not.toBe(pending.version);
  expect(await publishNativeReviewSuccessor(input)).toEqual(completed);
  expect(await input.evidence.read(prior.value.dispositionSet.dispositionSetId)).toEqual(parent);
});
