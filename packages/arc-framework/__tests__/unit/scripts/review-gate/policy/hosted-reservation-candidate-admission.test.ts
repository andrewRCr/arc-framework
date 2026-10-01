/** Candidate-hosted reservation capacity and additional-pass admission. */

import { describe, expect, it } from "vitest";

import { responsePolicyRequestFixture } from "../../../../fixtures/review-response-policy.js";
import { canonicalDigest } from "../../../../../src/lib/kernel/canonical/canonical-json.js";
import { DeliveryReviewMemberVehicleSchema } from
  "../../../../../src/lib/delivery/review-vehicle.js";
import { createReviewRequirement, createReviewTarget } from
  "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewResult } from
  "../../../../../src/scripts/review-gate/core/review-result.js";
import { ApprovedDispositionRecordSchema } from
  "../../../../../src/scripts/review-gate/core/advisory-records.js";
import { approveDispositionState, createDispositionSet, proposeDispositionSet } from
  "../../../../../src/scripts/review-gate/core/dispositions.js";
import { bindReviewSourceReference } from
  "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { createHostedAdmission } from
  "../../../../../src/scripts/review-gate/hosted/request.js";
import { createStandardReviewReservation } from
  "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  assertCandidateHostedReservationPolicyAdmission,
  assertEvidenceBoundCandidateHostedReservationPolicyAdmission,
} from "../../../../../src/scripts/review-gate/policy/hosted-reservation-admission.js";

const reservation = createStandardReviewReservation({
  candidateId: `sha256:${"a".repeat(64)}`,
  sourceId: "coderabbit-pr",
  sources: ["coderabbit-pr", "codex-pr"],
  repository: "owner/repo",
  headSha: "b".repeat(40),
  obligation: {
    obligation: "required",
    reasons: ["sensitive-change-set"],
    rubricVersion: "standard-review/v1",
    rubricDigest: `sha256:${"c".repeat(64)}`,
    retrigger: "full-final",
    count: 1,
  },
});
const CURRENT_HEAD = "e".repeat(40);
const DELIVERY_PLAN_ID = "123e4567-e89b-12d3-a456-426614174000";
const DELIVERY_MEMBER_ID = `sha256:${"f".repeat(64)}`;
const deliveryReservation = createStandardReviewReservation({
  candidateId: `sha256:${"a".repeat(64)}`,
  sourceId: "coderabbit-pr",
  sources: ["coderabbit-pr", "codex-pr"],
  target: {
    kind: "delivery",
    repository: "owner/repo",
    workUnitId: "example",
    planId: DELIVERY_PLAN_ID,
  },
  obligation: reservation.obligation,
});
const deliveryVehicle = DeliveryReviewMemberVehicleSchema.parse({
  kind: "delivery-member",
  planId: DELIVERY_PLAN_ID,
  deliverableId: DELIVERY_MEMBER_ID,
  workUnitId: "example",
  head: "f".repeat(40),
});

