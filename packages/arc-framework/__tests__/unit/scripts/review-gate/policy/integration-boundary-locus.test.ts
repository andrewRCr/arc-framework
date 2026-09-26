/** Candidate review-boundary projection tests. */

import { describe, expect, it } from "vitest";

import {
  projectCandidateReviewResumeBoundary,
  projectPublicationBoundary,
  recoverAttestedOwnerTerminusBoundary,
} from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";

const SOURCE_CANDIDATE = `sha256:${"a".repeat(64)}`;
const NEW_CANDIDATE = `sha256:${"b".repeat(64)}`;
const SOURCE_SUBJECT = `sha256:${"c".repeat(64)}`;
const MOVED_SUBJECT = `sha256:${"d".repeat(64)}`;
const TERMINUS = {
  schemaVersion: 1 as const,
  semanticsVersion: "review-terminus/v1" as const,
  kind: "owner-accepted" as const,
  lane: "standard" as const,
  acceptedBy: "andrew",
  completedPasses: 2,
};

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
