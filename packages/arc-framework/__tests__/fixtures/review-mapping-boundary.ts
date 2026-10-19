/** Native Candidate and boundary inputs for pure import conversion. */
import { boundaryLoci, boundaryV1Fixture } from "./review-boundary.js";
import { candidateRecordFixture } from "./review-candidate.js";
import { mappingErrand } from "./review-mapping.js";
import { IntegrationBoundaryLocusSchema, createStandardReviewReservation } from
  "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import type { ReviewMappingInput } from "../../src/lib/store/kinds/review/mapping-types.js";

export function mappingBoundaryFixture(locus: typeof boundaryLoci[number] = "candidate-review-pending") {
  const { record: original } = candidateRecordFixture();
  const candidate = { ...original, transitions: [], lineageAttestations: [] };
  const source = boundaryV1Fixture(locus);
  const reservation = source.reservation === null ? null : createStandardReviewReservation({
    candidateId: candidate.attestation.candidateId, sourceId: source.reservation.sources[0]!,
    sources: source.reservation.sources, target: source.reservation.target, obligation: source.reservation.obligation });
  const token = Buffer.from(JSON.stringify({ candidateId: candidate.attestation.candidateId,
    candidateSubjectDigest: candidate.subject.subjectDigest })).toString("base64url");
  const boundary = IntegrationBoundaryLocusSchema.parse(JSON.parse(JSON.stringify({ ...source,
    candidateId: candidate.attestation.candidateId, candidateSubjectDigest: candidate.subject.subjectDigest, reservation,
  }).replaceAll("opaque-token", token)));
  const input: ReviewMappingInput = { projectId: "repo-1", gate: [],
    workItems: [{ kind: "work-unit", slug: "example", uid: mappingErrand.uid, live: true }],
    candidates: [{ workItem: mappingErrand.uid, versions: [{ commit: "a".repeat(40), content: JSON.stringify(candidate) }],
      boundary: JSON.stringify(boundary) }] };
  return { input, candidate, boundary };
}