function hostedProgressAttempt(input: {
  attemptId: string;
  sourceId: "coderabbit-pr" | "codex-pr";
  outcome: "clean" | "settled-findings" | "rate-limited";
  vehicle: typeof deliveryVehicle;
  requestedCoverage?: "complete" | "incremental";
  effectiveCoverage?: "complete" | "incremental" | null;
  logicalPass?: number;
  pullRequest?: number;
}) {
  const reviewTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "delivery-member",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: "a".repeat(40),
    diffBaseTree: "b".repeat(40),
    headSha: input.vehicle.head,
    headTree: "c".repeat(40),
  });
  const requirement = createReviewRequirement({
    target: reviewTarget,
    projection: deliveryReservation.obligation,
    acceptableSources: [{ sourceKind: "hosted", qualifier: input.sourceId }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected hosted requirement");
  const finding = {
    findingId: "finding-1",
    origin: "review-thread" as const,
    commentId: "comment-1",
    threadId: "thread-1",
    settlement: "reply-and-resolve" as const,
    severity: "major" as const,
    locus: "src/index.ts:1",
    url: "https://example.test/finding-1",
  };
  const requestedCoverage = input.requestedCoverage ?? "complete";
  const target = { repository: "owner/repo", pullRequest: input.pullRequest ?? 42, headSha: input.vehicle.head };
  const admission = createHostedAdmission({
    schemaVersion: 1,
    repositoryId: "repo-1",
    lineage: {
      kind: "delivery-member",
      planId: input.vehicle.planId,
      workUnitId: input.vehicle.workUnitId,
      deliverableId: input.vehicle.deliverableId,
    },
    logicalPass: input.logicalPass ?? 1,
    sourceId: input.sourceId,
    target,
    requestedCoverage,
    ...(requestedCoverage === "incremental"
      ? {
          correctionScope: {
            schemaVersion: 1 as const,
            predecessorProducerId: "prior-review",
            predecessorHeadSha: "9".repeat(40),
            basisHeadSha: "9".repeat(40),
            headSha: target.headSha,
            requiredFindings: [],
          },
        }
      : {}),
    vehicle: input.vehicle,
    reviewTarget,
    requirement,
    actorIdentity: "reviewer-1",
  });
  return {
    attemptId: input.attemptId,
    logicalPass: input.logicalPass ?? 1,
    retryGeneration: 0,
    changeRequestId: `pull/${target.pullRequest}`,
    headSha: input.vehicle.head,
    terminalProducer: input.outcome !== "rate-limited",
    sourceId: input.sourceId,
    outcome: input.outcome,
    hosted: {
      admission,
      target,
      requestedCoverage,
      effectiveCoverage: input.effectiveCoverage
        ?? (input.outcome === "rate-limited" ? null : "complete"),
      vehicle: input.vehicle,
      reviewTarget,
      requirement,
      actorIdentity: "reviewer-1",
      requestFailureReason: null,
      findings: input.outcome === "settled-findings" ? [finding] : [],
      dispositionSetId: input.outcome === "settled-findings" ? canonicalDigest({ disposition: 1 }) : null,
      dispositionSetLineage: input.outcome === "settled-findings" ? [{
        dispositionSetId: canonicalDigest({ disposition: 1 }),
        predecessorDispositionSetId: null,
        successorDispositionSetId: null,
        findingActions: [{
          findingId: finding.findingId,
          disposition: "reject" as const,
          channelAction: "reply-and-resolve" as const,
        }],
      }] : [],
      settledFindingIds: input.outcome === "settled-findings" ? [finding.findingId] : [],
      settlementEvidence: input.outcome === "settled-findings" ? [{
        findingId: finding.findingId,
        dispositionSetId: canonicalDigest({ disposition: 1 }),
        disposition: "reject" as const,
        channelAction: "reply-and-resolve" as const,
        actorIdentity: admission.actorIdentity,
        target,
        fixTarget: null,
        commentId: finding.commentId,
        threadId: finding.threadId,
        replyDigest: canonicalDigest({ reply: 1 }),
        replyId: "reply-1",
        performedAt: "2026-08-31T12:01:00Z",
        carriedFromDispositionSetId: null,
      }] : [],
    },
  };
}

function candidatePredecessor(input: {
  outcome: "clean" | "settled-findings";
  severity?: "minor" | "major";
  attemptId?: string;
}) {
  const attempt = hostedProgressAttempt({
    attemptId: input.attemptId ?? "hosted/predecessor",
    sourceId: "coderabbit-pr",
    outcome: input.outcome,
    vehicle: { ...deliveryVehicle, head: CURRENT_HEAD },
  });
  const hosted = attempt.hosted;
  const findings = input.outcome === "clean" ? [] : [{
    findingId: "finding-1",
    severity: input.severity ?? "minor",
    locus: "src/index.ts:1",
    evidenceUrlOrId: "hosted:finding-1",
    sourceOrdinal: 1,
  }];
  const result: ReviewResult = {
    kind: "hosted",
    producerId: attempt.attemptId,
    repositoryId: hosted.reviewTarget.repositoryId,
    target: hosted.reviewTarget,
    sourceIdentity: attempt.sourceId,
    originalOutcome: input.outcome === "clean" ? "clean" : "findings",
    findings,
    resultDigest: canonicalDigest({ result: input.outcome, severity: input.severity }),
    admission: {
      lineage: {
        kind: "delivery-member",
        planId: deliveryVehicle.planId,
        workUnitId: deliveryVehicle.workUnitId,
        deliverableId: deliveryVehicle.deliverableId,
      },
      logicalPass: 1,
      retryGeneration: 0,
      requestedCoverage: "complete",
      effectiveCoverage: "complete",
      scopeMode: "whole-target",
      policyVersion: hosted.requirement.policyVersion,
    },
    laneOperationId: "lane-progress/preceding",
    actorIdentity: hosted.actorIdentity,
    hostedTarget: hosted.target,
    requirement: hosted.requirement,
    hostSettlementFindingIds: [],
    noHostSettlementFindingIds: [],
    settled: input.outcome === "settled-findings",
  };
  const disposition = input.outcome === "clean" ? null : (() => {
    const finding = findings[0];
    if (finding === undefined) throw new Error("expected predecessor finding");
    const set = createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: result.target.targetId,
      producerId: result.producerId,
      resultDigest: result.resultDigest,
      policyVersion: result.admission.policyVersion,
      rubricVersion: hosted.requirement.rubricVersion,
      rubricDigest: hosted.requirement.rubricDigest,
      proposedBy: "arc-cli/0.1.0",
      proposedVerification: "full",
      findings: [{
        findingId: finding.findingId,
        sourceIdentity: result.sourceIdentity,
        locus: finding.locus,
        verificationRefs: [`source:${finding.locus}`],
        reportedSeverity: finding.severity,
        sourceVerification: "verified",
        verifiedSeverity: finding.severity,
        rationale: "The source check established this disposition.",
        recommendation: "Record the approved response.",
        disposition: "reject",
        openQuestions: [],
      }],
    });
    const approvedDisposition = approveDispositionState({
      proposed: proposeDispositionSet(set),
      approvedBy: "andrew",
      approvedAt: "2026-09-09T20:00:00Z",
    });
    return ApprovedDispositionRecordSchema.parse({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: result.repositoryId,
      operationId: result.producerId,
      candidate: null,
      errand: null,
      deliveryMember: null,
      source: {
        kind: "hosted",
        attemptRef: bindReviewSourceReference({
          kind: "hosted",
          operationId: result.laneOperationId,
          durableRef: result.producerId,
        }),
        hostedResultId: result.resultDigest,
      },
      currentDispositionSetId: approvedDisposition.dispositionSet.dispositionSetId,
      approvedDispositionLineage: [{
        approvedDisposition,
        responsePolicyRequest: responsePolicyRequestFixture({
          headSha: result.target.headSha,
          sourceId: result.sourceIdentity,
          reviewOperationId: result.producerId,
        }),
        fixAuthorization: null,
        errandFixResponse: null,
        deliveryMemberFixResponse: null,
        predecessorDispositionSetId: null,
        successorDispositionSetId: null,
      }],
    });
  })();
  return { attempt, result, disposition };
}

