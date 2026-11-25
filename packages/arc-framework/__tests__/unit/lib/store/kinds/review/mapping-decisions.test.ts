/** Original review choices retain their recorded authority through import. */
import { expect, it } from "vitest";
import { mapReviewRecords } from "../../../../../../src/lib/store/kinds/review/mapping.js";
import { ReviewDecisionSchema } from "../../../../../../src/lib/store/kinds/review/decision/schema.js";
import { createLocalMappingFixture } from "../../../../../fixtures/review-mapping.js";
import { approvedRecord } from "../../../../../fixtures/review-response-proof.js";
import { captureConditionalNextPassAuthorization, withdrawConditionalNextPassAuthorization } from "../../../../../../src/scripts/review-gate/lane-progress-conditional.js";
import { assertReviewMapping } from "../../../../../helpers/store/assert-review-mapping.js";

it("maps a native approved-fix grant under its original authorization identity", async () => {
  const fixture = await createLocalMappingFixture();
  await fixture.conclude();
  const producer = await fixture.resultReader.readResult(fixture.state.operationId);
  const record = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const dispositionSetId = record.approvedDispositionLineage[0]!.approvedDisposition.dispositionSet.dispositionSetId;
  const captured = await captureConditionalNextPassAuthorization(fixture.dependencies.operationStore, {
    lane: "standard", repositoryId: producer.repositoryId, headSha: producer.target.headSha, lineage: producer.admission.lineage,
    producerId: producer.producerId, dispositionSetId, authorizedBy: "andrew", exhaustedPassCount: 1, nextPass: 2,
    now: "2026-10-19T13:01:00Z",
  });
  const result = mapReviewRecords(fixture.input());
  const decisions = result.records.filter(({ reference }) => reference.kind === "review/decision");
  expect(decisions).toHaveLength(1);
  expect(decisions[0]!.reference.key).toBe(captured.authorizationId);
  expect(ReviewDecisionSchema.parse(JSON.parse(decisions[0]!.contents[0]!))).toEqual({ schemaVersion: 1,
    subject: { lineage: producer.admission.lineage, headSha: producer.target.headSha, subjectDigest: null },
    lane: "standard", choice: { kind: "extra-pass", passCount: 1, precondition: { kind: "approved-fix",
      repositoryId: producer.repositoryId, producerId: producer.producerId, dispositionSetId,
      originatingHeadSha: producer.target.headSha, exhaustedPassCount: 1 } },
    decidedBy: "andrew", decidedAt: "2026-10-19T13:01:00Z", basis: null });
  const laneSource = fixture.input().gate.find(({ bytes }) => JSON.parse(new TextDecoder().decode(bytes)).state?.kind === "lane-progress")!.path;
  expect(result.listing.find(({ source }) => source === laneSource)!.records).toContainEqual(decisions[0]!.reference);
  await assertReviewMapping(result);
});

it("retains a withdrawn authorization and the authorizer's separate withdrawal", async () => {
  const fixture = await createLocalMappingFixture();
  await fixture.conclude();
  const producer = await fixture.resultReader.readResult(fixture.state.operationId);
  const record = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const dispositionSetId = record.approvedDispositionLineage[0]!.approvedDisposition.dispositionSet.dispositionSetId;
  const context = { lane: "standard" as const, repositoryId: producer.repositoryId, headSha: producer.target.headSha,
    lineage: producer.admission.lineage, producerId: producer.producerId, dispositionSetId };
  const captured = await captureConditionalNextPassAuthorization(fixture.dependencies.operationStore, { ...context,
    authorizedBy: "andrew", exhaustedPassCount: 1, nextPass: 2, now: "2026-10-19T13:01:00Z" });
  const withdrawn = await withdrawConditionalNextPassAuthorization(fixture.dependencies.operationStore, { ...context,
    authorizationId: captured.authorizationId, withdrawnBy: "andrew", now: "2026-10-19T13:02:00Z" }, async () => true);
  expect(withdrawn.state).toBe("withdrawn");
  const result = mapReviewRecords(fixture.input());
  const decisions = result.records.filter(({ reference }) => reference.kind === "review/decision")
    .map(({ contents }) => ReviewDecisionSchema.parse(JSON.parse(contents[0]!)));
  expect(decisions).toHaveLength(2);
  expect(decisions).toContainEqual({ ...decisions.find(({ choice }) => choice.kind === "extra-pass")!,
    choice: { kind: "withdrawal", decisionKey: captured.authorizationId }, decidedAt: "2026-10-19T13:02:00Z" });
  await assertReviewMapping(result);
});

