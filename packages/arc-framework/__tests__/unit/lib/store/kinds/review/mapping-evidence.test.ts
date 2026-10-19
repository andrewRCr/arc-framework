/** Imported approvals retain their exact producer binding and durable lineage. */
import { expect, it } from "vitest";
import { mapReviewRecords } from "../../../../../../src/lib/store/kinds/review/mapping.js";
import { ReviewOutcomeSchema } from "../../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { ReviewEvidenceSchema } from "../../../../../../src/lib/store/kinds/review/evidence/schema.js";
import { ApprovedDispositionRecordSchema, type ApprovedDispositionRecord } from "../../../../../../src/scripts/review-gate/core/advisory-records.js";
import type { ReviewMappingInput } from "../../../../../../src/lib/store/kinds/review/mapping-types.js";
import { canonicalDigest } from "../../../../../../src/lib/kernel/index.js";
import { createLocalMappingFixture, createFrontlineMappingFixture } from "../../../../../fixtures/review-mapping.js";
import { approvedRecord } from "../../../../../fixtures/review-response-proof.js";
import { assertReviewMapping } from "../../../../../helpers/store/assert-review-mapping.js";

function appendDisposition(input: ReviewMappingInput, record: ApprovedDispositionRecord): string {
  const source = `arc/review-gate/evidence/disposition-${canonicalDigest({ operationId: record.operationId }).slice(7)}.json`;
  input.gate.push({ path: source, bytes: new TextEncoder().encode(JSON.stringify(record)) });
  return source;
}

it("maps an approved local response to evidence on its result's imported owner", async () => {
  const fixture = await createLocalMappingFixture();
  await fixture.conclude();
  const producer = await fixture.resultReader.readResult(fixture.state.operationId);
  const record = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "defer" }]);
  const input = fixture.input();
  const source = appendDisposition(input, record);
  const result = mapReviewRecords(input);
  const evidenceRecords = result.records.filter(({ reference }) => reference.kind === "review/evidence");
  expect(evidenceRecords).toHaveLength(1);
  const mapped = evidenceRecords[0]!;
  const approved = record.approvedDispositionLineage[0]!.approvedDisposition;
  expect(mapped.reference).toMatchObject({ key: approved.dispositionSet.dispositionSetId,
    owner: result.records.find(({ reference }) => reference.kind === "review/outcome")!.reference.owner });
  expect(ReviewEvidenceSchema.parse(JSON.parse(mapped.contents[0]!))).toEqual({
    schemaVersion: 1, result: { outcomeKey: producer.producerId, resultDigest: producer.resultDigest }, binding: null,
    dispositionSet: approved.dispositionSet, approval: approved.approval,
    predecessorDispositionSetId: null, successorDispositionSetId: null,
    responsePolicyRequest: record.approvedDispositionLineage[0]!.responsePolicyRequest,
  });
  expect(result.listing.find((entry) => entry.source === source)).toMatchObject({ outcome: "mapped", records: [mapped.reference] });
  await assertReviewMapping(result);
});


it("maps every approved set in a lineage with both adjacent succession edges", async () => {
  const fixture = await createLocalMappingFixture();
  await fixture.conclude();
  const producer = await fixture.resultReader.readResult(fixture.state.operationId);
  const first = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "defer" }]);
  const next = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "reject" }]);
  const firstNode = first.approvedDispositionLineage[0]!;
  const nextNode = next.approvedDispositionLineage[0]!;
  const firstId = firstNode.approvedDisposition.dispositionSet.dispositionSetId;
  const nextId = nextNode.approvedDisposition.dispositionSet.dispositionSetId;
  const record = ApprovedDispositionRecordSchema.parse({ ...first, currentDispositionSetId: nextId,
    approvedDispositionLineage: [{ ...firstNode, successorDispositionSetId: nextId },
      { ...nextNode, predecessorDispositionSetId: firstId }] });
  const input = fixture.input();
  appendDisposition(input, record);
  const result = mapReviewRecords(input);
  const evidence = result.records.filter(({ reference }) => reference.kind === "review/evidence");
  expect(evidence.map(({ reference }) => reference.key)).toEqual([firstId, nextId]);
  expect(evidence.map(({ contents }) => ReviewEvidenceSchema.parse(JSON.parse(contents[0]!))))
    .toMatchObject([{ predecessorDispositionSetId: null, successorDispositionSetId: nextId, approval: firstNode.approvedDisposition.approval },
      { predecessorDispositionSetId: firstId, successorDispositionSetId: null, approval: nextNode.approvedDisposition.approval }]);
  await assertReviewMapping(result);
});

