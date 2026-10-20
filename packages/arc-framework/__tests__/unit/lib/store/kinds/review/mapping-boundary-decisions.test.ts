/** Boundary decisions preserve the exact subject the old record bound. */
import { expect, it } from "vitest";
import { createReviewTarget } from "../../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { canonicalDigest } from "../../../../../../src/lib/kernel/index.js";
import { mapReviewRecords } from "../../../../../../src/lib/store/kinds/review/mapping.js";
import { ReviewDecisionSchema } from "../../../../../../src/lib/store/kinds/review/decision/schema.js";
import { reviewDecisionKey } from "../../../../../../src/lib/store/kinds/review/decision/key.js";
import { IntegrationBoundaryLocusSchema, projectCandidateReviewBoundary } from "../../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { candidateRecordFixture } from "../../../../../fixtures/review-candidate.js";
import { mappingErrand } from "../../../../../fixtures/review-mapping.js";
import { assertReviewMapping } from "../../../../../helpers/store/assert-review-mapping.js";
import type { ReviewMappingInput } from "../../../../../../src/lib/store/kinds/review/mapping-types.js";

function boundaryInput() {
  const { record: original } = candidateRecordFixture();
  const record = { ...original, transitions: [], lineageAttestations: [] };
  const boundary = projectCandidateReviewBoundary({ workUnit: "example", candidateId: record.attestation.candidateId,
    candidateSubjectDigest: record.subject.subjectDigest });
  const input: ReviewMappingInput = { projectId: "repo-1", gate: [],
    workItems: [{ kind: "work-unit", slug: "example", uid: mappingErrand.uid, live: true }],
    candidates: [{ workItem: mappingErrand.uid, versions: [{ commit: "a".repeat(40), content: JSON.stringify(record) }], boundary: null }] };
  return { input, record, boundary };
}

async function chainBoundaryInput(ancestorResult: "clean" | "findings" = "clean") {
  const { createCandidateAttestation } = await import("../../../../../../src/lib/work-unit/candidate-attestation.js");
  const { createLocalMappingFixture } = await import("../../../../../fixtures/review-mapping.js");
  const { input, record: older } = boundaryInput();
  const current = { ...older, attestation: createCandidateAttestation({ ...older.attestation, subject: older.subject,
    baseRevision: "b".repeat(40), supersedes: older.attestation.candidateId }) };
  input.candidates[0]!.versions.push({ commit: "b".repeat(40), content: JSON.stringify(current) });
  const fixtures = [];
  for (const candidate of [older, current]) {
    const fixture = await createLocalMappingFixture({ imported: input,
      lineage: { kind: "candidate", candidateId: candidate.attestation.candidateId },
      vehicle: { kind: "work-unit", identity: "example" } });
    await fixture.conclude(candidate === older ? ancestorResult : "clean");
    fixtures.push(fixture);
  }
  input.gate = fixtures.flatMap((fixture) => fixture.input().gate.filter(({ path }) => !path.endsWith("receipts-v2.json")));
  input.gate.push({ path: "arc/review-gate/evidence/receipts-v2.json", bytes: new TextEncoder().encode(JSON.stringify({
    schemaVersion: 2, semanticsVersion: "review-gate/v2", repositoryId: "repo-1", ledgerVersion: 2,
    receipts: fixtures.flatMap(({ receipts }) => receipts) })) });
  const boundary = projectCandidateReviewBoundary({ workUnit: "example", candidateId: current.attestation.candidateId,
    candidateSubjectDigest: current.subject.subjectDigest });
  return { input, current, boundary, olderFixture: fixtures[0]! };
}

