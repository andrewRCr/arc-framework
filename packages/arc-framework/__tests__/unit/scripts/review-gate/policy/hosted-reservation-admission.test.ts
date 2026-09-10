/** Unit coverage for ordered hosted-review admission. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from
  "../../../../../src/lib/canonical/canonical-json.js";
import { DeliveryReviewMemberVehicleSchema } from
  "../../../../../src/lib/delivery/review-vehicle.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewOperationStateSnapshot } from
  "../../../../../src/scripts/review-gate/core/ports.js";
import { createHostedAdmission } from
  "../../../../../src/scripts/review-gate/hosted/request.js";
import { createStandardReviewReservation } from
  "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  assertHostedErrandBindingAuthority,
  assertHostedErrandAdmission,
  assertCandidateHostedReservationPolicyAdmission,
  assertEvidenceBoundCandidateHostedReservationPolicyAdmission,
  assertHostedReservationAdmission,
  assertHostedReservationPolicyAdmission,
  configuredSourceSuffix,
  firstAdmissibleHostedSource,
  hostedReservationAttemptsForTarget,
  projectHostedReservationPolicyProgress,
  resolveHostedReservationPolicy,
} from "../../../../../src/scripts/review-gate/policy/hosted-reservation-admission.js";
import { projectHostedReservationDischarge } from
  "../../../../../src/scripts/review-gate/policy/hosted-reservation-discharge.js";

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
const CANDIDATE_ID = `sha256:${"a".repeat(64)}`;
const SUBJECT_DIGEST = `sha256:${"d".repeat(64)}`;
const CURRENT_HEAD = "e".repeat(40);
const DELIVERY_PLAN_ID = "123e4567-e89b-12d3-a456-426614174000";
const DELIVERY_MEMBER_ID = `sha256:${"f".repeat(64)}`;
const deliveryReservation = createStandardReviewReservation({
  candidateId: CANDIDATE_ID,
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
const delegatedAdmission = (vehicle: typeof deliveryVehicle) => ({
  schemaVersion: 1 as const,
  sourceId: "delegated-agent" as const,
  statusTarget: { repository: "owner/repo", headRef: "feature", headSha: vehicle.head },
  target: { repository: "owner/repo", pullRequest: 42, headSha: vehicle.head },
  vehicle,
  pass: 1,
});
const binding = {
  boundary: { candidateId: CANDIDATE_ID, candidateSubjectDigest: SUBJECT_DIGEST },
  candidate: { candidateId: CANDIDATE_ID, subjectDigest: SUBJECT_DIGEST, headSha: CURRENT_HEAD },
};
const errandBinding = {
  kind: "errand" as const,
  key: "review-errand",
  claimId: "claim-1",
  branch: "chore/review-errand",
  sources: ["coderabbit-pr", "codex-pr"],
  standardReview: reservation.obligation,
};

function hostedProgressAttempt(input: {
  attemptId: string;
  sourceId: "coderabbit-pr" | "codex-pr";
  outcome: "clean" | "settled-findings" | "rate-limited";
  vehicle: typeof deliveryVehicle;
  requestedCoverage?: "complete" | "incremental";
  effectiveCoverage?: "complete" | "incremental" | null;
  logicalPass?: number;
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
  const target = { repository: "owner/repo", pullRequest: 42, headSha: input.vehicle.head };
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
    vehicle: input.vehicle,
    reviewTarget,
    requirement,
    actorIdentity: "reviewer-1",
  });
  return {
    attemptId: input.attemptId,
    logicalPass: input.logicalPass ?? 1,
    retryGeneration: 0,
    changeRequestId: "pull/42",
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

function memberProgressSnapshot(): ReviewOperationStateSnapshot {
  const priorVehicle = { ...deliveryVehicle, head: "d".repeat(40) };
  const unrelatedVehicle = {
    ...priorVehicle,
    deliverableId: `sha256:${"1".repeat(64)}`,
  };
  return {
    status: "complete",
    records: [
      {
        version: 1,
        state: {
          schemaVersion: 1,
          semanticsVersion: "review-operation/v1",
          operationId: "lane-progress/prior",
          updatedAt: "2026-08-27T12:00:00.000Z",
          kind: "lane-progress",
          lane: "standard",
          repositoryId: "repo-1",
          lineage: {
            kind: "delivery-member",
            planId: priorVehicle.planId,
            workUnitId: priorVehicle.workUnitId,
            deliverableId: priorVehicle.deliverableId,
          },
          completedPasses: 1,
          attempts: [
            hostedProgressAttempt({
              attemptId: "attempt-prior",
              sourceId: "coderabbit-pr",
              outcome: "settled-findings",
              vehicle: priorVehicle,
            }),
            hostedProgressAttempt({
              attemptId: "attempt-unrelated",
              sourceId: "codex-pr",
              outcome: "clean",
              vehicle: unrelatedVehicle,
            }),
          ],
        },
      },
      {
        version: 1,
        state: {
          schemaVersion: 1,
          semanticsVersion: "review-operation/v1",
          operationId: "lane-progress/current",
          updatedAt: "2026-08-27T12:01:00.000Z",
          kind: "lane-progress",
          lane: "standard",
          repositoryId: "repo-1",
          lineage: {
            kind: "delivery-member",
            planId: deliveryVehicle.planId,
            workUnitId: deliveryVehicle.workUnitId,
            deliverableId: deliveryVehicle.deliverableId,
          },
          completedPasses: 0,
          attempts: [hostedProgressAttempt({
            attemptId: "attempt-current",
            sourceId: "coderabbit-pr",
            outcome: "rate-limited",
            vehicle: deliveryVehicle,
          })],
        },
      },
    ],
  };
}

describe("hosted reservation admission", () => {
  it("counts exact member passes across heads without borrowing coincident progress", () => {
    expect(projectHostedReservationPolicyProgress({
      snapshot: memberProgressSnapshot(),
      repositoryId: "repo-1",
      target: { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head },
      vehicle: deliveryVehicle,
    })).toEqual({
      status: "complete",
      completedPasses: 1,
      completePasses: 1,
      attempts: [{ sourceId: "coderabbit-pr", outcome: "rate-limited" }],
      attemptHistory: [
        expect.objectContaining({
          updatedAt: "2026-08-27T12:00:00.000Z",
          headSha: "d".repeat(40),
          sourceId: "coderabbit-pr",
          outcome: "settled-findings",
        }),
        expect.objectContaining({
          updatedAt: "2026-08-27T12:01:00.000Z",
          headSha: deliveryVehicle.head,
          sourceId: "coderabbit-pr",
          outcome: "rate-limited",
        }),
      ],
    });
  });

  it("retains two incremental findings passes without claiming complete coverage", () => {
    const snapshot: ReviewOperationStateSnapshot = {
      status: "complete",
      records: [{
        version: 1,
        state: {
          schemaVersion: 1,
          semanticsVersion: "review-operation/v1",
          operationId: "lane-progress/two-settled-passes",
          updatedAt: "2026-08-27T12:00:00.000Z",
          kind: "lane-progress",
          lane: "standard",
          repositoryId: "repo-1",
          lineage: {
            kind: "delivery-member",
            planId: deliveryVehicle.planId,
            workUnitId: deliveryVehicle.workUnitId,
            deliverableId: deliveryVehicle.deliverableId,
          },
          completedPasses: 2,
          attempts: [
            hostedProgressAttempt({
              attemptId: "attempt-pass-1",
              sourceId: "coderabbit-pr",
              outcome: "settled-findings",
              vehicle: deliveryVehicle,
              requestedCoverage: "incremental",
              effectiveCoverage: "incremental",
              logicalPass: 2,
            }),
            hostedProgressAttempt({
              attemptId: "attempt-pass-2",
              sourceId: "coderabbit-pr",
              outcome: "settled-findings",
              vehicle: deliveryVehicle,
              requestedCoverage: "incremental",
              effectiveCoverage: "incremental",
            }),
          ],
        },
      }],
    };

    expect(projectHostedReservationPolicyProgress({
      snapshot,
      repositoryId: "repo-1",
      target: { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head },
      vehicle: deliveryVehicle,
    })).toMatchObject({
      status: "complete",
      completedPasses: 2,
      completePasses: 0,
      attempts: [
        {
          sourceId: "coderabbit-pr",
          outcome: "findings",
          reviewOperationId: "attempt-pass-1",
        },
        {
          sourceId: "coderabbit-pr",
          outcome: "findings",
          reviewOperationId: "attempt-pass-2",
        },
      ],
      attemptHistory: [
        { sourceId: "coderabbit-pr", outcome: "settled-findings" },
        { sourceId: "coderabbit-pr", outcome: "settled-findings" },
      ],
    });

  });

  it("derives the active pass tail from durable time rather than snapshot record order", () => {
    const snapshot: ReviewOperationStateSnapshot = {
      status: "complete",
      records: [
        {
          version: 1,
          state: {
            schemaVersion: 1,
            semanticsVersion: "review-operation/v1",
            operationId: "lane-progress/newer-settlement",
            updatedAt: "2026-08-27T12:02:00.000Z",
            kind: "lane-progress",
            lane: "standard",
            repositoryId: "repo-1",
            lineage: {
              kind: "delivery-member",
              planId: deliveryVehicle.planId,
              workUnitId: deliveryVehicle.workUnitId,
              deliverableId: deliveryVehicle.deliverableId,
            },
            completedPasses: 1,
            attempts: [hostedProgressAttempt({
              attemptId: "attempt-settled",
              sourceId: "coderabbit-pr",
              outcome: "settled-findings",
              vehicle: deliveryVehicle,
            })],
          },
        },
        {
          version: 1,
          state: {
            schemaVersion: 1,
            semanticsVersion: "review-operation/v1",
            operationId: "lane-progress/older-unavailability",
            updatedAt: "2026-08-27T12:01:00.000Z",
            kind: "lane-progress",
            lane: "standard",
            repositoryId: "repo-1",
            lineage: {
              kind: "delivery-member",
              planId: deliveryVehicle.planId,
              workUnitId: deliveryVehicle.workUnitId,
              deliverableId: deliveryVehicle.deliverableId,
            },
            completedPasses: 0,
            attempts: [hostedProgressAttempt({
              attemptId: "attempt-unavailable",
              sourceId: "coderabbit-pr",
              outcome: "rate-limited",
              vehicle: deliveryVehicle,
            })],
          },
        },
      ],
    };

    expect(projectHostedReservationPolicyProgress({
      snapshot,
      repositoryId: "repo-1",
      target: { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head },
      vehicle: deliveryVehicle,
    })).toMatchObject({
      status: "complete",
      completedPasses: 1,
      completePasses: 1,
      attempts: [
        { sourceId: "coderabbit-pr", outcome: "rate-limited" },
        {
          sourceId: "coderabbit-pr",
          outcome: "findings",
          reviewOperationId: "attempt-settled",
        },
      ],
      attemptHistory: [
        { updatedAt: "2026-08-27T12:01:00.000Z", outcome: "rate-limited" },
        { updatedAt: "2026-08-27T12:02:00.000Z", outcome: "settled-findings" },
      ],
    });
  });

  it("retains delegated-agent coverage while counting its moved-head pass", () => {
    const priorHead = "d".repeat(40);
    const localTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-member",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: "a".repeat(40),
      diffBaseTree: "b".repeat(40),
      headSha: priorHead,
      headTree: "c".repeat(40),
    });
    const snapshot: ReviewOperationStateSnapshot = {
      status: "complete",
      records: [{
        version: 1,
        state: {
          schemaVersion: 1,
          semanticsVersion: "review-operation/v1",
          operationId: "lane-progress/local-prior",
          updatedAt: "2026-08-27T12:00:00.000Z",
          kind: "lane-progress",
          lane: "standard",
          repositoryId: "repo-1",
          lineage: {
            kind: "delivery-member",
            planId: deliveryVehicle.planId,
            workUnitId: deliveryVehicle.workUnitId,
            deliverableId: deliveryVehicle.deliverableId,
          },
          completedPasses: 1,
          attempts: [{
            attemptId: "local-review-1",
            logicalPass: 1,
            retryGeneration: 0,
            changeRequestId: null,
            headSha: priorHead,
            terminalProducer: true,
            sourceId: "delegated-agent",
            outcome: "clean",
            local: {
              operationId: "local-review-1",
              requestId: canonicalDigest({ request: "local-review-1" }),
              vehicle: { kind: "delivery-member", identity: deliveryVehicle.deliverableId },
              target: localTarget,
              requestedCoverage: "incremental",
              effectiveCoverage: "incremental",
              scopeMode: "whole-target",
              deliveryAdmission: delegatedAdmission(DeliveryReviewMemberVehicleSchema.parse({
                ...deliveryVehicle,
                head: priorHead,
              })),
            },
          }],
        },
      }],
    };

    expect(projectHostedReservationPolicyProgress({
      snapshot,
      repositoryId: "repo-1",
      target: { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head },
      vehicle: deliveryVehicle,
    })).toEqual({
      status: "complete",
      completedPasses: 1,
      completePasses: 0,
      attempts: [],
      attemptHistory: [expect.objectContaining({
        updatedAt: "2026-08-27T12:00:00.000Z",
        headSha: priorHead,
        sourceId: "delegated-agent",
        outcome: "clean",
        requestedCoverage: "incremental",
        effectiveCoverage: "incremental",
      })],
    });
  });

  it("counts a provider-upgraded supplemental review as a complete member pass", () => {
    const snapshot: ReviewOperationStateSnapshot = {
      status: "complete",
      records: [{
        version: 1,
        state: {
          schemaVersion: 1,
          semanticsVersion: "review-operation/v1",
          operationId: "lane-progress/upgraded-current",
          updatedAt: "2026-08-27T12:00:00.000Z",
          kind: "lane-progress",
          lane: "standard",
          repositoryId: "repo-1",
          lineage: {
            kind: "delivery-member",
            planId: deliveryVehicle.planId,
            workUnitId: deliveryVehicle.workUnitId,
            deliverableId: deliveryVehicle.deliverableId,
          },
          completedPasses: 1,
          attempts: [hostedProgressAttempt({
            attemptId: "attempt-upgraded",
            sourceId: "coderabbit-pr",
            outcome: "clean",
            vehicle: deliveryVehicle,
            requestedCoverage: "incremental",
            effectiveCoverage: "complete",
          })],
        },
      }],
    };

    expect(projectHostedReservationPolicyProgress({
      snapshot,
      repositoryId: "repo-1",
      target: { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head },
      vehicle: deliveryVehicle,
    })).toEqual({
      status: "complete",
      completedPasses: 1,
      completePasses: 1,
      attempts: [{
        sourceId: "coderabbit-pr",
        outcome: "clean",
        reviewOperationId: "attempt-upgraded",
      }],
      attemptHistory: [expect.objectContaining({
        updatedAt: "2026-08-27T12:00:00.000Z",
        headSha: deliveryVehicle.head,
        sourceId: "coderabbit-pr",
        outcome: "clean",
        requestedCoverage: "incremental",
        effectiveCoverage: "complete",
      })],
    });
  });

  it("counts an incremental review separately from complete member coverage", () => {
    const snapshot: ReviewOperationStateSnapshot = {
      status: "complete",
      records: [{
        version: 1,
        state: {
          schemaVersion: 1,
          semanticsVersion: "review-operation/v1",
          operationId: "lane-progress/incremental-current",
          updatedAt: "2026-08-31T18:00:00.000Z",
          kind: "lane-progress",
          lane: "standard",
          repositoryId: "repo-1",
          lineage: {
            kind: "delivery-member",
            planId: deliveryVehicle.planId,
            workUnitId: deliveryVehicle.workUnitId,
            deliverableId: deliveryVehicle.deliverableId,
          },
          completedPasses: 1,
          attempts: [hostedProgressAttempt({
            attemptId: "attempt-incremental",
            sourceId: "coderabbit-pr",
            outcome: "clean",
            vehicle: deliveryVehicle,
            requestedCoverage: "incremental",
            effectiveCoverage: "incremental",
          })],
        },
      }],
    };

    expect(projectHostedReservationPolicyProgress({
      snapshot,
      repositoryId: "repo-1",
      target: { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head },
      vehicle: deliveryVehicle,
    })).toEqual({
      status: "complete",
      completedPasses: 1,
      completePasses: 0,
      attempts: [{
        sourceId: "coderabbit-pr",
        outcome: "clean",
        reviewOperationId: "attempt-incremental",
      }],
      attemptHistory: [expect.objectContaining({
        updatedAt: "2026-08-31T18:00:00.000Z",
        headSha: deliveryVehicle.head,
        sourceId: "coderabbit-pr",
        outcome: "clean",
        requestedCoverage: "incremental",
        effectiveCoverage: "incremental",
      })],
    });
  });

  it("retains hosted fallback and local terminal history for one logical pass", () => {
    const localTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "delivery-member",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: "a".repeat(40),
      diffBaseTree: "b".repeat(40),
      headSha: deliveryVehicle.head,
      headTree: "c".repeat(40),
    });
    const snapshot: ReviewOperationStateSnapshot = {
      status: "complete",
      records: [{
        version: 1,
        state: {
          schemaVersion: 1,
          semanticsVersion: "review-operation/v1",
          operationId: "lane-progress/mixed-fallback",
          updatedAt: "2026-08-31T18:05:00.000Z",
          kind: "lane-progress",
          lane: "standard",
          repositoryId: "repo-1",
          lineage: {
            kind: "delivery-member",
            planId: deliveryVehicle.planId,
            workUnitId: deliveryVehicle.workUnitId,
            deliverableId: deliveryVehicle.deliverableId,
          },
          completedPasses: 1,
          attempts: [
            hostedProgressAttempt({
              attemptId: "attempt-hosted-unavailable",
              sourceId: "coderabbit-pr",
              outcome: "rate-limited",
              vehicle: deliveryVehicle,
            }),
            {
              attemptId: "attempt-local-clean",
              logicalPass: 1,
              retryGeneration: 0,
              changeRequestId: null,
              headSha: deliveryVehicle.head,
              terminalProducer: true,
              sourceId: "delegated-agent",
              outcome: "clean",
              local: {
                operationId: "attempt-local-clean",
                requestId: canonicalDigest({ request: "attempt-local-clean" }),
                vehicle: { kind: "delivery-member", identity: deliveryVehicle.deliverableId },
                target: localTarget,
                requestedCoverage: "incremental",
                effectiveCoverage: "incremental",
                scopeMode: "whole-target",
                deliveryAdmission: delegatedAdmission(deliveryVehicle),
              },
            },
          ],
        },
      }],
    };

    expect(projectHostedReservationPolicyProgress({
      snapshot,
      repositoryId: "repo-1",
      target: { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head },
      vehicle: deliveryVehicle,
    })).toMatchObject({
      status: "complete",
      completedPasses: 1,
      completePasses: 0,
      attempts: [
        { sourceId: "coderabbit-pr", outcome: "rate-limited" },
        {
          sourceId: "delegated-agent",
          outcome: "clean",
          reviewOperationId: "attempt-local-clean",
        },
      ],
      attemptHistory: [
        { sourceId: "coderabbit-pr", outcome: "rate-limited" },
        {
          sourceId: "delegated-agent",
          outcome: "clean",
          requestedCoverage: "incremental",
          effectiveCoverage: "incremental",
        },
      ],
    });
  });

  it("admits the next member pass from selector-qualified lineage progress", () => {
    const result = resolveHostedReservationPolicy({
      reservation: deliveryReservation,
      snapshot: memberProgressSnapshot(),
      repositoryId: "repo-1",
      target: { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head },
      vehicle: deliveryVehicle,
      maxPasses: 2,
    });

    expect(result).toMatchObject({
      status: "resolved",
      policy: {
        state: "ready",
        nextAction: "hosted-request",
        payload: { sourceId: "codex-pr", pass: 2, maxPasses: 2 },
      },
    });
  });

  it("selects the delegated carrier for an exact chunked member scope", () => {
    const target = { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head };
    const result = resolveHostedReservationPolicy({
      reservation: {
        ...deliveryReservation,
        sources: ["coderabbit-pr", "codex-pr", "delegated-agent"],
      },
      snapshot: { status: "complete", records: [] },
      repositoryId: "repo-1",
      target,
      vehicle: deliveryVehicle,
      maxPasses: 2,
      scopeSelection: { mode: "chunked", target },
    });

    expect(result).toMatchObject({
      status: "resolved",
      policy: {
        state: "ready",
        nextAction: "local-prepare",
        payload: {
          scope: "chunked",
          sourceId: "delegated-agent",
          ineligibleSources: ["coderabbit-pr", "codex-pr"],
        },
      },
    });
  });

  it("retains a whole-target refusal while starting the selected chunked carrier", () => {
    const target = { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head };
    const result = resolveHostedReservationPolicy({
      reservation: {
        ...deliveryReservation,
        sources: ["coderabbit-pr", "codex-pr", "delegated-agent"],
      },
      snapshot: memberProgressSnapshot(),
      repositoryId: "repo-1",
      target,
      vehicle: deliveryVehicle,
      maxPasses: 2,
      scopeSelection: { mode: "chunked", target },
    });

    expect(result).toMatchObject({
      status: "resolved",
      policy: {
        state: "ready",
        nextAction: "local-prepare",
        payload: {
          scope: "chunked",
          sourceId: "delegated-agent",
          pass: 2,
          attemptedSources: [{ sourceId: "coderabbit-pr", outcome: "rate-limited" }],
          ineligibleSources: ["coderabbit-pr", "codex-pr"],
        },
      },
    });
  });

  it("applies an explicit source only to the current member-policy invocation", () => {
    const input = {
      reservation: deliveryReservation,
      snapshot: { status: "complete", records: [] } as ReviewOperationStateSnapshot,
      repositoryId: "repo-1",
      target: { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head },
      vehicle: deliveryVehicle,
      maxPasses: 2,
    };

    expect(resolveHostedReservationPolicy({
      ...input,
      invocation: { mode: "force", sourceId: "codex-pr" },
    })).toMatchObject({
      status: "resolved",
      policy: {
        state: "ready",
        nextAction: "hosted-request",
        payload: { sourceId: "codex-pr" },
      },
    });
    expect(resolveHostedReservationPolicy(input)).toMatchObject({
      status: "resolved",
      policy: {
        state: "ready",
        nextAction: "hosted-request",
        payload: { sourceId: "coderabbit-pr" },
      },
    });
  });

  it("refuses unconfigured and progress-reversing source invocations", () => {
    const input = {
      reservation: deliveryReservation,
      snapshot: { status: "complete", records: [] } as ReviewOperationStateSnapshot,
      repositoryId: "repo-1",
      target: { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head },
      vehicle: deliveryVehicle,
      maxPasses: 2,
    };

    expect(() => resolveHostedReservationPolicy({
      ...input,
      invocation: { mode: "force", sourceId: "other-pr" },
    })).toThrow(/configured standard-review source/u);
    expect(() => resolveHostedReservationPolicy({
      ...input,
      requestAttempts: [{ sourceId: "codex-pr", outcome: "rate-limited" }],
      invocation: { mode: "force", sourceId: "coderabbit-pr" },
    })).toThrow(/cannot precede recorded source progress/u);
  });

  it("preserves an applicable safe-unavailability prefix when the member head moves", async () => {
    const priorVehicle = { ...deliveryVehicle, head: "d".repeat(40) };
    const snapshot: ReviewOperationStateSnapshot = {
      status: "complete",
      records: [{
        version: 1,
        state: {
          schemaVersion: 1,
          semanticsVersion: "review-operation/v1",
          operationId: "lane-progress/prior-safe-unavailability",
          updatedAt: "2026-08-27T12:00:00.000Z",
          kind: "lane-progress",
          lane: "standard",
          repositoryId: "repo-1",
          lineage: {
            kind: "delivery-member",
            planId: priorVehicle.planId,
            workUnitId: priorVehicle.workUnitId,
            deliverableId: priorVehicle.deliverableId,
          },
          completedPasses: 0,
          attempts: [hostedProgressAttempt({
            attemptId: "attempt-prior-unavailable",
            sourceId: "coderabbit-pr",
            outcome: "rate-limited",
            vehicle: priorVehicle,
          })],
        },
      }],
    };
    const discharge = await projectHostedReservationDischarge({
      reservation: deliveryReservation,
      span: [deliveryVehicle.head],
      target: {
        repository: "owner/repo",
        pullRequest: 42,
        headSha: deliveryVehicle.head,
        vehicle: deliveryVehicle,
      },
      readLaneProgress: async () => ({ status: "unrecorded" }),
      readEarlierAttemptApplicability: async (sourceId) => sourceId === "coderabbit-pr"
        ? {
            status: "complete",
            attempts: [{
              operationId: "lane-progress/prior-safe-unavailability",
              attemptId: "attempt-prior-unavailable",
              logicalPass: 1,
              updatedAt: "2026-08-27T12:00:00.000Z",
              sourceId,
              outcome: "rate-limited",
              requestedCoverage: "complete",
              effectiveCoverage: null,
              scopeMode: "whole-target",
              applicability: "retain-prior-attempt",
            }],
          }
        : { status: "not-found" },
      resolveTerminalPolicy: async () => {
        throw new Error("not reached");
      },
      resolveEarlierTerminalPolicy: async () => {
        throw new Error("not reached");
      },
    });
    const result = resolveHostedReservationPolicy({
      reservation: deliveryReservation,
      snapshot,
      repositoryId: "repo-1",
      target: { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head },
      vehicle: deliveryVehicle,
      maxPasses: 2,
      requestAttempts: discharge.requestAttempts,
    });

    expect(discharge).toMatchObject({
      discharged: false,
      nextSource: "codex-pr",
      requestAttempts: [{ sourceId: "coderabbit-pr", outcome: "rate-limited" }],
    });
    expect(result).toMatchObject({
      status: "resolved",
      policy: {
        state: "ready",
        nextAction: "hosted-request",
        payload: { sourceId: "codex-pr", pass: 1 },
      },
    });
  });

  it("rechecks the member pass ceiling immediately before hosted capacity is spent", () => {
    const input = {
      reservation: deliveryReservation,
      snapshot: memberProgressSnapshot(),
      repositoryId: "repo-1",
      target: { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head },
      vehicle: deliveryVehicle,
      provider: "codex-pr",
      coverage: "complete" as const,
      maxPasses: 1,
    };

    expect(() => assertHostedReservationPolicyAdmission(input)).toThrow(/approval-required/u);
    expect(() => assertHostedReservationPolicyAdmission({
      ...input,
      ceilingOverride: {
        target: input.target,
        lane: "standard",
        exhaustedPassCount: 1,
        nextPass: 2,
      },
    })).not.toThrow();
  });

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

  it("admits the preferred source before any attempt", () => {
    expect(firstAdmissibleHostedSource(reservation, [])).toBe("coderabbit-pr");
  });

  it("admits the next source only after the ordered prefix is safely unavailable", () => {
    const attempts = [{ sourceId: "coderabbit-pr", outcome: "rate-limited" }];
    expect(firstAdmissibleHostedSource(reservation, attempts)).toBe("codex-pr");
    expect(() => assertHostedReservationAdmission({
      reservation,
      provider: "codex-pr",
      repository: "owner/repo",
      headSha: CURRENT_HEAD,
      targetKind: "change-set",
      attempts,
      ...binding,
    })).not.toThrow();
  });

  it("uses the shared applicability action before spending hosted capacity", () => {
    expect(() => assertHostedReservationAdmission({
      reservation,
      provider: "coderabbit-pr",
      repository: "owner/repo",
      headSha: CURRENT_HEAD,
      targetKind: "change-set",
      attempts: [],
      applicabilityAction: "retain-prior-attempt",
      ...binding,
    })).toThrow(/prior attempt remains applicable/u);
    expect(() => assertHostedReservationAdmission({
      reservation,
      provider: "coderabbit-pr",
      repository: "owner/repo",
      headSha: CURRENT_HEAD,
      targetKind: "change-set",
      attempts: [],
      applicabilityAction: "stop",
      ...binding,
    })).toThrow(/applicability is unresolved/u);
    expect(() => assertHostedReservationAdmission({
      reservation,
      provider: "coderabbit-pr",
      repository: "owner/repo",
      headSha: CURRENT_HEAD,
      targetKind: "change-set",
      attempts: [],
      applicabilityAction: "request-review",
      ...binding,
    })).not.toThrow();
  });

  it("admits a current Candidate after the publication-only head advance", () => {
    expect(reservation.target.kind).toBe("pinned-head");
    if (reservation.target.kind !== "pinned-head") throw new Error("expected pinned fixture");
    expect(reservation.target.headSha).not.toBe(CURRENT_HEAD);
    expect(() => assertHostedReservationAdmission({
      reservation,
      provider: "coderabbit-pr",
      repository: "owner/repo",
      headSha: CURRENT_HEAD,
      targetKind: "change-set",
      attempts: [],
      ...binding,
    })).not.toThrow();
  });

  it("admits an exact delivery member under the originating Candidate authority", () => {
    expect(() => assertHostedReservationAdmission({
      reservation: deliveryReservation,
      provider: "coderabbit-pr",
      repository: "owner/repo",
      headSha: deliveryVehicle.head,
      targetKind: "delivery-member",
      vehicle: deliveryVehicle,
      attempts: [],
      ...binding,
    })).not.toThrow();
  });

  it("keeps safe-unavailability progress independent for each exact delivery member", () => {
    const otherVehicle = {
      ...deliveryVehicle,
      deliverableId: `sha256:${"1".repeat(64)}`,
    };
    const attempts = [{
      sourceId: "coderabbit-pr",
      outcome: "rate-limited",
      hosted: {
        target: { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head },
        vehicle: deliveryVehicle,
      },
    }];
    const currentMemberAttempts = hostedReservationAttemptsForTarget({
      attempts,
      target: { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head },
      vehicle: deliveryVehicle,
    });
    const otherMemberAttempts = hostedReservationAttemptsForTarget({
      attempts,
      target: { repository: "owner/repo", pullRequest: 42, headSha: deliveryVehicle.head },
      vehicle: otherVehicle,
    });

    expect(() => assertHostedReservationAdmission({
      reservation: deliveryReservation,
      provider: "codex-pr",
      repository: "owner/repo",
      headSha: deliveryVehicle.head,
      targetKind: "delivery-member",
      vehicle: deliveryVehicle,
      attempts: currentMemberAttempts,
      ...binding,
    })).not.toThrow();
    expect(() => assertHostedReservationAdmission({
      reservation: deliveryReservation,
      provider: "codex-pr",
      repository: "owner/repo",
      headSha: otherVehicle.head,
      targetKind: "delivery-member",
      vehicle: otherVehicle,
      attempts: otherMemberAttempts,
      ...binding,
    })).toThrow(/requires `coderabbit-pr` next/u);
  });

  it("excludes a delivery-member attempt from singleton source ordering", () => {
    expect(hostedReservationAttemptsForTarget({
      attempts: [{
        sourceId: "coderabbit-pr",
        outcome: "rate-limited",
        hosted: {
          target: { repository: "owner/repo", pullRequest: 42, headSha: CURRENT_HEAD },
          vehicle: { ...deliveryVehicle, head: CURRENT_HEAD },
        },
      }],
      target: { repository: "owner/repo", pullRequest: 42, headSha: CURRENT_HEAD },
    })).toEqual([]);
  });

  it("rejects a delivery member reconstructed under a different plan", () => {
    expect(() => assertHostedReservationAdmission({
      reservation: deliveryReservation,
      provider: "coderabbit-pr",
      repository: "owner/repo",
      headSha: deliveryVehicle.head,
      targetKind: "delivery-member",
      vehicle: {
        ...deliveryVehicle,
        planId: "123e4567-e89b-12d3-a456-426614174001",
      },
      attempts: [],
      ...binding,
    })).toThrow(/reservation vehicle/u);
  });

  it("rejects a direct lower-source request when the preferred source has no safe attempt", () => {
    expect(() => assertHostedReservationAdmission({
      reservation,
      provider: "codex-pr",
      repository: "owner/repo",
      headSha: CURRENT_HEAD,
      targetKind: "change-set",
      attempts: [],
      ...binding,
    })).toThrow(/requires `coderabbit-pr` next/u);
  });

  it("admits a carried reservation after an approved Candidate subject advance", () => {
    expect(() => assertHostedReservationAdmission({
      reservation,
      provider: "coderabbit-pr",
      repository: "owner/repo",
      headSha: CURRENT_HEAD,
      targetKind: "change-set",
      attempts: [],
      ...binding,
      candidate: { ...binding.candidate, subjectDigest: `sha256:${"f".repeat(64)}` },
    })).not.toThrow();
  });

  it("does not treat a mixed or terminal history as safe fallback evidence", () => {
    expect(firstAdmissibleHostedSource(reservation, [
      { sourceId: "coderabbit-pr", outcome: "rate-limited" },
      { sourceId: "coderabbit-pr", outcome: "terminal-failure" },
    ])).toBe("coderabbit-pr");
  });

  it("admits hosted progress from the exact active Errand without Candidate state", () => {
    expect(() => assertHostedErrandAdmission({
      binding: errandBinding,
      current: {
        key: "review-errand",
        claimId: "claim-1",
        branch: "chore/review-errand",
      },
      provider: "coderabbit-pr",
      attempts: [],
    })).not.toThrow();
  });

  it("preserves ordered fallback for Errand-hosted progress", () => {
    expect(() => assertHostedErrandAdmission({
      binding: errandBinding,
      current: {
        key: "review-errand",
        claimId: "claim-1",
        branch: "chore/review-errand",
      },
      provider: "codex-pr",
      attempts: [{ sourceId: "coderabbit-pr", outcome: "transient-unavailable" }],
    })).not.toThrow();
  });

  it("derives and admits an exact configured suffix for explicit Errand selection", () => {
    expect(configuredSourceSuffix(errandBinding.sources, "codex-pr")).toEqual(["codex-pr"]);
    expect(() => assertHostedErrandBindingAuthority({
      binding: { ...errandBinding, sources: ["codex-pr"] },
      configuredSources: errandBinding.sources,
      rubricIdentity: {
        version: errandBinding.standardReview.rubricVersion,
        digest: errandBinding.standardReview.rubricDigest,
      },
    })).not.toThrow();
  });

  it("rejects an unavailable selection or an Errand source binding that is not an exact configured suffix", () => {
    expect(() => configuredSourceSuffix(errandBinding.sources, "delegated-agent"))
      .toThrow(/configured standard-review source/u);
    expect(() => assertHostedErrandBindingAuthority({
      binding: { ...errandBinding, sources: ["codex-pr", "coderabbit-pr"] },
      configuredSources: errandBinding.sources,
      rubricIdentity: {
        version: errandBinding.standardReview.rubricVersion,
        digest: errandBinding.standardReview.rubricDigest,
      },
    })).toThrow(/source binding.*configured suffix/u);
  });

  it("rejects an Errand handle whose rubric identity differs from the current rubric", () => {
    expect(() => assertHostedErrandBindingAuthority({
      binding: {
        ...errandBinding,
        standardReview: {
          ...errandBinding.standardReview,
          rubricDigest: `sha256:${"f".repeat(64)}`,
        },
      },
      configuredSources: errandBinding.sources,
      rubricIdentity: {
        version: errandBinding.standardReview.rubricVersion,
        digest: errandBinding.standardReview.rubricDigest,
      },
    })).toThrow(/rubric binding does not match/u);
  });
});
