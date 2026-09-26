import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { responsePolicyRequestFixture } from "../../../../fixtures/review-response-policy.js";
import {
  createCandidateAttestation,
  createCandidateReviewResponseEvidence,
  createCandidateSubjectSnapshot,
  type CandidateManagedRecordV1,
} from "../../../../../src/lib/work-unit/candidate-attestation.js";
import {
  ApprovedDispositionRecordSchema,
  currentApprovedDispositionNode,
} from "../../../../../src/scripts/review-gate/core/advisory-records.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { createFixAuthorization } from
  "../../../../../src/scripts/review-gate/core/fix-authorization.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { selectPendingCandidateReviewFixRecord } from
  "../../../../../src/scripts/review-gate/policy/candidate-review-fix-continuation.js";

const objectId = (character: string): string => character.repeat(40);

function candidateSubject(source: string) {
  return createCandidateSubjectSnapshot([{
    path: "src/index.ts",
    mode: "100644",
    digest: canonicalDigest({ source }),
    treatment: "reviewable",
  }]);
}

function candidateRecord(): CandidateManagedRecordV1 {
  const subject = candidateSubject("root");
  return {
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    attestation: createCandidateAttestation({
      workUnit: "example",
      subject,
      baseRevision: objectId("c"),
      attestedBy: "author-1",
      attestedAt: "2026-09-08T12:00:00.000Z",
      verificationEvidenceRef: "verification://root",
    }),
    subject,
    transitions: [],
    lineageAttestations: [],
  };
}

function approvedRecord(candidate: CandidateManagedRecordV1, operationId = "operation-1") {
  const target = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "delivery-member",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: objectId("c"),
    headTree: objectId("d"),
  });
  const requirement = createReviewRequirement({
    target,
    projection: {
      obligation: "recommended",
      reasons: ["routine-code"],
      rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: "standard" }),
      retrigger: "full-final",
      count: 1,
    },
    acceptableSources: [{ sourceKind: "frontline", qualifier: "coderabbit-cli" }],
    initialAdmission: "checkpoint",
  });
  if (requirement === null) throw new Error("expected a review requirement");
  const approvedDisposition = approveDispositionState({
    proposed: proposeDispositionSet(createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: target.targetId,
      producerId: operationId,
      resultDigest: canonicalDigest({ operationId, outcome: "findings" }),
      policyVersion: requirement.policyVersion,
      rubricVersion: requirement.rubricVersion,
      rubricDigest: requirement.rubricDigest,
      proposedBy: "arc-cli/0.1.0",
      proposedVerification: "targeted",
      findings: [{
        findingId: "finding-1",
        sourceIdentity: "coderabbit-cli",
        locus: "src/index.ts:1",
        sourceVerification: "verified",
        verificationRefs: ["source:src/index.ts:1"],
        reportedSeverity: "major",
        verifiedSeverity: "major",
        disposition: "fix",
        gating: "blocking",
        rationale: "The finding is supported.",
        recommendation: "Apply the fix.",
        openQuestions: [],
      }],
    })),
    approvedBy: "author-1",
    approvedAt: "2026-09-08T12:05:00.000Z",
  });
  return ApprovedDispositionRecordSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-advisory/v1",
    repositoryId: target.repositoryId,
    operationId,
    candidate: { workUnit: "example", candidateId: candidate.attestation.candidateId },
    errand: null,
    deliveryMember: null,
    source: { kind: "frontline", outcomeRef: `frontline://${operationId}` },
    currentDispositionSetId: approvedDisposition.dispositionSet.dispositionSetId,
    approvedDispositionLineage: [{
      approvedDisposition,
      responsePolicyRequest: responsePolicyRequestFixture({
        headSha: target.headSha,
        sourceId: "coderabbit-cli",
        reviewOperationId: operationId,
        standardReview: {
          obligation: requirement.obligation,
          reasons: requirement.reasons,
          rubricVersion: requirement.rubricVersion,
          rubricDigest: requirement.rubricDigest,
          retrigger: requirement.retrigger,
          count: requirement.count,
        },
      }),
      fixAuthorization: createFixAuthorization({ dispositionState: approvedDisposition, oldTarget: target }),
      errandFixResponse: null,
      deliveryMemberFixResponse: null,
      predecessorDispositionSetId: null,
      successorDispositionSetId: null,
    }],
  });
}

