/** Publication boundaries retain their native continuation while changing content format. */
import { expect, it } from "vitest";
import { mapReviewRecords } from "../../../../../../src/lib/store/kinds/review/mapping.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../../../../src/lib/store/kinds/review/integration-boundary/schema.js";
import { boundaryLoci } from "../../../../../fixtures/review-boundary.js";
import { mappingBoundaryFixture } from "../../../../../fixtures/review-mapping-boundary.js";
import { assertReviewMapping } from "../../../../../helpers/store/assert-review-mapping.js";
import { IntegrationBoundaryLocusSchema } from "../../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { decodePrePublicationReplayV2, replayTokenFromAction } from "../../../../../../src/scripts/review-gate/policy/pre-publication-replay.js";
import { createReviewHarness } from "../../../../../helpers/store/review-harness.js";
import { createReviewDecisionPort } from "../../../../../../src/lib/store/kinds/review/decision/access.js";
import { resolveNativeExtraPassJudgment } from "../../../../../../src/scripts/review-gate/runtime/native-extra-pass.js";

it("retains a headless frontline ceiling as a call input until its native head is selected", async () => {
  const { input, boundary } = mappingBoundaryFixture();
  const ceilingOverride = { exhaustedPassCount: 2, nextPass: 3 };
  const replay = { candidateId: boundary.candidateId, candidateSubjectDigest: boundary.candidateSubjectDigest,
    lanes: { frontline: { ceilingOverride } } };
  const token = Buffer.from(JSON.stringify(replay)).toString("base64url");
  input.candidates[0]!.boundary = JSON.stringify(IntegrationBoundaryLocusSchema.parse({ ...boundary,
    nextAction: { kind: "continue-pre-publication-review", command: `arc review pre-publication example --resume ${token}`,
      interactionText: "Resume review." } }));
  const mapped = mapReviewRecords(input);
  expect(mapped.records.filter(record => record.reference.kind === "review/decision")).toEqual([]);
  const projected = IntegrationBoundaryLocusV2Schema.parse(JSON.parse(mapped.records.find(
    record => record.reference.kind === "review/integration-boundary")!.contents[0]!));
  const retained = decodePrePublicationReplayV2(replayTokenFromAction(projected.nextAction.command, "example"));
  expect(retained.lanes).toEqual({ frontline: { ceilingOverride } });
  const h = createReviewHarness(), primary = await h.seedMeta("example");
  const decisions = createReviewDecisionPort(h.store, primary.reference.owner);
  const headSha = "a".repeat(40);
  const invocation = { facts: { decisions, readProjectId: async () => input.projectId }, repositoryId: input.projectId,
    subject: { lineage: { kind: "candidate" as const, candidateId: boundary.candidateId },
      headSha, subjectDigest: boundary.candidateSubjectDigest }, lane: "frontline" as const, completedPasses: 2,
    actor: "test-user", now: "2026-11-01T12:00:00Z", policyTarget: { repository: "owner/repo", pullRequest: null, headSha } };
  const resolved = await resolveNativeExtraPassJudgment({ ...invocation, judgment: retained.lanes?.frontline });
  expect(resolved.judgment?.ceilingOverride?.decisionKey).toMatch(/^sha256:/u);
  expect(await decisions.list()).toMatchObject({ status: "complete", records: [{ value: { subject: { headSha } } }] });
  expect(await resolveNativeExtraPassJudgment(invocation)).toEqual(resolved);
});

it.each(boundaryLoci)("maps a native %s boundary to its current strict variant", async (locus) => {
  const { input, boundary } = mappingBoundaryFixture(locus);
  const result = mapReviewRecords(input);
  const boundaries = result.records.filter(({ reference }) => reference.kind === "review/integration-boundary");
  expect(boundaries).toHaveLength(1);
  const content = JSON.parse(boundaries[0]!.contents[0]!);
  const mapped = IntegrationBoundaryLocusV2Schema.parse(content);
  expect(mapped).toMatchObject({ schemaVersion: 2, locus, mode: boundary.mode, workUnit: boundary.workUnit,
    candidateId: boundary.candidateId, candidateSubjectDigest: boundary.candidateSubjectDigest, reservation: boundary.reservation });
  expect(content).not.toHaveProperty("policy");
  expect(content).not.toHaveProperty("standardLaneOwnerVersion");
  expect(result.listing.find(({ source }) => source.endsWith(".boundary.json"))?.records).toContainEqual(boundaries[0]!.reference);
  await assertReviewMapping(result);
});

