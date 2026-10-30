/** Hosted result reads retain sealed producer facts and derive current settlement from evidence. */
import { expect, it } from "vitest";
import { createHostedMappingFixture } from "../../../../../fixtures/review-mapping.js";
import { createReviewHarness } from "../../../../../helpers/store/review-harness.js";
import { lifecycleSuccess } from "../../../../../helpers/store/lifecycle-harness.js";
import { mapReviewRecords } from "../../../../../../src/lib/store/kinds/review/mapping.js";
import { createReviewOutcomePort } from "../../../../../../src/lib/store/kinds/review/outcome/access.js";
import { createReviewEvidencePort } from "../../../../../../src/lib/store/kinds/review/evidence/access.js";
import { StoredReviewResultReader } from "../../../../../../src/scripts/review-gate/hosts/local/stored-result-reader.js";
import { reviewEvidenceFixture } from "../../../../../fixtures/review-evidence.js";
import { HostedSettlementEvidenceSchema } from "../../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { canonicalDigest } from "../../../../../../src/lib/kernel/index.js";
import { validateApprovedDispositionRecordForResult } from "../../../../../../src/scripts/review-gate/core/review-result-disposition.js";
import { reviewOutcomeKey } from "../../../../../../src/lib/store/kinds/review/outcome/key.js";
import { createMemoryRemote } from "../../../../../helpers/store/sync.js";
import { ReferenceBackend } from "../../../../../helpers/store/reference-backend.js";
import { hostedOutcome } from "../../../../../fixtures/review-outcome.js";
import { ReviewOutcomeSchema } from "../../../../../../src/lib/store/kinds/review/outcome/schema.js";

async function portableHosted() {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example");
  if (primary.reference.owner.type !== "work-item" || primary.reference.owner.uid === undefined) throw new Error("Expected work-item generation");
  const fixture = await createHostedMappingFixture("delivery-member", projectId);
  const input = fixture.input();
  input.workItems = [{ kind: "work-unit", slug: "example", uid: primary.reference.owner.uid, live: true }];
  const mapped = mapReviewRecords(input);
  lifecycleSuccess(await h.store.batch({ writes: mapped.records.map(({ reference, contents }) => ({
    action: "put", reference, expected: null, content: contents[0]!,
  })), provenance: { verb: "review", lifecycleAction: "create" } }));
  const outcomes = createReviewOutcomePort(h.store, primary.reference.owner);
  const evidence = createReviewEvidencePort(h.store, primary.reference.owner);
  return { h, primary, fixture, outcomes, evidence };
}

it("reproduces the original hosted result from its portable admission and sealed outcome", async () => {
  const { h, primary, fixture, outcomes, evidence } = await portableHosted();
  const original = await fixture.resultReader.readResult(fixture.ended.attemptId);
  const reader = new StoredReviewResultReader({ outcomes, evidence, readProjectId: h.projectId });
  expect(await reader.readResult(original.producerId)).toEqual({ ...original, workItem: primary.reference.owner });
});

it("derives hosted settlement from the current stored evidence without changing its sealed result", async () => {
  const { h, fixture, outcomes, evidence } = await portableHosted();
  const listed = await outcomes.list();
  if (listed.status !== "complete" || listed.records[0] === undefined) throw new Error("Expected portable outcome");
  const stored = listed.records[0], outcome = stored.value, hosted = outcome.hosted;
  const finding = hosted?.sealedResult?.findings[0];
  if (hosted === undefined || finding?.origin !== "review-thread") throw new Error("Expected sealed thread finding");
  const value = reviewEvidenceFixture(outcome), approval = await evidence.create(value);
  const reader = new StoredReviewResultReader({ outcomes, evidence, readProjectId: h.projectId });
  expect(await reader.readResult(fixture.ended.attemptId)).toMatchObject({ settled: false });
  const entry = HostedSettlementEvidenceSchema.parse({ findingId: finding.findingId, disposition: "defer",
    channelAction: "reply-and-resolve", dispositionSetId: value.dispositionSet.dispositionSetId,
    performedAt: "2026-10-20T00:00:00Z", carriedFromDispositionSetId: null, actorIdentity: hosted.actorIdentity,
    target: hosted.target, fixTarget: null, commentId: finding.commentId, threadId: finding.threadId,
    replyDigest: canonicalDigest({ reply: "Accepted as residual risk." }), replyId: "reply-1" });
  await evidence.advance({ ...value, settlement: { findingActions: value.settlement?.findingActions ?? [], evidence: [entry] } }, approval.version);
  const result = await reader.readResult(fixture.ended.attemptId);
  expect(result).toMatchObject({ settled: true, resultDigest: hosted.sealedResult?.hostedResultId });
  const composed = await evidence.readDispositionRecord(result.producerId);
  if (composed === null) throw new Error("Expected composed hosted approval");
  expect(() => validateApprovedDispositionRecordForResult(composed, result)).not.toThrow();
  expect(await outcomes.read(reviewOutcomeKey(outcome))).toEqual(stored);
});

