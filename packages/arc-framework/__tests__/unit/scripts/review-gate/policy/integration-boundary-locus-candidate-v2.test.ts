/** Candidate entry and re-entry projections preserve their selected boundary format. */
import { expect, it } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { projectCandidateReviewBoundary, projectCandidateFixResumeBoundary, projectCandidateReviewResumeBoundary,
  createRunConvergenceVerificationAction } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { boundaryContinuation } from "../../../../fixtures/review-boundary.js";

const coordinates = { workUnit: "example", candidateId: canonicalDigest({ candidate: 1 }), candidateSubjectDigest: canonicalDigest({ subject: 1 }) };

it("projects the native Candidate's exact self-review entry", () => {
  const boundary = projectCandidateReviewBoundary(coordinates, 2);
  expect(boundary).toMatchObject({ ...coordinates, schemaVersion: 2, locus: "candidate-review-pending",
    nextAction: { kind: "run-self-review", command: "arc review pre-publication example" }, reservation: null, terminus: null });
  expect(boundary).not.toHaveProperty("policy");
});

it.each([null, canonicalDigest({ decision: 1 })])("resumes native convergence with its decision reference %s", (terminus) => {
  const action = createRunConvergenceVerificationAction("example", "full", boundaryContinuation, 2);
  const boundary = projectCandidateReviewResumeBoundary({ ...coordinates, reservation: null, terminus,
    postAttestContinuation: action.postAttestContinuation }, 2);
  expect(boundary).toMatchObject({ ...coordinates, schemaVersion: 2, locus: "candidate-review-pending", terminus,
    nextAction: action.postAttestContinuation.nextAction, postAttestContinuation: action.postAttestContinuation });
  expect(boundary).not.toHaveProperty("policy");
  expect(boundary).not.toHaveProperty("postAttestContinuation.projectionDisposition");
});

it("keeps an approved native Candidate fix resumable", () => {
  const boundary = projectCandidateFixResumeBoundary(coordinates, 2);
  expect(boundary).toMatchObject({ ...coordinates, schemaVersion: 2, locus: "candidate-fix-pending",
    nextAction: { kind: "continue-pre-publication-review", command: "arc review pre-publication example" }, terminus: null });
  expect(boundary).not.toHaveProperty("policy");
});
