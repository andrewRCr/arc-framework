import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../../../../../../../src/lib/kernel/index.js";
import { parseReviewCandidate } from "../../../../../../../src/lib/store/kinds/review/candidate/parser.js";
import { createCandidateVerificationResponseEvidence } from "../../../../../../../src/lib/work-unit/candidate-attestation.js";
import { candidateRecordFixture } from "../../../../../../fixtures/review-candidate.js";

describe("Candidate kind parsing", () => {
  it.each(["candidate", "response", "verification"] as const)("recomputes the %s identity", (kind) => {
    const { record, response, verification } = candidateRecordFixture();
    const wrong = canonicalDigest({ wrong: kind });
    const changed = kind === "candidate" ? { ...record, attestation: { ...record.attestation, candidateId: wrong },
      transitions: [], lineageAttestations: [] }
      : kind === "response" ? { ...record, transitions: [{ ...response, responseId: wrong }], lineageAttestations: [] }
      : { ...record, transitions: [response, { ...verification, verificationId: wrong }], lineageAttestations: [] };
    expect(parseReviewCandidate(JSON.stringify(changed))).toBeNull();
    expect(parseReviewCandidate(JSON.stringify(record))).toEqual(record);
  });
  it.each(["response", "selection"] as const)("requires a verification %s to continue the running target", (kind) => {
    const { record, verification, selection } = candidateRecordFixture();
    const { verificationId: ignored, ...fields } = verification;
    void ignored;
    const changed = kind === "response" ? createCandidateVerificationResponseEvidence({ ...fields,
      oldTarget: { revision: record.attestation.baseRevision, subject: record.subject }, implementationChanged: true })
      : { ...selection, priorTarget: { revision: record.attestation.baseRevision, subject: record.subject } };
    expect(parseReviewCandidate(JSON.stringify({ ...record, transitions: [...record.transitions, changed] }))).toBeNull();
    expect(parseReviewCandidate(JSON.stringify({ ...record, transitions: [...record.transitions, kind === "response" ? verification : selection] })))
      .not.toBeNull();
  });
  it.each(["evidence", "selection"] as const)("refuses a reused verification authority %s", (kind) => {
    const { record, reviewSelection } = candidateRecordFixture();
    const changed = kind === "evidence" ? { ...record, lineageAttestations: record.lineageAttestations.map((value) => ({ ...value,
      verificationEvidenceRef: record.attestation.verificationEvidenceRef })) }
      : { ...record, transitions: [...record.transitions, reviewSelection, reviewSelection] };
    expect(parseReviewCandidate(JSON.stringify(changed))).toBeNull();
    expect(parseReviewCandidate(JSON.stringify({ ...record, transitions: [...record.transitions, reviewSelection] }))).not.toBeNull();
  });
});
