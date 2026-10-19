/** Recovery retains the stored boundary's format and portable authority names. */
import { expect, it } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { projectPublicationBoundary, recoverAttestedOwnerTerminusBoundary, recoverAttestedSingletonPublicationBoundary,
  rebindSingletonPublicationResponseBoundary, projectCorrectiveDeliveryStatusBoundary } from
  "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { candidateRecordFixture } from "../../../../fixtures/review-candidate.js";
import { boundaryV1Fixture } from "../../../../fixtures/review-boundary.js";
import { deliveryStackPlanForWorkUnitFixture } from "../../../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../../../fixtures/delivery-state.js";
import { projectDeliveryPublicReviewContinuation } from "../../../../../src/lib/delivery/public-review-continuation.js";

const coordinates = { workUnit: "example", branch: "feat/example", candidateId: canonicalDigest({ candidate: 1 }),
  candidateSubjectDigest: canonicalDigest({ subject: 1 }) };
const stored = projectPublicationBoundary({ ...coordinates, reservation: null, changeRequest: null,
  terminus: canonicalDigest({ decision: 1 }), readinessBinding: canonicalDigest({ readiness: 1 }) }, 2);
const subjectDigest = canonicalDigest({ subject: 2 });

it("carries the native Owner terminus reference across a recognized subject repair", () => {
  expect(recoverAttestedOwnerTerminusBoundary({ ...coordinates, stored, repairCurrent: true,
    candidateSubjectDigest: subjectDigest })).toEqual({ ...stored, candidateSubjectDigest: subjectDigest });
});

it("carries a native delivery reservation onto the exact renewed Candidate", () => {
  const plan = deliveryStackPlanForWorkUnitFixture("example", "11111111-1111-4111-8111-111111111111");
  const initial = deliveryStateFixture(plan);
  const state = { ...initial, members: initial.members.map((member, index) => ({ ...member,
    changeRequest: { providerId: "github", changeRequestId: String(101 + index) } })) };
  const projected = projectDeliveryPublicReviewContinuation({ plan, state, stateRevision: 7 });
  if (projected.status !== "projected") throw new Error("Expected public delivery evidence");
  const source = projectPublicationBoundary({ ...coordinates, reservation: boundaryV1Fixture("delivery-status-required").reservation,
    changeRequest: { repository: "owner/repo", pullRequest: 42 }, readinessBinding: null }, 2);
  const candidateId = canonicalDigest({ candidate: 2 });
  const boundary = projectCorrectiveDeliveryStatusBoundary({ ...coordinates, candidateId, candidateSubjectDigest: subjectDigest,
    supersedesCandidateId: source.candidateId, sourceBoundary: source, deliveryContinuation: projected.continuation });
  expect(boundary).toMatchObject({ schemaVersion: 2, locus: "delivery-status-required", candidateId,
    candidateSubjectDigest: subjectDigest, reservation: source.reservation, deliveryContinuation: projected.continuation });
  expect(boundary).not.toHaveProperty("policy");
});

it("rebinds a native singleton to its verified response and replays it", () => {
  const { response } = candidateRecordFixture();
  const original = projectPublicationBoundary({ ...coordinates, candidateId: response.candidateId,
    candidateSubjectDigest: response.oldTarget.subject.subjectDigest, reservation: null, changeRequest: null,
    readinessBinding: canonicalDigest({ readiness: 2 }) }, 2);
  const rebound = rebindSingletonPublicationResponseBoundary({ stored: original, workUnit: "example", response, requirePublished: true });
  expect(rebound).toEqual({ ...original, candidateSubjectDigest: response.newTarget.subject.subjectDigest });
  expect(rebindSingletonPublicationResponseBoundary({ stored: rebound, workUnit: "example", response, requirePublished: true })).toBe(rebound);
});

it("keeps native singleton publication and readiness after recognized attestation", () => {
  expect(recoverAttestedSingletonPublicationBoundary({ ...coordinates, stored, integrating: true, repairCurrent: true,
    candidateSubjectDigest: subjectDigest })).toEqual({ ...stored, candidateSubjectDigest: subjectDigest });
});