describe("Candidate hosted reservation admission", () => {
  it("refuses an unscoped CodeRabbit correction before hosted capacity is spent", () => {
    expect(() => assertCandidateHostedReservationPolicyAdmission({
      reservation,
      discharge: {
        discharged: false,
        detail: "The current Candidate head requires correction review.",
        nextSource: "coderabbit-pr",
        requestCoverage: "incremental",
      },
      progress: null,
      target: { repository: "owner/repo", pullRequest: 42, headSha: CURRENT_HEAD },
      provider: "coderabbit-pr",
      coverage: "incremental",
      maxPasses: 2,
      logicalPass: 1,
    })).toThrow(/cannot carry an exact correction scope/u);
  });

  it("excludes prior-head terminals when rechecking Candidate capacity at the pass ceiling", () => {
    const target = { repository: "owner/repo", pullRequest: 42, headSha: CURRENT_HEAD };
    const input = {
      reservation,
      discharge: {
        discharged: false,
        detail: "The current Candidate head requires review.",
        nextSource: "coderabbit-pr",
      },
      progress: {
        completedPasses: 2,
        attempts: [1, 2].map((logicalPass) => ({
          attemptId: `prior-clean-${String(logicalPass)}`,
          logicalPass,
          retryGeneration: 0,
          changeRequestId: "pull/42",
          headSha: "d".repeat(40),
          terminalProducer: true,
          sourceId: "coderabbit-pr",
          outcome: "clean" as const,
        })),
      },
      target,
      provider: "coderabbit-pr",
      coverage: "complete" as const,
      maxPasses: 2,
      logicalPass: 3,
    };

    expect(() => assertCandidateHostedReservationPolicyAdmission(input)).toThrow(/approval-required/u);
    expect(() => assertCandidateHostedReservationPolicyAdmission({
      ...input,
      ceilingOverride: {
        target,
        lane: "standard" as const,
        exhaustedPassCount: 2,
        nextPass: 3,
      },
    })).not.toThrow();
  });

  it("admits a third Candidate pass after two settled same-head passes from different sources", async () => {
    const target = { repository: "owner/repo", pullRequest: 42, headSha: CURRENT_HEAD };
    const input = {
      reservation, target, provider: "coderabbit-pr", coverage: "complete" as const,
      maxPasses: 2, logicalPass: 3,
      discharge: { discharged: false, detail: "The current Candidate requires another pass.",
        nextSource: "coderabbit-pr" },
      progress: {
        completedPasses: 2,
        attempts: ["coderabbit-pr", "codex-pr"].map((sourceId, index) => ({
          attemptId: `pass-${index + 1}`, headSha: CURRENT_HEAD, sourceId,
          outcome: "settled-findings" as const,
        })),
      },
      ceilingOverride: { target, lane: "standard" as const, exhaustedPassCount: 2, nextPass: 3 },
    };

    await expect(assertEvidenceBoundCandidateHostedReservationPolicyAdmission(input, {
      resultReader: { readResult: () => Promise.reject(new Error("past pass must not be read")) },
      dispositionStore: {
        readDispositionRecord: () => Promise.resolve(null),
        appendDispositionRecord: () => Promise.reject(new Error("read-only test store")),
      },
      confirmTarget: () => Promise.reject(new Error("past pass must not be confirmed")),
    })).resolves.toBeUndefined();
  });

  it("requires a verified settled predecessor before an additional Candidate pass", async () => {
    const predecessor = candidatePredecessor({ outcome: "settled-findings", severity: "major" });
    const target = { repository: "owner/repo", pullRequest: 42, headSha: CURRENT_HEAD };
    const input = {
      reservation,
      discharge: { discharged: false, detail: "Another review requested.", nextSource: "coderabbit-pr" },
      progress: { completedPasses: 1, attempts: [predecessor.attempt] },
      target, provider: "coderabbit-pr", coverage: "complete" as const,
      maxPasses: 1, logicalPass: 2,
      additionalPassAuthorization: {
        target, lane: "standard" as const, precedingProducerId: predecessor.attempt.attemptId,
        completedPasses: 1, nextPass: 2,
      },
    };
    const dependencies = {
      resultReader: { readResult: async () => predecessor.result },
      dispositionStore: {
        readDispositionRecord: async () => predecessor.disposition,
        appendDispositionRecord: async () => { throw new Error("read-only test store"); },
      },
      confirmTarget: async () => predecessor.result.target,
    };

    expect(() => assertCandidateHostedReservationPolicyAdmission(input))
      .toThrow(/preceding-producer-mismatch/u);
    await expect(assertEvidenceBoundCandidateHostedReservationPolicyAdmission({
      ...input,
      additionalPassAuthorization: {
        ...input.additionalPassAuthorization, precedingProducerId: "hosted/forged",
      },
    }, dependencies)).rejects.toThrow(/exact latest completed terminal producer/u);
    await expect(assertEvidenceBoundCandidateHostedReservationPolicyAdmission({
      ...input,
      progress: { completedPasses: 1, attempts: [{ ...predecessor.attempt, logicalPass: 2 }] },
    }, dependencies)).rejects.toThrow(/exact latest completed terminal producer/u);
    await expect(assertEvidenceBoundCandidateHostedReservationPolicyAdmission({
      ...input,
      progress: { completedPasses: 1, attempts: [{ ...predecessor.attempt, terminalProducer: false }] },
    }, dependencies)).rejects.toThrow(/exact latest completed terminal producer/u);
    await expect(assertEvidenceBoundCandidateHostedReservationPolicyAdmission(input, dependencies))
      .rejects.toThrow(/approval-required\/obtain-ceiling-override/u);
  });

  it("admits an additional Candidate pass after exact clean or minor predecessor evidence", async () => {
    for (const outcome of ["clean", "settled-findings"] as const) {
      const predecessor = candidatePredecessor({ outcome, severity: "minor" });
      const target = { repository: "owner/repo", pullRequest: 42, headSha: CURRENT_HEAD };
      const input = {
        reservation,
        discharge: { discharged: false, detail: "Another review requested.", nextSource: "coderabbit-pr" },
        progress: { completedPasses: 1, attempts: [predecessor.attempt] },
        target, provider: "coderabbit-pr", coverage: "complete" as const,
        maxPasses: 1, logicalPass: 2,
        additionalPassAuthorization: {
          target, lane: "standard" as const, precedingProducerId: predecessor.attempt.attemptId,
          completedPasses: 1, nextPass: 2,
        },
      };
      const dependencies = {
        resultReader: { readResult: async () => predecessor.result },
        dispositionStore: {
          readDispositionRecord: async () => predecessor.disposition,
          appendDispositionRecord: async () => { throw new Error("read-only test store"); },
        },
        confirmTarget: async () => predecessor.result.target,
      };
      await expect(assertEvidenceBoundCandidateHostedReservationPolicyAdmission(input, dependencies))
        .resolves.toBeUndefined();
      if (outcome === "settled-findings") {
        const fallback = hostedProgressAttempt({
          attemptId: "hosted/fallback",
          sourceId: "coderabbit-pr",
          outcome: "rate-limited",
          vehicle: { ...deliveryVehicle, head: CURRENT_HEAD },
          logicalPass: 2,
        });
        await expect(assertEvidenceBoundCandidateHostedReservationPolicyAdmission({
          ...input,
          discharge: {
            discharged: false, detail: "Preferred source is unavailable.", nextSource: "codex-pr",
          },
          progress: { completedPasses: 1, attempts: [predecessor.attempt, fallback] },
          provider: "codex-pr",
        }, dependencies)).resolves.toBeUndefined();
        await expect(assertEvidenceBoundCandidateHostedReservationPolicyAdmission({
          ...input, additionalPassAuthorization: undefined,
        }, dependencies)).rejects.toThrow(/approval-required/u);
      }
    }
  });

  it("retains only applicability-approved fallback progress across Candidate heads", async () => {
    const target = { repository: "owner/repo", pullRequest: 42, headSha: CURRENT_HEAD };
    const input = {
      reservation,
      discharge: {
        discharged: false,
        detail: "The retained first source is safely unavailable.",
        nextSource: "codex-pr",
        requestCoverage: "complete" as const,
        requestAttempts: [{ sourceId: "coderabbit-pr", outcome: "rate-limited" as const }],
      },
      progress: {
        completedPasses: 0,
        attempts: [{
          attemptId: "hosted/coderabbit-attempt",
          headSha: "d".repeat(40),
          sourceId: "coderabbit-pr",
          outcome: "rate-limited" as const,
        }],
      },
      target,
      provider: "codex-pr",
      coverage: "complete" as const,
      maxPasses: 2,
      logicalPass: 1,
    };

    expect(() => assertCandidateHostedReservationPolicyAdmission(input)).not.toThrow();
    await expect(assertEvidenceBoundCandidateHostedReservationPolicyAdmission(input, {
      resultReader: {
        readResult: () => Promise.reject(new Error("no terminal producer expected")),
      },
      dispositionStore: {
        readDispositionRecord: () => Promise.resolve(null),
        appendDispositionRecord: () => Promise.reject(new Error("read-only test store")),
      },
      confirmTarget: () => Promise.reject(new Error("no terminal producer expected")),
    })).resolves.toBeUndefined();
  });

});