describe("Candidate review-fix continuation", () => {
  it("selects one exact unconsumed Candidate-bound fix authorization", () => {
    const candidate = candidateRecord();
    const record = approvedRecord(candidate);
    const current = currentApprovedDispositionNode(record);

    expect(selectPendingCandidateReviewFixRecord({
      workUnitId: "example",
      candidate,
      records: [record],
    })).toEqual({
      status: "selected",
      candidateId: candidate.attestation.candidateId,
      operationId: record.operationId,
      reviewedHead: current.fixAuthorization?.oldHeadSha,
      record,
    });
  });

  it("retains Candidate authority when frontline reviewed a bound private member", () => {
    const candidate = candidateRecord();
    const ordinary = approvedRecord(candidate);
    const record = ApprovedDispositionRecordSchema.parse({
      ...ordinary,
      deliveryMember: {
        kind: "delivery-member",
        planId: "123e4567-e89b-42d3-a456-426614174000",
        deliverableId: `sha256:${"d".repeat(64)}`,
        workUnitId: "example",
        head: currentApprovedDispositionNode(ordinary).fixAuthorization?.oldHeadSha,
      },
    });

    expect(selectPendingCandidateReviewFixRecord({
      workUnitId: "example",
      candidate,
      records: [record],
    })).toMatchObject({
      status: "selected",
      candidateId: candidate.attestation.candidateId,
      operationId: record.operationId,
      reviewedHead: currentApprovedDispositionNode(record).fixAuthorization?.oldHeadSha,
    });
  });

  it("does not revive authority already consumed by Candidate lineage", () => {
    const candidate = candidateRecord();
    const record = approvedRecord(candidate);
    const advanced = {
      ...candidate,
      transitions: [createCandidateReviewResponseEvidence({
        candidateId: candidate.attestation.candidateId,
        oldTarget: { revision: objectId("c"), subject: candidate.subject },
        newTarget: { revision: objectId("e"), subject: candidateSubject("fixed") },
        dispositionId: currentApprovedDispositionNode(record).approvedDisposition.dispositionSet.dispositionSetId,
        approvedBy: "author-1",
        appliedBy: "arc-cli/0.1.0",
        applicability: "targeted",
        verificationEvidenceRefs: ["verification://targeted-fix"],
        implementationChanged: true,
      })],
    };

    expect(selectPendingCandidateReviewFixRecord({
      workUnitId: "example",
      candidate: advanced,
      records: [record],
    })).toEqual({ status: "none" });
  });

  it("refuses ambiguous pending Candidate fix authority", () => {
    const candidate = candidateRecord();

    expect(selectPendingCandidateReviewFixRecord({
      workUnitId: "example",
      candidate,
      records: [approvedRecord(candidate), approvedRecord(candidate, "operation-2")],
    })).toEqual({ status: "refused", reason: "candidate-review-fix-response-ambiguous" });
  });

  it("refuses a pending record whose fix authorization no longer matches its approval", () => {
    const candidate = candidateRecord();
    const record = approvedRecord(candidate);
    const current = currentApprovedDispositionNode(record);
    if (current.fixAuthorization === null) throw new Error("expected fix authorization");

    expect(selectPendingCandidateReviewFixRecord({
      workUnitId: "example",
      candidate,
      records: [{
        ...record,
        approvedDispositionLineage: [{
          ...current,
          fixAuthorization: { ...current.fixAuthorization, authorizedBy: "different-author" },
        }],
      }],
    })).toEqual({ status: "refused", reason: "candidate-review-fix-response-invalid" });
  });
});