it("re-encodes a saved token with its call inputs while storing its review judgments separately", async () => {
  const { IntegrationBoundaryLocusSchema } = await import("../../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js");
  const { decodePrePublicationReplayV2, replayTokenFromAction } = await import("../../../../../../src/scripts/review-gate/policy/pre-publication-replay.js");
  const { input, boundary } = mappingBoundaryFixture("candidate-convergence-verification-pending");
  if (boundary.nextAction.kind !== "run-convergence-verification") throw new Error("Expected convergence action");
  const replay = { candidateId: boundary.candidateId, candidateSubjectDigest: boundary.candidateSubjectDigest,
    selfReview: "settled", changeSet: { contentKind: "code-bearing" },
    lanes: { frontline: { scopeMode: "whole-target", invocation: { mode: "skip" }, ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } },
      standard: { additionalPassAuthorization: { headSha: "b".repeat(40), precedingProducerId: "producer-2", completedPasses: 2, nextPass: 3 } } },
    frontlineCeilingHeadSha: "d".repeat(40) };
  const token = Buffer.from(JSON.stringify(replay)).toString("base64url");
  const nextAction = { ...boundary.nextAction, postAttestContinuation: { ...boundary.nextAction.postAttestContinuation,
    nextAction: { kind: "continue-pre-publication-review", command: `arc review pre-publication example --resume ${token}`,
      interactionText: "Resume review." } } };
  input.candidates[0]!.boundary = JSON.stringify(IntegrationBoundaryLocusSchema.parse({ ...boundary, nextAction }));
  const result = mapReviewRecords(input);
  const mapped = IntegrationBoundaryLocusV2Schema.parse(JSON.parse(result.records.find(({ reference }) => reference.kind === "review/integration-boundary")!.contents[0]!));
  if (mapped.nextAction.kind !== "run-convergence-verification") throw new Error("Expected mapped convergence action");
  const command = mapped.nextAction.postAttestContinuation.nextAction.command;
  expect(decodePrePublicationReplayV2(replayTokenFromAction(command, "example"))).toEqual({ candidateId: replay.candidateId,
    candidateSubjectDigest: replay.candidateSubjectDigest, selfReview: replay.selfReview, changeSet: replay.changeSet,
    lanes: { frontline: { scopeMode: "whole-target", invocation: { mode: "skip" } }, standard: {} } });
  expect(result.records.filter(({ reference }) => reference.kind === "review/decision")).toHaveLength(2);
  await assertReviewMapping(result);
});

it("names the exact Candidate and delivery-member terminus decisions it imports", async () => {
  const { IntegrationBoundaryLocusSchema } = await import("../../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js");
  const { createHostedMappingFixture } = await import("../../../../../fixtures/review-mapping.js");
  const { input, boundary } = mappingBoundaryFixture("candidate-publish-ready");
  const { member } = await createHostedMappingFixture("delivery-member");
  const terminus = { schemaVersion: 1, semanticsVersion: "review-terminus/v1", kind: "owner-accepted", lane: "standard",
    acceptedBy: "andrew", completedPasses: 2 };
  input.candidates[0]!.boundary = JSON.stringify(IntegrationBoundaryLocusSchema.parse({ ...boundary, terminus,
    deliveryReviewTermini: [{ vehicle: member, terminus: { ...terminus, completedPasses: 3 } }] }));
  const result = mapReviewRecords(input);
  const decisions = result.records.filter(({ reference }) => reference.kind === "review/decision");
  const candidateKey = decisions.find(({ contents }) => JSON.parse(contents[0]!).subject.lineage.kind === "candidate")!.reference.key;
  const memberKey = decisions.find(({ contents }) => JSON.parse(contents[0]!).subject.lineage.kind === "delivery-member")!.reference.key;
  const mapped = IntegrationBoundaryLocusV2Schema.parse(JSON.parse(result.records.find(({ reference }) => reference.kind === "review/integration-boundary")!.contents[0]!));
  expect(mapped.terminus).toBe(candidateKey);
  expect(mapped.deliveryReviewTermini).toEqual([{ vehicle: member, terminus: memberKey }]);
  await assertReviewMapping(result);
});