it("lists a disposition skipped by the original enumerator as left behind", async () => {
  const fixture = await createLocalMappingFixture();
  await fixture.conclude();
  const producer = await fixture.resultReader.readResult(fixture.state.operationId);
  const record = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "defer" }]);
  const raw = JSON.stringify({ ...record, approvedDispositionLineage: undefined });
  const { LocalApprovedDispositionRecordStore } = await import("../../../../../../src/scripts/review-gate/hosts/local/disposition-record-store.js");
  const store = new LocalApprovedDispositionRecordStore({
    list: async () => [], read: async () => raw,
    snapshot: async () => [{ kind: "file", name: "disposition-older.json", content: raw }],
    update: async () => { throw new Error("Unexpected record write"); },
  });
  expect(await store.listDispositionRecords()).toEqual([]);
  const input = fixture.input();
  input.gate.push({ path: "arc/review-gate/evidence/disposition-older.json", bytes: new TextEncoder().encode(raw) });
  const result = mapReviewRecords(input);
  expect(result.records.filter(({ reference }) => reference.kind === "review/evidence")).toEqual([]);
  expect(result.listing.find(({ source }) => source.endsWith("/disposition-older.json"))).toMatchObject({
    outcome: "left-behind", records: [], reason: expect.stringMatching(/older|malformed/iu),
  });
  await assertReviewMapping(result);
});


it("preserves stored fix tags and policy-pending state for a portable report replay", async () => {
  const fixture = await createLocalMappingFixture();
  await fixture.conclude();
  const producer = await fixture.resultReader.readResult(fixture.state.operationId);
  const original = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const { createPendingResponseDispositionNode } = await import("../../../../../../src/scripts/review-gate/core/advisory-records.js");
  const tags = [{ findingId: "finding-1", tag: "new-design" as const }];
  const node = createPendingResponseDispositionNode({ ...original.approvedDispositionLineage[0]!, advisoryFixTags: tags });
  const record = ApprovedDispositionRecordSchema.parse({ ...original, approvedDispositionLineage: [node] });
  const input = fixture.input();
  appendDisposition(input, record);
  const result = mapReviewRecords(input);
  const bytes = result.records.find(({ reference }) => reference.kind === "review/evidence")!.contents[0]!;
  const copied = ReviewEvidenceSchema.parse(JSON.parse(new TextDecoder().decode(new TextEncoder().encode(bytes))));
  expect(copied.advisoryFixTags).toEqual(tags);
  expect(copied.policyProjectionPending).toBe(true);
  const { renderDispositionReport } = await import("../../../../../../src/scripts/review-gate/core/disposition-report.js");
  const copiedOutcome = ReviewOutcomeSchema.parse(JSON.parse(result.records.find(({ reference }) => reference.kind === "review/outcome")!.contents[0]!));
  const replay = renderDispositionReport({ dispositionSet: copied.dispositionSet, producerFindings: copiedOutcome.findings,
    includeDecisions: false, tags: copied.advisoryFixTags });
  expect(replay).toContain("FIX (new design)");
  await assertReviewMapping(result);
});


it("resolves a frontline response reference and retains its combined Candidate and member binding", async () => {
  const { fixture, input } = await createFrontlineMappingFixture();
  const producer = await fixture.reader.readResult(fixture.admission.operationId);
  const original = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "minor", disposition: "defer" }]);
  const binding = fixture.outcomeRecord.responseBinding!;
  const { target: ignored, ...candidate } = binding.candidate;
  void ignored;
  const record = ApprovedDispositionRecordSchema.parse({ ...original, candidate, deliveryMember: binding.deliveryMember });
  appendDisposition(input, record);
  const result = mapReviewRecords(input);
  const mapped = result.records.find(({ reference }) => reference.kind === "review/evidence")!;
  const evidence = ReviewEvidenceSchema.parse(JSON.parse(mapped.contents[0]!));
  expect(evidence.result).toEqual({ outcomeKey: fixture.admission.operationId, resultDigest: fixture.outcomeRecord.outcomeDigest });
  expect(evidence.binding).toEqual({ kind: "candidate-member", candidate, deliveryMember: binding.deliveryMember });
  await assertReviewMapping(result);
});