it("refuses conflicted hosted evidence and returns the result after resolution", async () => {
  const { h, primary, fixture, outcomes, evidence } = await portableHosted();
  const listed = await outcomes.list();
  if (listed.status !== "complete" || listed.records[0] === undefined) throw new Error("Expected hosted outcome");
  const value = reviewEvidenceFixture(listed.records[0].value), remote = createMemoryRemote();
  h.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.push());
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  const stored = await evidence.create(value);
  await createReviewEvidencePort(writer, primary.reference.owner).create({ ...value,
    approval: { ...value.approval, approvedAt: "2026-10-19T14:00:00Z" } });
  lifecycleSuccess(await h.store.push());
  const record = lifecycleSuccess(await h.store.read({ reference: stored.reference }));
  expect(record.conflicts.length).toBeGreaterThan(0);
  const reader = new StoredReviewResultReader({ outcomes, evidence, readProjectId: h.projectId });
  await expect(reader.readResult(fixture.ended.attemptId)).rejects.toMatchObject({
    refusal: { code: "record-malformed", class: "recoverable", rule: "review.record-conflict" },
    message: expect.stringContaining("Resolve the named conflict records") });
  for (const reference of record.conflicts) {
    const conflict = lifecycleSuccess(await h.store.read({ reference }));
    lifecycleSuccess(await h.store.write({ action: "remove", reference, expected: conflict.version,
      resolves: [reference], provenance: { verb: "resolve", lifecycleAction: "edit" } }));
  }
  expect(await reader.readResult(fixture.ended.attemptId)).toMatchObject({ producerId: fixture.ended.attemptId, settled: false });
});

it("retains unestablished hosted coverage without claiming its incremental correction scope", async () => {
  const { h, outcomes, evidence } = await portableHosted();
  const outcome = ReviewOutcomeSchema.parse(hostedOutcome({ repositoryId: await h.projectId(), requestedCoverage: "incremental",
    coverageEvidence: { schemaVersion: 1, kind: "provider-native-incremental", sourceId: "coderabbit-pr",
      requestArtifactId: "comment-1", status: "unestablished", reason: "provider-incremental-range-missing" } }));
  expect(outcome.hosted?.admission.correctionScope).toBeDefined();
  await outcomes.create(outcome);
  const result = await new StoredReviewResultReader({ outcomes, evidence, readProjectId: h.projectId }).readResult(outcome.attemptId);
  expect(result).toMatchObject({ kind: "hosted", producerId: outcome.attemptId,
    admission: { requestedCoverage: "incremental", effectiveCoverage: null },
    coverageEvidence: { status: "unestablished", reason: "provider-incremental-range-missing" } });
  expect(result.admission).not.toHaveProperty("correctionScope");
});

it("retains established hosted incremental coverage and its admitted correction scope", async () => {
  const { h, outcomes, evidence } = await portableHosted();
  const outcome = ReviewOutcomeSchema.parse(hostedOutcome({ repositoryId: await h.projectId(), requestedCoverage: "incremental" }));
  await outcomes.create(outcome);
  expect(await new StoredReviewResultReader({ outcomes, evidence, readProjectId: h.projectId }).readResult(outcome.attemptId))
    .toMatchObject({ kind: "hosted", admission: { requestedCoverage: "incremental", effectiveCoverage: "incremental",
      correctionScope: outcome.hosted?.admission.correctionScope }, coverageEvidence: { status: "established" } });
});
