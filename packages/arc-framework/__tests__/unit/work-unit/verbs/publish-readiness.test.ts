/** Publication authorizers bind portable review progress without scalar versions. */
import { expect, it } from "vitest";
import { canonicalDigest } from "../../../../src/lib/kernel/index.js";
import { authorizeSubmission, authorizeActivePublication } from "../../../../src/lib/work-unit/verbs/publish.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { boundaryV2Fixture } from "../../../fixtures/review-boundary.js";

const digest = canonicalDigest({ readiness: 1 });
const currentReadinessBinding = { status: "complete" as const, digest };
function boundary(locus: "candidate-publish-ready" | "publication-pending", readinessBinding: typeof digest | null = digest) {
  return IntegrationBoundaryLocusV2Schema.parse({ ...boundaryV2Fixture(locus), readinessBinding });
}

it("authorizes the exact native Candidate with its current review binding", () => {
  const ready = boundary("candidate-publish-ready");
  expect(authorizeSubmission({ expectedCandidateId: ready.candidateId, expectedCandidateSubjectDigest: ready.candidateSubjectDigest!,
    boundary: ready, currentReadinessBinding })).toEqual({ status: "authorized", reservation: ready.reservation, terminus: ready.terminus });
});
it.each(["candidate-publish-ready", "publication-pending"] as const)("authorizes a native %s boundary without a scalar lane version", locus => {
  const ready = boundary(locus);
  expect(authorizeActivePublication({ candidateId: ready.candidateId, candidateSubjectDigest: ready.candidateSubjectDigest!,
    boundary: ready, currentReadinessBinding })).toEqual({ status: "authorized", reservation: ready.reservation, terminus: ready.terminus });
});
it.each(["candidate-publish-ready", "publication-pending"] as const)("refuses changed, unbound or incomplete progress at %s and accepts repaired readiness", locus => {
  const ready = boundary(locus);
  const input = { candidateId: ready.candidateId, candidateSubjectDigest: ready.candidateSubjectDigest!, boundary: ready };
  for (const observed of [undefined, { status: "incomplete" as const, condition: "outcome listing is unreadable" },
    { status: "complete" as const, digest: canonicalDigest({ readiness: 2 }) }]) {
    expect(authorizeActivePublication({ ...input, currentReadinessBinding: observed })).toMatchObject({ status: "refused",
      reason: expect.stringMatching(/review|readiness/iu) });
  }
  expect(authorizeActivePublication({ ...input, boundary: boundary(locus, null), currentReadinessBinding }))
    .toMatchObject({ status: "refused" });
  expect(authorizeActivePublication({ ...input, currentReadinessBinding })).toMatchObject({ status: "authorized" });
});