it.each([false, true])("joins an Errand fix response with recorded lane performance: %s", async (withLanePerformance) => {
  const fixture = await createLocalMappingFixture();
  await fixture.conclude();
  const producer = await fixture.resultReader.readResult(fixture.state.operationId);
  const original = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const node = original.approvedDispositionLineage[0]!;
  const { createFixAuthorization, consumeFixAuthorization } = await import("../../../../../../src/scripts/review-gate/core/fix-authorization.js");
  const { createReviewTarget } = await import("../../../../../../src/scripts/review-gate/core/gate-contract-v2.js");
  const { targetId: ignored, ...coordinates } = producer.target;
  void ignored;
  const newTarget = createReviewTarget({ ...coordinates, headSha: "e".repeat(40), headTree: "f".repeat(40) });
  const authorization = createFixAuthorization({ dispositionState: node.approvedDisposition, oldTarget: producer.target });
  const fixConsumption = consumeFixAuthorization({ authorization, oldTarget: producer.target, newTarget,
    appliedBy: "andrew", consumedAt: "2026-10-19T13:01:00Z", verificationRefs: ["test:passed"], priorConsumptions: [] });
  const response = { oldTarget: producer.target, newTarget, applicability: "full" as const, fixConsumption, hostedTarget: null };
  const { mappingErrand } = await import("../../../../../fixtures/review-mapping.js");
  const errand = { key: mappingErrand.slug, claimId: mappingErrand.claimId, branch: "fix/review-errand" };
  const record = ApprovedDispositionRecordSchema.parse({ ...original, errand, approvedDispositionLineage: [{ ...node,
    fixAuthorization: authorization, errandFixResponse: response }] });
  if (withLanePerformance) {
    const { recordLaneResponsePerformance } = await import("../../../../../../src/scripts/review-gate/lane-progress.js");
    await recordLaneResponsePerformance(fixture.dependencies.operationStore, { lane: "standard", repositoryId: fixture.state.repositoryId,
      headSha: producer.target.headSha, lineage: producer.admission.lineage, attemptId: producer.producerId,
      dispositionSetId: node.approvedDisposition.dispositionSet.dispositionSetId, producedHeadSha: newTarget.headSha,
      now: "2026-10-19T13:02:00Z" });
  }
  const input = fixture.input();
  appendDisposition(input, record);
  const result = mapReviewRecords(input);
  const mapped = ReviewEvidenceSchema.parse(JSON.parse(result.records.find(({ reference }) => reference.kind === "review/evidence")!.contents[0]!));
  expect(mapped.performance).toEqual({ schemaVersion: 1, producerId: producer.producerId,
    dispositionSetId: node.approvedDisposition.dispositionSet.dispositionSetId, originatingHeadSha: producer.target.headSha,
    producedHeadSha: newTarget.headSha, performedAt: withLanePerformance ? "2026-10-19T13:02:00Z" : fixConsumption.consumedAt,
    fixResponse: response });
  expect(mapped.binding).toEqual({ kind: "errand", errand });
  await assertReviewMapping(result);
});