it.each(["attested-local", "frontline", "hosted"] as const)("resolves a %s response source without changing its recorded operation", async (kind) => {
  const { input: base, boundary } = mappingBoundaryFixture("candidate-fix-pending");
  const { createLocalMappingFixture, createFrontlineMappingFixture, createHostedMappingFixture } = await import("../../../../../fixtures/review-mapping.js");
  const { approvedRecord } = await import("../../../../../fixtures/review-response-proof.js");
  const { IntegrationBoundaryLocusSchema } = await import("../../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js");
  const { bindReviewSourceReference, parseReviewSourceReference, parseReviewSourceReferenceForOwner } = await import("../../../../../../src/scripts/review-gate/core/review-source-reference.js");
  const { OwnerIdentitySchema } = await import("../../../../../../src/lib/store/identity.js");
  let input: typeof base;
  let producer;
  if (kind === "attested-local") {
    const fixture = await createLocalMappingFixture({ imported: base,
      lineage: { kind: "candidate", candidateId: boundary.candidateId }, vehicle: { kind: "work-unit", identity: "example" } });
    await fixture.conclude();
    input = fixture.input();
    producer = await fixture.resultReader.readResult(fixture.state.operationId);
  } else if (kind === "frontline") {
    const fixture = await createFrontlineMappingFixture();
    input = { ...fixture.input, candidates: base.candidates };
    producer = await fixture.fixture.reader.readResult(fixture.fixture.admission.operationId);
  } else {
    const fixture = await createHostedMappingFixture("delivery-member");
    input = { ...fixture.input(), candidates: base.candidates };
    producer = await fixture.resultReader.readResult(fixture.ended.attemptId);
  }
  const approval = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "minor", disposition: "defer" }]);
  const source = approval.source.kind === "attested-local" ? { kind: approval.source.kind, receiptRef: approval.source.receiptRef }
    : approval.source.kind === "frontline" ? { kind: approval.source.kind, outcomeRef: approval.source.outcomeRef }
    : { kind: approval.source.kind, attemptRef: approval.source.attemptRef };
  const originalRef = "receiptRef" in source ? source.receiptRef : "outcomeRef" in source ? source.outcomeRef : source.attemptRef;
  if (originalRef === undefined) throw new Error("Expected a native producer source reference");
  const token = Buffer.from(JSON.stringify({})).toString("base64url");
  input.candidates[0]!.boundary = JSON.stringify(IntegrationBoundaryLocusSchema.parse({ ...boundary,
    nextAction: { kind: "continue-pre-publication-review", command: "arc review respond -", interactionText: "Respond.",
      responseOperationId: producer.producerId, responseSource: source, resumeCommand: `arc review pre-publication example --resume ${token}` } }));
  const result = mapReviewRecords(input);
  const mapped = IntegrationBoundaryLocusV2Schema.parse(JSON.parse(result.records.find(({ reference }) => reference.kind === "review/integration-boundary")!.contents[0]!));
  if (mapped.nextAction.kind !== "continue-pre-publication-review" || mapped.nextAction.responseSource === undefined) throw new Error("Expected response action");
  const mappedSource = mapped.nextAction.responseSource;
  const mappedRef = mappedSource.kind === "attested-local" ? mappedSource.receiptRef : mappedSource.kind === "frontline" ? mappedSource.outcomeRef : mappedSource.attemptRef;
  const item = input.workItems.find(({ slug }) => slug === "example")!;
  const workItem = OwnerIdentitySchema.parse({ type: "work-item", name: item.slug, uid: item.uid });
  const decoded = parseReviewSourceReferenceForOwner(mappedRef, kind, { repositoryId: input.projectId, workItem });
  expect(decoded).toMatchObject({ repositoryId: input.projectId, workItem });
  expect(mapped.nextAction.responseOperationId).toBe(producer.producerId);
  expect(decoded.operationId).toBe(parseReviewSourceReference(originalRef, kind).operationId);
  const outcome = result.records.find(({ reference, contents }) => reference.kind === "review/outcome"
    && JSON.parse(contents[0]!).attemptId === producer.producerId)!;
  expect(decoded.durableRef).toBe(kind === "hosted" ? producer.producerId : outcome.reference.key);
  await assertReviewMapping(result);
  if (source.kind !== "hosted") {
    const saved = input.candidates[0]!.boundary;
    const original = parseReviewSourceReference(originalRef, kind);
    const mismatched = bindReviewSourceReference({ ...original, durableRef: `${original.durableRef}-other-snapshot` });
    const responseSource = source.kind === "attested-local" ? { ...source, receiptRef: mismatched }
      : { ...source, outcomeRef: mismatched };
    const changed = IntegrationBoundaryLocusSchema.parse(JSON.parse(saved!));
    input.candidates[0]!.boundary = JSON.stringify({ ...changed, nextAction: { ...changed.nextAction, responseSource } });
    expect(() => mapReviewRecords(input)).toThrow(/response source.*snapshot/iu);
    input.candidates[0]!.boundary = saved;
    await assertReviewMapping(mapReviewRecords(input));
  }
});

