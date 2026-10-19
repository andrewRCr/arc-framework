/** Whole Candidate records built by the production identity and transition constructors. */
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { createCandidateAttestation, createCandidateSubjectSnapshot, createCandidateReviewResponseEvidence,
  createCandidateVerificationResponseEvidence, createCandidateLineageAttestation, CandidateManagedRecordV1Schema,
  CandidateApplicabilitySelectionV1Schema, CandidateReviewApplicabilitySelectionV1Schema } from
  "../../src/lib/work-unit/candidate-attestation.js";

export function candidateRecordFixture() {
  const subject = createCandidateSubjectSnapshot([{ path: "src/main.ts", mode: "100644",
    digest: canonicalDigest({ source: 1 }), treatment: "reviewable" }]);
  const attestation = createCandidateAttestation({ workUnit: "example", subject, baseRevision: "a".repeat(40),
    attestedBy: "andrew", attestedAt: "2026-10-19T13:00:00Z", verificationEvidenceRef: "verification://root" });
  const changed = createCandidateSubjectSnapshot([{ ...subject.entries[0]!, digest: canonicalDigest({ source: 2 }) }]);
  const response = createCandidateReviewResponseEvidence({ candidateId: attestation.candidateId,
    oldTarget: { revision: attestation.baseRevision, subject }, newTarget: { revision: "b".repeat(40), subject: changed },
    dispositionId: canonicalDigest({ dispositions: 1 }), approvedBy: "andrew", appliedBy: "author", applicability: "focused",
    verificationEvidenceRefs: ["verification://fix"], implementationChanged: true });
  const lineageAttestation = createCandidateLineageAttestation({ candidateId: attestation.candidateId, responseId: response.responseId,
    target: response.newTarget, scope: "full", attestedBy: "andrew", attestedAt: "2026-10-19T13:01:00Z",
    verificationEvidenceRef: "verification://convergence" });
  const record = CandidateManagedRecordV1Schema.parse({ schemaVersion: 1, semanticsVersion: "candidate-attestation/v1",
    attestation, subject, transitions: [response], lineageAttestations: [lineageAttestation] });
  const verification = createCandidateVerificationResponseEvidence({ candidateId: attestation.candidateId,
    oldTarget: response.newTarget, newTarget: { revision: "c".repeat(40), subject: changed },
    authorityRef: canonicalDigest({ authority: 1 }), verifiedBy: "andrew", verifiedAt: "2026-10-19T13:02:00Z",
    applicability: "focused", verificationEvidenceRefs: ["verification://response"], implementationChanged: false });
  const selection = CandidateApplicabilitySelectionV1Schema.parse({ transitionKind: "applicability-selection", schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1", candidateId: attestation.candidateId, priorTarget: response.newTarget,
    currentTarget: verification.newTarget, projectionDigest: canonicalDigest({ projection: 1 }),
    residualDigest: canonicalDigest({ residual: 1 }), selectedBy: "andrew", choice: "covered" });
  const reviewSelection = CandidateReviewApplicabilitySelectionV1Schema.parse({ transitionKind: "review-applicability-selection",
    schemaVersion: 1, semanticsVersion: "candidate-attestation/v1", candidateId: attestation.candidateId,
    selector: { schemaVersion: 1, repositoryId: "repo-1", repository: "owner/repo", pullRequest: 42, lane: "standard",
      sourceId: "codex-pr", priorAttemptId: "attempt-1", priorHead: "a".repeat(40), currentHead: "b".repeat(40),
      priorBase: "c".repeat(40), currentBase: "d".repeat(40) }, projectionDigest: canonicalDigest({ projection: "review" }),
    residualDigest: canonicalDigest({ residual: "review" }), selectedBy: "andrew", selectedAt: "2026-10-19T13:02:00Z", choice: "covered" });
  return { record, response, verification, selection, reviewSelection };
}
