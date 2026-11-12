/** Publication projections preserve portable readiness authority through recovery. */
import { expect, it } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { IntegrationBoundaryLocusV2Schema, projectPublicationBoundary, recoverPublicationBoundary, recoverIntegratingBoundary, recoverAttestedSingletonPublicationBoundary } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { boundaryV2Fixture } from "../../../../fixtures/review-boundary.js";

const input = { workUnit: "example", branch: "feat/example", candidateId: canonicalDigest({ candidate: 1 }),
  candidateSubjectDigest: canonicalDigest({ subject: 1 }), reservation: null, changeRequest: null };
const binding = canonicalDigest({ readiness: 1 });

it.each([binding, null])("carries a native publication's readiness binding %s", (readinessBinding) => {
  const boundary = projectPublicationBoundary({ ...input, readinessBinding }, 2);
  expect(boundary).toMatchObject({ schemaVersion: 2, locus: "publication-pending", readinessBinding });
  expect(boundary).not.toHaveProperty("policy");
  expect(boundary).not.toHaveProperty("standardLaneOwnerVersion");
  expect(boundary.nextAction.command).toBe("git push -u origin feat/example");
});

it.each(["publication-pending", "hosted-review-pending", "delivery-status-required"] as const)(
  "rebinds native %s without losing stored authority", (locus) => {
    const stored = IntegrationBoundaryLocusV2Schema.parse({ ...boundaryV2Fixture(locus),
      ...(locus === "publication-pending" ? { readinessBinding: binding } : {}),
      terminus: canonicalDigest({ decision: 1 }) });
    const current = { ...input, stored, candidateId: stored.candidateId };
    const expected = { ...stored, candidateSubjectDigest: input.candidateSubjectDigest };
    expect(recoverPublicationBoundary(current)).toEqual(expected);
    expect(recoverIntegratingBoundary(current)).toEqual(expected);
  });

it.each([binding, null])("recovers ready native publication with its binding %s", (readinessBinding) => {
  const stored = IntegrationBoundaryLocusV2Schema.parse({ ...boundaryV2Fixture("candidate-publish-ready"), readinessBinding });
  const recovered = recoverPublicationBoundary({ ...input, candidateId: stored.candidateId, stored });
  expect(recovered).toMatchObject({ schemaVersion: 2, locus: "publication-pending", readinessBinding,
    candidateSubjectDigest: input.candidateSubjectDigest });
  expect(recovered).not.toHaveProperty("policy");
});

it.each(["hosted-review-pending", "delivery-status-required"] as const)(
  "projects native %s from its carried reservation", (locus) => {
    const source = IntegrationBoundaryLocusV2Schema.parse(boundaryV2Fixture(locus));
    const terminus = canonicalDigest({ decision: 2 });
    const boundary = projectPublicationBoundary({ ...input, reservation: source.reservation, terminus,
      readinessBinding: binding, changeRequest: { repository: "owner/repo", pullRequest: 42 } }, 2);
    expect(boundary).toMatchObject({ schemaVersion: 2, locus, reservation: source.reservation, terminus });
    expect(boundary).not.toHaveProperty("readinessBinding");
    expect(boundary).not.toHaveProperty("policy");
  });

it.each([false, true])("attests native singleton publication with repairCurrent=%s while retaining its binding", repairCurrent => {
  const stored = IntegrationBoundaryLocusV2Schema.parse({ ...boundaryV2Fixture("publication-pending"), readinessBinding: binding });
  if (stored.candidateSubjectDigest === null) throw new Error("Expected a bound publication subject");
  const candidateSubjectDigest = repairCurrent ? canonicalDigest({ repaired: 1 }) : stored.candidateSubjectDigest;
  expect(recoverAttestedSingletonPublicationBoundary({ stored, workUnit: "example", candidateId: stored.candidateId,
    candidateSubjectDigest, integrating: true, repairCurrent })).toMatchObject({ schemaVersion: 2, locus: "publication-pending",
    candidateSubjectDigest, readinessBinding: binding });
});