it("cites a consumed local grant on its admitting outcome and each unfinished retry", async () => {
  const { settleLaneAttempt, recordLaneAttempt } = await import("../../../../../../src/scripts/review-gate/lane-progress.js");
  const { ReviewOutcomeSchema } = await import("../../../../../../src/lib/store/kinds/review/outcome/schema.js");
  const fixture = await createLocalMappingFixture();
  await fixture.conclude();
  const producer = fixture.state;
  const record = approvedRecord(await fixture.resultReader.readResult(producer.operationId), [
    { sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const dispositionSetId = record.approvedDispositionLineage[0]!.approvedDisposition.dispositionSet.dispositionSetId;
  const context = { lane: "standard" as const, repositoryId: producer.repositoryId, headSha: producer.target.headSha,
    lineage: producer.lineage, dispositionSetId };
  const captured = await captureConditionalNextPassAuthorization(fixture.dependencies.operationStore, { ...context,
    producerId: producer.operationId, authorizedBy: "author-1", exhaustedPassCount: 1, nextPass: 2, now: fixture.dependencies.now() });
  await settleLaneAttempt(fixture.dependencies.operationStore, { ...context, attemptId: producer.operationId,
    producedHeadSha: producer.target.headSha, now: fixture.dependencies.now() });
  fixture.dependencies.validatePolicyAdmission = async () => ({ state: "ready", pass: 2,
    coverageAdmission: { requestedCoverage: "complete" } });
  const judgment = { ceilingOverride: { exhaustedPassCount: 1, nextPass: 2, conditionalPassAuthorizationId: captured.authorizationId } };
  const admitted = await fixture.prepare(judgment);
  const local = fixture.laneProgress()!.attempts.find(({ attemptId }) => attemptId === admitted.operationId)!.local!;
  await recordLaneAttempt(fixture.dependencies.operationStore, { ...context, attemptId: admitted.operationId,
    sourceId: admitted.laneSourceId, logicalPass: 2, retryGeneration: 0, outcome: "terminal-failure", consumedPass: false,
    changeRequestId: null, local, advancePendingAttempt: true, now: fixture.dependencies.now() });
  const retried = await fixture.prepare(judgment);
  await fixture.conclude("clean", retried);
  const result = mapReviewRecords(fixture.input());
  const outcomes = result.records.filter(({ reference }) => reference.kind === "review/outcome")
    .map(({ contents }) => ReviewOutcomeSchema.parse(JSON.parse(contents[0]!)));
  expect(outcomes.filter(({ logicalPass }) => logicalPass === 2)).toMatchObject([
    { attemptId: admitted.operationId, retryGeneration: 0, admittedBy: captured.authorizationId },
    { attemptId: retried.operationId, retryGeneration: 1, admittedBy: captured.authorizationId },
  ]);
  expect(outcomes.find(({ logicalPass }) => logicalPass === 1)!.admittedBy).toBeUndefined();
  const grant = result.records.find(({ reference }) => reference.key === captured.authorizationId)!;
  expect(ReviewDecisionSchema.parse(JSON.parse(grant.contents[0]!))).toMatchObject({ choice: { passCount: 1 },
    decidedAt: captured.progress.attempts[0]!.conditionalPassAuthorizations!.authorizations[0]!.capturedAt });
  await assertReviewMapping(result);
});

it("joins hosted consumption by admission ID while preserving the acknowledged producer", async () => {
  const { createHostedMappingFixture } = await import("../../../../../fixtures/review-mapping.js");
  const { bindHostedAttemptDisposition, recordLaneResponsePerformance } = await import("../../../../../../src/scripts/review-gate/lane-progress.js");
  const { recordHostedRequestAdmission, acknowledgeHostedRequest, recordHostedAwaitAttempt } = await import(
    "../../../../../../src/scripts/review-gate/lane-progress-hosted-request.js");
  const { hostedLaneAttemptId } = await import("../../../../../../src/scripts/review-gate/hosted/request.js");
  const { ReviewOutcomeSchema } = await import("../../../../../../src/lib/store/kinds/review/outcome/schema.js");
  const fixture = await createHostedMappingFixture();
  const producer = await fixture.resultReader.readResult(fixture.ended.attemptId);
  const record = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const dispositionSetId = record.approvedDispositionLineage[0]!.approvedDisposition.dispositionSet.dispositionSetId;
  const admission = fixture.handle.admission;
  const context = { lane: "standard" as const, repositoryId: admission.repositoryId, headSha: fixture.handle.target.headSha,
    lineage: admission.lineage, dispositionSetId };
  const captured = await captureConditionalNextPassAuthorization(fixture.store, { ...context,
    producerId: producer.producerId, authorizedBy: admission.actorIdentity, exhaustedPassCount: 1, nextPass: 2,
    now: "2026-10-19T13:01:00Z" });
  await bindHostedAttemptDisposition(fixture.store, { operationId: fixture.lane.operationId, attemptId: producer.producerId,
    dispositionSetId, findingDispositions: [{ findingId: "hosted-finding", disposition: "fix", channelAction: "record-only" }],
    now: "2026-10-19T13:01:30Z" });
  await recordLaneResponsePerformance(fixture.store, { ...context, attemptId: producer.producerId,
    producedHeadSha: fixture.handle.target.headSha, now: "2026-10-19T13:02:00Z" });
  const decision = await recordHostedRequestAdmission(fixture.store, { repositoryId: admission.repositoryId,
    lineage: admission.lineage, request: { schemaVersion: 1, target: fixture.handle.target, provider: fixture.handle.provider,
      coverage: "complete", ceilingOverride: { target: fixture.handle.target, lane: "standard", exhaustedPassCount: 1,
        nextPass: 2, conditionalPassAuthorizationId: captured.authorizationId } },
    reviewTarget: admission.reviewTarget, requirement: admission.requirement, actorIdentity: admission.actorIdentity,
    authorizeCapacity: async () => undefined, confirmDispositionSetCurrent: async () => true, now: "2026-10-19T13:03:00Z" });
  if (decision.state !== "admitted") throw new Error("Expected native hosted admission");
  const handle = { ...fixture.handle, admission: decision.admission,
    artifact: { ...fixture.handle.artifact, id: "comment-2" } };
  await acknowledgeHostedRequest(fixture.store, { admission: decision.admission, handle, now: "2026-10-19T13:04:00Z" });
  await recordHostedAwaitAttempt(fixture.store, { repositoryId: admission.repositoryId, now: "2026-10-19T13:05:00Z",
    result: { schemaVersion: 1, mode: "review-hosted-await", handle, state: "clean", nextAction: "complete",
      reviewUrl: "https://example.invalid/review-2" } });
  expect(hostedLaneAttemptId(handle)).not.toBe(decision.admission.admissionId);
  const result = mapReviewRecords(fixture.input());
  const mapped = result.records.filter(({ reference }) => reference.kind === "review/outcome")
    .map(({ contents }) => ReviewOutcomeSchema.parse(JSON.parse(contents[0]!)));
  expect(mapped.find(({ logicalPass }) => logicalPass === 2)).toMatchObject({ attemptId: hostedLaneAttemptId(handle),
    admittedBy: captured.authorizationId, hosted: { admission: { admissionId: decision.admission.admissionId } } });
  const grant = result.records.find(({ reference }) => reference.key === captured.authorizationId)!;
  expect(ReviewDecisionSchema.parse(JSON.parse(grant.contents[0]!))).toMatchObject({ choice: {
    precondition: { producerId: fixture.ended.attemptId } } });
  await assertReviewMapping(result);
});

it.each([false, true])("retains authorization history across successor approval, withdrawn: %s", async (withdraw) => {
  const { invalidateConditionalNextPassAuthorization } = await import("../../../../../../src/scripts/review-gate/lane-progress-conditional.js");
  const { ApprovedDispositionRecordSchema } = await import("../../../../../../src/scripts/review-gate/core/advisory-records.js");
  const fixture = await createLocalMappingFixture();
  await fixture.conclude();
  const producer = await fixture.resultReader.readResult(fixture.state.operationId);
  const first = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const successor = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix", title: "Updated fix" }]);
  const firstNode = first.approvedDispositionLineage[0]!;
  const nextNode = successor.approvedDispositionLineage[0]!;
  const firstId = firstNode.approvedDisposition.dispositionSet.dispositionSetId;
  const nextId = nextNode.approvedDisposition.dispositionSet.dispositionSetId;
  const context = { lane: "standard" as const, repositoryId: producer.repositoryId, headSha: producer.target.headSha,
    lineage: producer.admission.lineage, producerId: producer.producerId };
  const captured = await captureConditionalNextPassAuthorization(fixture.dependencies.operationStore, { ...context,
    dispositionSetId: firstId, authorizedBy: "andrew", exhaustedPassCount: 1, nextPass: 2, now: "2026-10-19T13:01:00Z" });
  if (withdraw) await withdrawConditionalNextPassAuthorization(fixture.dependencies.operationStore, { ...context,
    dispositionSetId: firstId, authorizationId: captured.authorizationId, withdrawnBy: "andrew", now: "2026-10-19T13:02:00Z" }, async () => true);
  await invalidateConditionalNextPassAuthorization(fixture.dependencies.operationStore, { ...context,
    dispositionSetId: firstId, successorDispositionSetId: nextId, now: "2026-10-19T13:03:00Z" });
  const next = await captureConditionalNextPassAuthorization(fixture.dependencies.operationStore, { ...context,
    dispositionSetId: nextId, authorizedBy: "andrew", exhaustedPassCount: 1, nextPass: 2, now: "2026-10-19T13:04:00Z" });
  const record = ApprovedDispositionRecordSchema.parse({ ...first, currentDispositionSetId: nextId,
    approvedDispositionLineage: [{ ...firstNode, successorDispositionSetId: nextId }, { ...nextNode, predecessorDispositionSetId: firstId }] });
  const input = fixture.input();
  input.gate.push({ path: "arc/review-gate/evidence/disposition-lineage.json", bytes: new TextEncoder().encode(JSON.stringify(record)) });
  const result = mapReviewRecords(input);
  const decisions = result.records.filter(({ reference }) => reference.kind === "review/decision");
  expect(decisions.filter(({ reference }) => reference.key === captured.authorizationId)).toHaveLength(1);
  expect(decisions.filter(({ reference }) => reference.key === next.authorizationId)).toHaveLength(1);
  expect(decisions).toHaveLength(withdraw ? 3 : 2);
  expect(decisions.map(({ contents }) => ReviewDecisionSchema.parse(JSON.parse(contents[0]!)))
    .filter(({ choice }) => choice.kind === "withdrawal")).toHaveLength(withdraw ? 1 : 0);
  await assertReviewMapping(result);
});

it("maps the native initial skip on its Candidate without inventing an actor or head", async () => {
  const { candidateRecordFixture } = await import("../../../../../fixtures/review-candidate.js");
  const { mappingErrand, mappingOperation, createHostedMappingFixture } = await import("../../../../../fixtures/review-mapping.js");
  const { recordSingletonFrontlineInitialSkip } = await import("../../../../../../src/scripts/review-gate/policy/frontline-phase.js");
  const fixture = await createHostedMappingFixture("delivery-member");
  const { record } = candidateRecordFixture();
  const marker = await recordSingletonFrontlineInitialSkip(fixture.store, { repositoryId: "repo-1",
    candidateId: record.attestation.candidateId, now: "2026-10-19T13:01:00Z" });
  const input = { projectId: "repo-1", gate: [mappingOperation(marker)],
    workItems: [{ kind: "work-unit" as const, slug: "example", uid: mappingErrand.uid, live: true }],
    candidates: [{ workItem: mappingErrand.uid, versions: [{ commit: "a".repeat(40), content: JSON.stringify(record) }], current: JSON.stringify(record), boundary: null }] };
  const result = mapReviewRecords(input);
  const decisions = result.records.filter(({ reference }) => reference.kind === "review/decision");
  expect(decisions).toHaveLength(1);
  expect(ReviewDecisionSchema.parse(JSON.parse(decisions[0]!.contents[0]!))).toEqual({ schemaVersion: 1,
    subject: { lineage: { kind: "candidate", candidateId: record.attestation.candidateId }, headSha: null, subjectDigest: null },
    lane: "frontline", choice: { kind: "lane-skip" }, decidedBy: null, decidedAt: marker.updatedAt, basis: null });
  expect(result.listing.find(({ source }) => source === input.gate[0]!.path)).toMatchObject({ outcome: "mapped", records: [decisions[0]!.reference] });
  await assertReviewMapping(result);
  const ended = mapReviewRecords({ ...input, workItems: [{ ...input.workItems[0]!, live: false }] });
  expect(ended.records).toEqual([]);
  expect(ended.listing[0]).toMatchObject({ outcome: "left-behind", reason: expect.stringContaining("live work item") });
});

it("coalesces the same native decision retained by two supplied sources", async () => {
  const { candidateRecordFixture } = await import("../../../../../fixtures/review-candidate.js");
  const { mappingErrand, mappingOperation, createHostedMappingFixture } = await import("../../../../../fixtures/review-mapping.js");
  const { recordSingletonFrontlineInitialSkip } = await import("../../../../../../src/scripts/review-gate/policy/frontline-phase.js");
  const fixture = await createHostedMappingFixture("delivery-member");
  const { record } = candidateRecordFixture();
  const marker = await recordSingletonFrontlineInitialSkip(fixture.store, { repositoryId: "repo-1",
    candidateId: record.attestation.candidateId, now: "2026-10-19T13:01:00Z" });
  const first = mappingOperation(marker);
  const second = { ...first, path: "arc/review-gate/operations/retained-skip-copy.json" };
  const result = mapReviewRecords({ projectId: "repo-1", gate: [first, second],
    workItems: [{ kind: "work-unit", slug: "example", uid: mappingErrand.uid, live: true }],
    candidates: [{ workItem: mappingErrand.uid, versions: [{ commit: "a".repeat(40), content: JSON.stringify(record) }], current: JSON.stringify(record), boundary: null }] });
  const decisions = result.records.filter(({ reference }) => reference.kind === "review/decision");
  expect(decisions).toHaveLength(1);
  expect(result.listing.filter(({ source }) => source === first.path || source === second.path))
    .toEqual([first, second].map(({ path }) => ({ source: path, outcome: "mapped", records: [decisions[0]!.reference] })));
  await assertReviewMapping(result);
});

it("preserves logical exhaustion after a complete pass and an incremental pass", async () => {
  const { createHostedMappingFixture } = await import("../../../../../fixtures/review-mapping.js");
  const { createHostedHandleFixture, createHostedTerminalAttemptFixture } = await import("../../../../../fixtures/hosted-review.js");
  const { recordLaneAttempt } = await import("../../../../../../src/scripts/review-gate/lane-progress.js");
  const { deriveReviewOutcomePassCounts } = await import("../../../../../../src/lib/store/kinds/review/outcome/counts.js");
  const { ReviewOutcomeSchema } = await import("../../../../../../src/lib/store/kinds/review/outcome/schema.js");
  const fixture = await createHostedMappingFixture();
  const lineage = { ...fixture.handle.admission.lineage, headSha: "e".repeat(40) };
  const handle = createHostedHandleFixture({ lineage, logicalPass: 2, requestedCoverage: "incremental",
    target: { ...fixture.handle.target, headSha: "e".repeat(40) }, correctionScope: { schemaVersion: 1,
      predecessorProducerId: fixture.ended.attemptId, predecessorHeadSha: fixture.handle.target.headSha,
      basisHeadSha: fixture.handle.target.headSha, headSha: "e".repeat(40), requiredFindings: [] } });
  const ended = createHostedTerminalAttemptFixture({ admission: handle.admission, outcome: "findings",
    findings: fixture.ended.hosted.sealedResult!.findings });
  await recordLaneAttempt(fixture.store, { lane: "standard", repositoryId: handle.admission.repositoryId,
    changeRequestId: "pull/42", headSha: handle.target.headSha, lineage: handle.admission.lineage, logicalPass: 2,
    retryGeneration: 0, attemptId: ended.attemptId, sourceId: handle.provider, outcome: "findings", consumedPass: true,
    hosted: ended.hosted, now: "2026-10-19T13:01:00Z" });
  const producer = await fixture.resultReader.readResult(ended.attemptId);
  const record = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const dispositionSetId = record.approvedDispositionLineage[0]!.approvedDisposition.dispositionSet.dispositionSetId;
  const captured = await captureConditionalNextPassAuthorization(fixture.store, { lane: "standard",
    repositoryId: producer.repositoryId, headSha: producer.target.headSha, lineage: producer.admission.lineage,
    producerId: producer.producerId, dispositionSetId, authorizedBy: "andrew", exhaustedPassCount: 2, nextPass: 3,
    now: "2026-10-19T13:02:00Z" });
  const result = mapReviewRecords(fixture.input());
  const outcomes = result.records.filter(({ reference }) => reference.kind === "review/outcome")
    .map(({ contents }) => ReviewOutcomeSchema.parse(JSON.parse(contents[0]!)));
  expect(deriveReviewOutcomePassCounts({ lane: "standard", lineage: handle.admission.lineage, outcomes }))
    .toMatchObject({ completedPasses: 2, completePasses: 1, nextLogicalPass: 3 });
  const decisions = result.records.filter(({ reference }) => reference.kind === "review/decision");
  expect(decisions).toHaveLength(1);
  expect(decisions[0]!.reference.key).toBe(captured.authorizationId);
  expect(JSON.parse(decisions[0]!.contents[0]!)).toMatchObject({ choice: { passCount: 2,
    precondition: { exhaustedPassCount: 2 } } });
  await assertReviewMapping(result);
});