it("maps a Candidate terminus on the boundary's recorded subject, including an unstored digest", async () => {
  const { input, boundary } = boundaryInput();
  const digest = canonicalDigest({ equivalentSubject: 1 });
  const terminus = { schemaVersion: 1, semanticsVersion: "review-terminus/v1", kind: "owner-accepted", lane: "standard",
    acceptedBy: "andrew", completedPasses: 2 };
  input.candidates[0]!.boundary = JSON.stringify(IntegrationBoundaryLocusSchema.parse({ ...boundary,
    candidateSubjectDigest: digest, terminus }));
  const result = mapReviewRecords(input);
  const decisions = result.records.filter(({ reference }) => reference.kind === "review/decision");
  expect(decisions).toHaveLength(1);
  const expected = ReviewDecisionSchema.parse({ schemaVersion: 1,
    subject: { lineage: { kind: "candidate", candidateId: boundary.candidateId }, headSha: null, subjectDigest: digest },
    lane: "standard", choice: { kind: "terminus" }, decidedBy: "andrew", decidedAt: null, basis: { passCount: 2 } });
  expect(JSON.parse(decisions[0]!.contents[0]!)).toEqual(expected);
  expect(decisions[0]!.reference.key).toBe(reviewDecisionKey(expected));
  await assertReviewMapping(result);
});

it("maps each recorded member terminus on its exact member vehicle", async () => {
  const { createHostedMappingFixture } = await import("../../../../../fixtures/review-mapping.js");
  const { input, boundary } = boundaryInput();
  const { member } = await createHostedMappingFixture("delivery-member");
  input.candidates[0]!.boundary = JSON.stringify(IntegrationBoundaryLocusSchema.parse({ ...boundary,
    deliveryReviewTermini: [{ vehicle: member, terminus: { schemaVersion: 1, semanticsVersion: "review-terminus/v1",
      kind: "owner-accepted", lane: "standard", acceptedBy: "andrew", completedPasses: 3 } }] }));
  const result = mapReviewRecords(input);
  const decisions = result.records.filter(({ reference }) => reference.kind === "review/decision");
  expect(decisions).toHaveLength(1);
  const { head, ...lineage } = member;
  expect(JSON.parse(decisions[0]!.contents[0]!)).toEqual({ schemaVersion: 1,
    subject: { lineage, headSha: head, subjectDigest: null }, lane: "standard", choice: { kind: "terminus" },
    decidedBy: "andrew", decidedAt: null, basis: { passCount: 3 } });
  await assertReviewMapping(result);
});

it("imports a replay's additional logical pass with its recorded head and producer", async () => {
  const { input, boundary } = boundaryInput();
  const lanes = { standard: { additionalPassAuthorization: { headSha: "b".repeat(40), precedingProducerId: "producer-2",
    completedPasses: 2, nextPass: 3 } } };
  const scopeJudgmentTarget = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: input.projectId, baseRef: "main", diffBaseSha: "a".repeat(40), diffBaseTree: "c".repeat(40),
    headSha: "b".repeat(40), headTree: "d".repeat(40) });
  const replay = { candidateId: boundary.candidateId, candidateSubjectDigest: boundary.candidateSubjectDigest, lanes, scopeJudgmentTarget };
  const token = Buffer.from(JSON.stringify(replay)).toString("base64url");
  input.candidates[0]!.boundary = JSON.stringify(IntegrationBoundaryLocusSchema.parse({ ...boundary,
    nextAction: { kind: "continue-pre-publication-review", command: `arc review pre-publication example --resume ${token}`,
      interactionText: "Resume review." } }));
  const result = mapReviewRecords(input);
  const decisions = result.records.filter(({ reference }) => reference.kind === "review/decision");
  expect(decisions).toHaveLength(1);
  expect(JSON.parse(decisions[0]!.contents[0]!)).toEqual({ schemaVersion: 1,
    subject: { lineage: { kind: "candidate", candidateId: boundary.candidateId }, headSha: "b".repeat(40),
      subjectDigest: boundary.candidateSubjectDigest }, lane: "standard", choice: { kind: "extra-pass", passCount: 2,
      precondition: { kind: "additional", precedingProducerId: "producer-2", targetBinding: { kind: "call-target" } } }, decidedBy: null, decidedAt: null, basis: null });
  await assertReviewMapping(result);
});

