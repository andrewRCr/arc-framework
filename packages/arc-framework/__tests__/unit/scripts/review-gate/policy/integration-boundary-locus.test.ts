/** Candidate review-boundary projection tests. */

import { describe, expect, it } from "vitest";

import { CandidateReviewResponseEvidenceV1Schema } from
  "../../../../../src/lib/work-unit/candidate-attestation.js";
import {
  createStandardReviewReservation,
  projectCandidateReviewResumeBoundary,
  projectPublicationBoundary,
  rebindSingletonPublicationResponseBoundary,
  recoverAttestedOwnerTerminusBoundary,
} from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";

const SOURCE_CANDIDATE: `sha256:${string}` = `sha256:${"a".repeat(64)}`;
const NEW_CANDIDATE: `sha256:${string}` = `sha256:${"b".repeat(64)}`;
const SOURCE_SUBJECT: `sha256:${string}` = `sha256:${"c".repeat(64)}`;
const MOVED_SUBJECT: `sha256:${string}` = `sha256:${"d".repeat(64)}`;
const TERMINUS = {
  schemaVersion: 1 as const,
  semanticsVersion: "review-terminus/v1" as const,
  kind: "owner-accepted" as const,
  lane: "standard" as const,
  acceptedBy: "andrew",
  completedPasses: 2,
};

function reviewResponse() {
  return CandidateReviewResponseEvidenceV1Schema.parse({
    transitionKind: "review-response",
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    candidateId: SOURCE_CANDIDATE,
    responseId: `sha256:${"e".repeat(64)}`,
    oldTarget: { revision: "a".repeat(40), subject: { entries: [], subjectDigest: SOURCE_SUBJECT } },
    newTarget: { revision: "b".repeat(40), subject: { entries: [], subjectDigest: MOVED_SUBJECT } },
    dispositionId: `sha256:${"f".repeat(64)}`,
    approvedBy: "andrew",
    appliedBy: "andrew",
    applicability: "focused",
    verificationEvidenceRefs: ["verification://review-fix"],
    implementationChanged: true,
  });
}

function singletonPublicationBoundary() {
  return projectPublicationBoundary({
    workUnit: "example",
    branch: "feat/example",
    candidateId: SOURCE_CANDIDATE,
    candidateSubjectDigest: SOURCE_SUBJECT,
    reservation: createStandardReviewReservation({
      candidateId: SOURCE_CANDIDATE,
      sourceId: "coderabbit-pr",
      repository: "owner/repository",
      headSha: "a".repeat(40),
      obligation: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"e".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
    }),
    changeRequest: { repository: "owner/repository", pullRequest: 41 },
  });
}

describe("rebindSingletonPublicationResponseBoundary", () => {
  it("carries the reservation and public locus to the reviewed subject, including replay", () => {
    const stored = singletonPublicationBoundary();
    const response = reviewResponse();
    const rebound = rebindSingletonPublicationResponseBoundary({
      stored, workUnit: "example", response, requirePublished: true,
    });
    expect(rebound).toEqual({ ...stored, candidateSubjectDigest: MOVED_SUBJECT });
    expect(rebindSingletonPublicationResponseBoundary({
      stored: rebound, workUnit: "example", response, requirePublished: true,
    })).toBe(rebound);
  });

  it("refuses a different Candidate or stale publication subject", () => {
    const stored = singletonPublicationBoundary();
    expect(() => rebindSingletonPublicationResponseBoundary({
      stored: { ...stored, candidateId: NEW_CANDIDATE },
      workUnit: "example", response: reviewResponse(), requirePublished: true,
    })).toThrow("another Candidate");
    expect(() => rebindSingletonPublicationResponseBoundary({
      stored: { ...stored, candidateSubjectDigest: NEW_CANDIDATE },
      workUnit: "example", response: reviewResponse(), requirePublished: true,
    })).toThrow("does not match the reviewed Candidate subject");
  });

  it("requires a public singleton boundary for a hosted response", () => {
    expect(() => rebindSingletonPublicationResponseBoundary({
      stored: null, workUnit: "example", response: reviewResponse(), requirePublished: true,
    })).toThrow("no published Candidate boundary");
  });
});

function restoredAcceptedBoundary() {
  return projectPublicationBoundary({
    workUnit: "example",
    branch: "feat/example",
    candidateId: SOURCE_CANDIDATE,
    candidateSubjectDigest: SOURCE_SUBJECT,
    reservation: null,
    terminus: TERMINUS,
    changeRequest: null,
  });
}

describe("recoverAttestedOwnerTerminusBoundary", () => {
  it("rebinds a restored accepted publication boundary after non-semantic subject movement", () => {
    const source = restoredAcceptedBoundary();

    expect(recoverAttestedOwnerTerminusBoundary({
      stored: source,
      workUnit: "example",
      candidateId: SOURCE_CANDIDATE,
      candidateSubjectDigest: MOVED_SUBJECT,
      repairCurrent: true,
    })).toEqual({
      ...source,
      candidateSubjectDigest: MOVED_SUBJECT,
    });
  });

  it("drops the prior terminus for a different Candidate identity", () => {
    expect(recoverAttestedOwnerTerminusBoundary({
      stored: restoredAcceptedBoundary(),
      workUnit: "example",
      candidateId: NEW_CANDIDATE,
      candidateSubjectDigest: MOVED_SUBJECT,
      repairCurrent: true,
    })).toBeNull();
  });

  it("drops the prior terminus when attestation did not repair the current Candidate", () => {
    expect(recoverAttestedOwnerTerminusBoundary({
      stored: restoredAcceptedBoundary(),
      workUnit: "example",
      candidateId: SOURCE_CANDIDATE,
      candidateSubjectDigest: MOVED_SUBJECT,
      repairCurrent: false,
    })).toBeNull();
  });

  it("does not rebind a public boundary without an Owner terminus", () => {
    expect(recoverAttestedOwnerTerminusBoundary({
      stored: projectPublicationBoundary({
        workUnit: "example",
        branch: "feat/example",
        candidateId: SOURCE_CANDIDATE,
        candidateSubjectDigest: SOURCE_SUBJECT,
        reservation: null,
        changeRequest: null,
      }),
      workUnit: "example",
      candidateId: SOURCE_CANDIDATE,
      candidateSubjectDigest: MOVED_SUBJECT,
      repairCurrent: true,
    })).toBeNull();
  });

  it("does not carry a terminus from a boundary that has not earned a public locus", () => {
    expect(recoverAttestedOwnerTerminusBoundary({
      stored: projectCandidateReviewResumeBoundary({
        workUnit: "example",
        candidateId: SOURCE_CANDIDATE,
        candidateSubjectDigest: SOURCE_SUBJECT,
        reservation: null,
        terminus: TERMINUS,
        postAttestContinuation: {
          reviewedHead: "a".repeat(40),
          nextAction: {
            kind: "continue-pre-publication-review",
            command: "arc review pre-publication example",
            interactionText: "Resume pre-publication review.",
          },
          projectionDisposition: "keep-staged-until-publication",
        },
      }),
      workUnit: "example",
      candidateId: SOURCE_CANDIDATE,
      candidateSubjectDigest: MOVED_SUBJECT,
      repairCurrent: true,
    })).toBeNull();
  });
});