it("joins hosted approval, normalized outcome key, finding actions, and settlement receipts", async () => {
  const { createHostedMappingFixture } = await import("../../../../../fixtures/review-mapping.js");
  const fixture = await createHostedMappingFixture();
  const producer = await fixture.resultReader.readResult(fixture.ended.attemptId);
  const record = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "defer" }]);
  const node = record.approvedDispositionLineage[0]!;
  const { bindHostedAttemptDisposition } = await import("../../../../../../src/scripts/review-gate/lane-progress.js");
  const updated = await bindHostedAttemptDisposition(fixture.store, { operationId: fixture.lane.operationId,
    attemptId: fixture.ended.attemptId, dispositionSetId: node.approvedDisposition.dispositionSet.dispositionSetId,
    findingDispositions: [{ findingId: "hosted-finding", disposition: "defer", channelAction: "record-only" }],
    now: "2026-10-19T13:01:00Z" });
  const input = fixture.input();
  appendDisposition(input, record);
  const result = mapReviewRecords(input);
  const evidence = ReviewEvidenceSchema.parse(JSON.parse(result.records.find(({ reference }) => reference.kind === "review/evidence")!.contents[0]!));
  expect(evidence.result).toEqual({ outcomeKey: fixture.handle.admission.admissionId.replace(/^hosted-admission\//u, "hosted-admission-"),
    resultDigest: producer.resultDigest });
  expect(evidence.dispositionSet.producerId).toBe(fixture.ended.attemptId);
  expect(evidence.settlement).toEqual({ findingActions: updated.attempts[0]!.hosted!.dispositionSetLineage[0]!.findingActions,
    evidence: updated.attempts[0]!.hosted!.settlementEvidence });
  await assertReviewMapping(result);
});

it("retains a Candidate-only approval binding on the imported work unit", async () => {
  const { candidateFixture } = await import("../../../../../helpers/store/tracked-write-fixture.js");
  const { serializeCandidateManagedRecord } = await import("../../../../../../src/lib/work-unit/candidate-attestation.js");
  const candidate = candidateFixture();
  const workItem = { kind: "work-unit" as const, slug: "example", uid: "123e4567-e89b-42d3-a456-426614174000", live: true };
  const fixture = await createLocalMappingFixture({ lineage: { kind: "candidate", candidateId: candidate.attestation.candidateId },
    vehicle: { kind: "work-unit", identity: workItem.slug }, imported: { workItems: [workItem], candidates: [{ workItem: workItem.uid,
      versions: [{ commit: "a".repeat(40), content: serializeCandidateManagedRecord(candidate) }], boundary: null }] } });
  await fixture.conclude();
  const producer = await fixture.resultReader.readResult(fixture.state.operationId);
  const original = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "defer" }]);
  const binding = { workUnit: candidate.attestation.workUnit, candidateId: candidate.attestation.candidateId };
  const record = ApprovedDispositionRecordSchema.parse({ ...original, candidate: binding });
  const input = fixture.input();
  appendDisposition(input, record);
  const result = mapReviewRecords(input);
  const evidence = ReviewEvidenceSchema.parse(JSON.parse(result.records.find(({ reference }) => reference.kind === "review/evidence")!.contents[0]!));
  expect(evidence.binding).toEqual({ kind: "candidate", candidate: binding });
  await assertReviewMapping(result);
});

it("joins a delivery member's complete fix transition with its hosted performance and settlement", async () => {
  const { createHostedMappingFixture } = await import("../../../../../fixtures/review-mapping.js");
  const fixture = await createHostedMappingFixture("delivery-member");
  const producer = await fixture.resultReader.readResult(fixture.ended.attemptId);
  if (producer.kind !== "hosted") throw new Error("Expected hosted member producer");
  const original = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const node = original.approvedDispositionLineage[0]!;
  const { createReviewTarget } = await import("../../../../../../src/scripts/review-gate/core/gate-contract-v2.js");
  const { createFixAuthorization, consumeFixAuthorization } = await import("../../../../../../src/scripts/review-gate/core/fix-authorization.js");
  const { targetId: ignored, ...coordinates } = producer.target;
  void ignored;
  const newTarget = createReviewTarget({ ...coordinates, headSha: "e".repeat(40), headTree: "f".repeat(40) });
  const authorization = createFixAuthorization({ dispositionState: node.approvedDisposition, oldTarget: producer.target });
  const fixConsumption = consumeFixAuthorization({ authorization, oldTarget: producer.target, newTarget, appliedBy: "andrew",
    consumedAt: "2026-10-19T13:01:00Z", verificationRefs: ["test:passed"], priorConsumptions: [] });
  const response = { oldTarget: producer.target, newTarget, applicability: "full" as const, fixConsumption,
    hostedTarget: producer.hostedTarget, hostedFixTarget: { ...producer.hostedTarget, headSha: newTarget.headSha } };
  const record = ApprovedDispositionRecordSchema.parse({ ...original, deliveryMember: fixture.member,
    approvedDispositionLineage: [{ ...node, fixAuthorization: authorization, deliveryMemberFixResponse: response }] });
  const { bindHostedAttemptDisposition, recordLaneResponsePerformance } = await import("../../../../../../src/scripts/review-gate/lane-progress.js");
  await bindHostedAttemptDisposition(fixture.store, { operationId: fixture.lane.operationId, attemptId: fixture.ended.attemptId,
    dispositionSetId: node.approvedDisposition.dispositionSet.dispositionSetId,
    findingDispositions: [{ findingId: "hosted-finding", disposition: "fix", channelAction: "record-only" }],
    now: "2026-10-19T13:01:30Z" });
  const updated = await recordLaneResponsePerformance(fixture.store, { lane: "standard", repositoryId: producer.repositoryId,
    headSha: producer.target.headSha, lineage: producer.admission.lineage, attemptId: producer.producerId,
    dispositionSetId: node.approvedDisposition.dispositionSet.dispositionSetId, producedHeadSha: newTarget.headSha,
    now: "2026-10-19T13:02:00Z" });
  const input = fixture.input();
  appendDisposition(input, record);
  const result = mapReviewRecords(input);
  const evidence = ReviewEvidenceSchema.parse(JSON.parse(result.records.find(({ reference }) => reference.kind === "review/evidence")!.contents[0]!));
  expect(evidence.binding).toEqual({ kind: "delivery-member", deliveryMember: fixture.member });
  expect(evidence.performance).toEqual({ ...updated.attempts[0]!.responsePerformance, fixResponse: response });
  await assertReviewMapping(result);
});