it.each(["frontline", "standard"] as const)("imports a %s ceiling with only its recorded subject coordinates", async (lane) => {
  const { input, boundary } = boundaryInput();
  const replay = { lanes: { [lane]: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } } },
    frontlineCeilingHeadSha: "d".repeat(40) };
  const token = Buffer.from(JSON.stringify(replay)).toString("base64url");
  input.candidates[0]!.boundary = JSON.stringify(IntegrationBoundaryLocusSchema.parse({ ...boundary,
    nextAction: { kind: "continue-pre-publication-review", command: `arc review pre-publication example --resume ${token}`,
      interactionText: "Resume review." } }));
  const result = mapReviewRecords(input);
  const decisions = result.records.filter(({ reference }) => reference.kind === "review/decision");
  expect(decisions).toHaveLength(1);
  expect(JSON.parse(decisions[0]!.contents[0]!)).toEqual({ schemaVersion: 1,
    subject: { lineage: { kind: "candidate", candidateId: boundary.candidateId },
      headSha: lane === "frontline" ? replay.frontlineCeilingHeadSha : null, subjectDigest: null },
    lane, choice: { kind: "extra-pass", passCount: 2, precondition: { kind: "ceiling", targetBinding: { kind: "call-target" } } },
    decidedBy: null, decidedAt: null, basis: null });
  await assertReviewMapping(result);
});

it("leaves a replay ceiling covered by a conditional authorization to its original decision", async () => {
  const { input, boundary } = boundaryInput();
  const replay = { lanes: { standard: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3,
    conditionalPassAuthorizationId: canonicalDigest({ authorization: 1 }) } } } };
  const token = Buffer.from(JSON.stringify(replay)).toString("base64url");
  input.candidates[0]!.boundary = JSON.stringify(IntegrationBoundaryLocusSchema.parse({ ...boundary,
    nextAction: { kind: "continue-pre-publication-review", command: `arc review pre-publication example --resume ${token}`,
      interactionText: "Resume review." } }));
  const result = mapReviewRecords(input);
  expect(result.records.filter(({ reference }) => reference.kind === "review/decision")).toEqual([]);
  await assertReviewMapping(result);
});

it.each([false, true])("counts a replay terminus across the Candidate chain unless one is stored: %s", async (stored) => {
  const { input, current, boundary } = await chainBoundaryInput();
  const token = Buffer.from(JSON.stringify({ lanes: { standard: { terminus: { mode: "owner-accepted" } } } })).toString("base64url");
  input.candidates[0]!.boundary = JSON.stringify(IntegrationBoundaryLocusSchema.parse({ ...boundary,
    ...(stored ? { terminus: { schemaVersion: 1, semanticsVersion: "review-terminus/v1", kind: "owner-accepted",
      lane: "standard", acceptedBy: "andrew", completedPasses: 7 } } : {}),
    nextAction: { kind: "continue-pre-publication-review", command: `arc review pre-publication example --resume ${token}`,
      interactionText: "Resume review." } }));
  const result = mapReviewRecords(input);
  const decisions = result.records.filter(({ reference }) => reference.kind === "review/decision");
  expect(decisions).toHaveLength(1);
  expect(JSON.parse(decisions[0]!.contents[0]!)).toEqual({ schemaVersion: 1,
    subject: { lineage: { kind: "candidate", candidateId: current.attestation.candidateId }, headSha: null,
      subjectDigest: current.subject.subjectDigest }, lane: "standard", choice: { kind: "terminus" },
    decidedBy: stored ? "andrew" : null, decidedAt: null, basis: { passCount: stored ? 7 : 2 } });
  await assertReviewMapping(result);
});

it.each([false, true])("counts ancestral findings only when their mapped evidence settles them: %s", async (settled) => {
  const { input, boundary, olderFixture } = await chainBoundaryInput("findings");
  if (settled) {
    const { approvedRecord } = await import("../../../../../fixtures/review-response-proof.js");
    const record = approvedRecord(await olderFixture.resultReader.readResult(olderFixture.state.operationId), [
      { sourceVerification: "verified", verifiedSeverity: "major", disposition: "defer" }]);
    input.gate.push({ path: "arc/review-gate/evidence/disposition-ancestor.json",
      bytes: new TextEncoder().encode(JSON.stringify(record)) });
  }
  const token = Buffer.from(JSON.stringify({ lanes: { standard: { terminus: { mode: "owner-accepted" } } } })).toString("base64url");
  input.candidates[0]!.boundary = JSON.stringify(IntegrationBoundaryLocusSchema.parse({ ...boundary,
    nextAction: { kind: "continue-pre-publication-review", command: `arc review pre-publication example --resume ${token}`,
      interactionText: "Resume review." } }));
  const result = mapReviewRecords(input);
  const decision = result.records.find(({ reference }) => reference.kind === "review/decision")!;
  expect(JSON.parse(decision.contents[0]!)).toMatchObject({ choice: { kind: "terminus" }, basis: { passCount: settled ? 2 : 1 } });
  await assertReviewMapping(result);
});

