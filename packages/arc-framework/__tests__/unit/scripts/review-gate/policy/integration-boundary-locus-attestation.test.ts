/** Exact public singleton authority conserved during convergence attestation. */

import { describe, expect, it } from "vitest";

import {
  CandidatePublishReadyBoundarySchema,
  createStandardReviewReservation,
  projectCandidateReviewBoundary,
  projectPublicationBoundary,
  recoverAttestedSingletonPublicationBoundary,
  type IntegrationBoundaryLocus,
} from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";

const workUnit = "example";
const candidateId = `sha256:${"a".repeat(64)}`;
const candidateSubjectDigest = `sha256:${"b".repeat(64)}`;
const terminus = {
  schemaVersion: 1 as const,
  semanticsVersion: "review-terminus/v1" as const,
  kind: "owner-accepted" as const,
  lane: "standard" as const,
  acceptedBy: "andrew",
  completedPasses: 2,
};
const obligation = {
  obligation: "required" as const,
  reasons: ["sensitive-change-set"],
  rubricVersion: "standard-review/v1",
  rubricDigest: `sha256:${"e".repeat(64)}` as const,
  retrigger: "full-final" as const,
  count: 1 as const,
};
const reservation = createStandardReviewReservation({
  candidateId, sourceId: "codex-pr", repository: "owner/repository", headSha: "1".repeat(40), obligation,
});

function publication(changeRequest: { repository: string; pullRequest: number } | null = null) {
  return projectPublicationBoundary({
    workUnit, branch: "feat/example", candidateId, candidateSubjectDigest, reservation, terminus,
    standardLaneOwnerVersion: 7, changeRequest,
  });
}

function recover(stored: IntegrationBoundaryLocus | null, overrides: Partial<
  Parameters<typeof recoverAttestedSingletonPublicationBoundary>[0]
> = {}) {
  return recoverAttestedSingletonPublicationBoundary({
    stored, workUnit, candidateId, candidateSubjectDigest, integrating: true, ...overrides,
  });
}

describe("attested singleton publication conservation", () => {
  it("retains the complete published boundary, reservation, Owner verdict and owner version", () => {
    const stored = publication();
    expect(stored).toMatchObject({ locus: "publication-pending", standardLaneOwnerVersion: 7 });
    expect(recover(stored)).toEqual(stored);
  });

  it("retains a hosted continuation without converting it to private review", () => {
    const stored = publication({ repository: "owner/repository", pullRequest: 41 });
    expect(stored.locus).toBe("hosted-review-pending");
    expect(recover(stored)).toEqual(stored);
  });

  it("retains published progress without adding a review verdict or reservation", () => {
    const stored = projectPublicationBoundary({
      workUnit, branch: "feat/example", candidateId, candidateSubjectDigest,
      reservation: null, terminus: null, changeRequest: null,
    });
    expect(recover(stored)).toEqual(stored);
  });

  it.each([
    ["private or withdrawn lifecycle", { integrating: false }],
    ["different work unit", { workUnit: "other" }],
    ["different Candidate", { candidateId: `sha256:${"c".repeat(64)}` }],
    ["different subject", { candidateSubjectDigest: `sha256:${"d".repeat(64)}` }],
  ] as const)("does not adopt authority for a %s", (_label, overrides) => {
    expect(recover(publication(), overrides)).toBeNull();
  });

  it("does not manufacture publication when no boundary exists", () => {
    expect(recover(null)).toBeNull();
  });

  it("does not treat an unbound subject as exact public authority", () => {
    const stored = projectPublicationBoundary({
      workUnit, branch: "feat/example", candidateId, reservation, changeRequest: null,
    });
    expect(recover(stored)).toBeNull();
  });

  it("leaves private Candidate review to its existing continuation", () => {
    expect(recover(projectCandidateReviewBoundary({ workUnit, candidateId, candidateSubjectDigest }))).toBeNull();
  });

  it("does not promote private publication readiness to public authority", () => {
    const stored = CandidatePublishReadyBoundarySchema.parse({
      ...projectCandidateReviewBoundary({ workUnit, candidateId, candidateSubjectDigest }),
      locus: "candidate-publish-ready",
      nextAction: {
        kind: "publish-candidate", command: "arc publish example", interactionText: "Publish the Candidate.",
      },
      reservation,
    });
    expect(recover(stored)).toBeNull();
  });

  it("leaves a carried delivery reservation to delivery renewal", () => {
    const stored = projectPublicationBoundary({
      workUnit, branch: "feat/example", candidateId, candidateSubjectDigest,
      reservation: createStandardReviewReservation({
        candidateId, sourceId: "codex-pr", obligation,
        target: {
          kind: "delivery", repository: "owner/repository", workUnitId: workUnit,
          planId: "11111111-1111-4111-8111-111111111111",
        },
      }),
      changeRequest: null,
    });
    expect(stored.locus).toBe("publication-pending");
    expect(recover(stored)).toBeNull();
  });
});