it("keeps hosted settlement on each historical set and preserves direct-predecessor carry", async () => {
  const { createHostedMappingFixture } = await import("../../../../../fixtures/review-mapping.js");
  const fixture = await createHostedMappingFixture();
  const producer = await fixture.resultReader.readResult(fixture.ended.attemptId);
  const first = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "defer" }]);
  const next = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "defer", title: "Updated wording" }]);
  const firstNode = first.approvedDispositionLineage[0]!;
  const nextNode = next.approvedDispositionLineage[0]!;
  const firstId = firstNode.approvedDisposition.dispositionSet.dispositionSetId;
  const nextId = nextNode.approvedDisposition.dispositionSet.dispositionSetId;
  const { bindHostedAttemptDisposition, supersedeHostedAttemptDisposition } = await import("../../../../../../src/scripts/review-gate/lane-progress.js");
  const findingDispositions = [{ findingId: "hosted-finding", disposition: "defer" as const, channelAction: "record-only" as const }];
  await bindHostedAttemptDisposition(fixture.store, { operationId: fixture.lane.operationId, attemptId: fixture.ended.attemptId,
    dispositionSetId: firstId, findingDispositions, now: "2026-10-19T13:01:00Z" });
  await supersedeHostedAttemptDisposition(fixture.store, { operationId: fixture.lane.operationId, attemptId: fixture.ended.attemptId,
    predecessorDispositionSetId: firstId, successorDispositionSetId: nextId, findingDispositions, now: "2026-10-19T13:02:00Z" });
  const record = ApprovedDispositionRecordSchema.parse({ ...first, currentDispositionSetId: nextId,
    approvedDispositionLineage: [{ ...firstNode, successorDispositionSetId: nextId }, { ...nextNode, predecessorDispositionSetId: firstId }] });
  const input = fixture.input();
  appendDisposition(input, record);
  const result = mapReviewRecords(input);
  const evidence = result.records.filter(({ reference }) => reference.kind === "review/evidence")
    .map(({ contents }) => ReviewEvidenceSchema.parse(JSON.parse(contents[0]!)));
  expect(evidence.map((value) => value.settlement)).toEqual([
    { findingActions: findingDispositions, evidence: [{ findingId: "hosted-finding", dispositionSetId: firstId,
      disposition: "defer", channelAction: "record-only", performedAt: "2026-10-19T13:01:00Z", carriedFromDispositionSetId: null }] },
    { findingActions: findingDispositions, evidence: [{ findingId: "hosted-finding", dispositionSetId: nextId,
      disposition: "defer", channelAction: "record-only", performedAt: "2026-10-19T13:01:00Z", carriedFromDispositionSetId: firstId }] },
  ]);
  await assertReviewMapping(result);
});