it("refuses replay lane judgments that their original authority rejects", () => {
  const { input, boundary } = boundaryInput();
  const token = Buffer.from(JSON.stringify({ lanes: { standard: { invocation: { mode: "skip" } } } })).toString("base64url");
  input.candidates[0]!.boundary = JSON.stringify(IntegrationBoundaryLocusSchema.parse({ ...boundary,
    nextAction: { kind: "continue-pre-publication-review", command: `arc review pre-publication example --resume ${token}`,
      interactionText: "Resume review." } }));
  expect(() => mapReviewRecords(input)).toThrow("frontline invocation override cannot be applied to the standard lane");
});

it.each(["response", "post-attestation", "both", "convergence"])("recovers saved replay choices once from %s", async (location) => {
  const { input, boundary } = boundaryInput();
  const { createLocalMappingFixture } = await import("../../../../../fixtures/review-mapping.js");
  const fixture = await createLocalMappingFixture({ imported: input,
    lineage: { kind: "candidate", candidateId: boundary.candidateId }, vehicle: { kind: "work-unit", identity: "example" } });
  await fixture.conclude();
  input.gate = fixture.input().gate;
  const producer = await fixture.resultReader.readResult(fixture.state.operationId);
  if (producer.kind !== "attested-local") throw new Error("Expected native local response");
  const token = Buffer.from(JSON.stringify({ lanes: { standard: { additionalPassAuthorization: {
    headSha: "b".repeat(40), precedingProducerId: "producer-2", completedPasses: 2, nextPass: 3 } } } })).toString("base64url");
  const command = `arc review pre-publication example --resume ${token}`;
  const nextAction = { kind: "continue-pre-publication-review", command, interactionText: "Resume review." } as const;
  const { bindReviewSourceReference } = await import("../../../../../../src/scripts/review-gate/core/review-source-reference.js");
  const response = { kind: "continue-pre-publication-review", command: "arc review respond -", interactionText: "Respond.",
    resumeCommand: command, responseOperationId: producer.producerId, responseSource: { kind: "attested-local",
      receiptRef: bindReviewSourceReference({ kind: "attested-local", operationId: producer.producerId, durableRef: producer.receiptRef }) } };
  const continuation = { reviewedHead: "b".repeat(40), nextAction, projectionDisposition: "keep-staged-until-publication" } as const;
  const { createRunConvergenceVerificationAction } = await import("../../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js");
  input.candidates[0]!.boundary = JSON.stringify(IntegrationBoundaryLocusSchema.parse(location === "convergence"
    ? { ...boundary, locus: "candidate-convergence-verification-pending",
        nextAction: createRunConvergenceVerificationAction("example", "full", continuation) }
    : { ...boundary, nextAction: location === "post-attestation" ? { ...nextAction, command: "arc review pre-publication example" } : response,
        ...(location === "response" ? {} : { postAttestContinuation: continuation }) }));
  const result = mapReviewRecords(input);
  const decisions = result.records.filter(({ reference }) => reference.kind === "review/decision");
  expect(decisions).toHaveLength(1);
  expect(JSON.parse(decisions[0]!.contents[0]!)).toMatchObject({ choice: { kind: "extra-pass", passCount: 2,
    precondition: { kind: "additional", precedingProducerId: "producer-2", targetBinding: { kind: "call-target" } } } });
  const boundaryRecord = result.records.find(({ reference }) => reference.kind === "review/integration-boundary")!;
  expect(result.listing.find(({ records }) => records.some((reference) => reference.kind === "review/integration-boundary"))?.records)
    .toEqual([decisions[0]!.reference, boundaryRecord.reference]);
  await assertReviewMapping(result);
});