it.each(["policy", "resume"] as const)("folds a native %s review boundary into the version-two resume variant", async (variant) => {
  const { IntegrationBoundaryLocusSchema, projectCandidateReviewResumeBoundary } = await import("../../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js");
  const { responsePolicyRequestFixture } = await import("../../../../../fixtures/review-response-policy.js");
  const { firstReviewNextPassContext } = await import("../../../../../fixtures/review-next-pass.js");
  const { resolveReviewPolicy } = await import("../../../../../../src/scripts/review-gate/policy/review-policy-driver.js");
  const { input, boundary } = mappingBoundaryFixture("hosted-review-pending");
  const continuation = { reviewedHead: "c".repeat(40), nextAction: boundary.nextAction,
    projectionDisposition: "keep-staged-until-publication" as const };
  if (continuation.nextAction.kind !== "continue-pre-publication-review") throw new Error("Expected native continuation");
  const source = variant === "resume" ? projectCandidateReviewResumeBoundary({ workUnit: "example", candidateId: boundary.candidateId,
    candidateSubjectDigest: boundary.candidateSubjectDigest!, reservation: boundary.reservation,
    postAttestContinuation: { ...continuation, nextAction: continuation.nextAction } })
    : IntegrationBoundaryLocusSchema.parse({ ...boundary, locus: "candidate-review-pending", reservation: null,
      policy: resolveReviewPolicy({ ...responsePolicyRequestFixture({ headSha: "c".repeat(40) }), sources: ["delegated-agent"], maxPasses: 2,
        completedPasses: 0, attempts: [], nextPassContext: firstReviewNextPassContext }) });
  input.candidates[0]!.boundary = JSON.stringify(source);
  const result = mapReviewRecords(input);
  const content = JSON.parse(result.records.find(({ reference }) => reference.kind === "review/integration-boundary")!.contents[0]!);
  const mapped = IntegrationBoundaryLocusV2Schema.parse(content);
  expect(mapped).toMatchObject({ locus: "candidate-review-pending", nextAction: { kind: "continue-pre-publication-review" }, reservation: source.reservation });
  expect(content).not.toHaveProperty("policy");
  if (variant === "resume") {
    expect(content.postAttestContinuation).toMatchObject({ reviewedHead: continuation.reviewedHead,
      nextAction: { kind: "continue-pre-publication-review" } });
    expect(content.postAttestContinuation).not.toHaveProperty("projectionDisposition");
  }
  await assertReviewMapping(result);
});
