/** Idempotent execution of persisted integration settlement plans. */

import { describe, expect, it } from "vitest";

import { responsePolicyRequestFixture } from "../../../fixtures/review-response-policy.js";

import {
  executeSettlementPlan,
  type SettlementExecutionDependencies,
} from "../../../../src/scripts/integration/settlement-execution.js";
import {
  composeCanonicalSettlementPlan,
  composeCandidateResponseConfirmationAction,
  composeHostedSettlementAction,
} from "../../../../src/scripts/integration/settlement-plan.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../src/scripts/review-gate/core/dispositions.js";
import { createReviewTarget } from "../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  composeReviewResponseSettlementAction,
} from "../../../../src/scripts/review-gate/core/response-plan.js";

const oid = (character: string): string => character.repeat(40);
const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;

function reviewResponseAction() {
  const targetInput = {
    schemaVersion: 2 as const,
    semanticsVersion: "review-gate/v2" as const,
    kind: "change-set" as const,
    repositoryId: "owner/repo",
    baseRef: "main",
    diffBaseSha: oid("a"),
    diffBaseTree: oid("b"),
    headSha: oid("c"),
    headTree: oid("d"),
  };
  const originTarget = createReviewTarget(targetInput);
  const fixTarget = createReviewTarget({ ...targetInput, headSha: oid("e"), headTree: oid("f") });
  const dispositions = approveDispositionState({
    proposed: proposeDispositionSet(createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: originTarget.targetId,
      producerId: "settlement-operation",
      resultDigest: digest("3"),
      policyVersion: digest("1"),
      rubricVersion: "standard-review/v1",
      rubricDigest: digest("2"),
      proposedBy: "review-runtime",
      proposedVerification: "full",
      findings: [{
        findingId: "finding-1",
        sourceIdentity: "reviewer",
        locus: "src/example.ts:1",
        sourceVerification: "verified",
        verificationRefs: ["receipt:1"],
        reportedSeverity: "major",
        verifiedSeverity: "major",
        disposition: "fix",
        rationale: "The finding is supported.",
        recommendation: "Apply the bounded correction.",
        openQuestions: [],
      }],
    })),
    approvedBy: "andrew",
    approvedAt: "2026-08-15T02:00:00Z",
  });
  return composeReviewResponseSettlementAction({
    originTarget,
    fixTarget,
    request: {
      schemaVersion: 1,
      source: { kind: "attested-local", receiptRef: "local:operation:receipt" },
      policyRequest: responsePolicyRequestFixture({
        headSha: originTarget.headSha,
        reviewOperationId: "settlement-operation",
      }),
      dispositions,
    },
  });
}

function hostedAction(character: string) {
  return composeHostedSettlementAction({
    dispositionId: digest(character),
    request: {
      schemaVersion: 1,
      response: {
        attemptRef: `hosted-attempt-${character}`,
        dispositionSetId: digest(character),
        findingId: `finding-${character}`,
      },
      target: { repository: "owner/repo", pullRequest: 42, headSha: oid("a") },
      fixTarget: null,
      actorIdentity: "andrew",
      finding: { commentId: `comment-${character}`, threadId: `thread-${character}` },
      disposition: "defer",
      reply: `Deferred ${character}.`,
    },
  });
}

function candidateConfirmationAction() {
  return composeCandidateResponseConfirmationAction({
    dispositionId: digest("1"),
    operationId: digest("2"),
    workUnit: "example",
    candidateId: digest("3"),
    responseId: digest("4"),
    memberTargetId: digest("5"),
    candidateOriginTargetId: digest("6"),
    deliveryMember: {
      kind: "delivery-member",
      planId: "573a0507-31a0-478d-b2cb-bd2a849e787b",
      deliverableId: digest("7"),
      workUnitId: "example",
      head: oid("8"),
    },
    approvedBase: oid("a"),
  });
}

describe("integration settlement execution", () => {
  it("confirms an existing Candidate response without replaying either review channel", async () => {
    const action = candidateConfirmationAction();
    const plan = composeCanonicalSettlementPlan([action]);
    const dependencies: SettlementExecutionDependencies = {
      settleHosted: () => Promise.reject(new Error("unexpected hosted settlement")),
      settleReviewResponse: () => Promise.reject(new Error("unexpected review-response replay")),
      confirmCandidateResponse: async () => ({ state: "confirmed" }),
    };

    await expect(executeSettlementPlan(plan, dependencies)).resolves.toEqual({
      state: "settled",
      completedActions: 1,
    });
    await expect(executeSettlementPlan(plan, {
      ...dependencies,
      confirmCandidateResponse: async () => ({ state: "invalidated", reason: "stale" }),
    })).resolves.toEqual({
      state: "invalidated",
      reason: "stale",
      dispositionId: action.dispositionId,
      completedActions: 0,
    });
  });

  it("resumes a partially settled plan without duplicate effects", async () => {
    const plan = composeCanonicalSettlementPlan([hostedAction("b"), hostedAction("c")]);
    const settled = new Set<string>();
    let effects = 0;
    let interrupt = true;
    const dependencies: SettlementExecutionDependencies = {
      settleHosted: async (request) => {
        if (request.finding.threadId === "thread-c" && interrupt) {
          return {
            schemaVersion: 1,
            mode: "review-hosted-settle",
            response: request.response,
            disposition: request.disposition,
            threadId: request.finding.threadId,
            state: "stale-target",
            nextAction: "stop",
          };
        }
        if (settled.has(request.finding.threadId)) {
          return {
            schemaVersion: 1,
            mode: "review-hosted-settle",
            response: request.response,
            disposition: request.disposition,
            threadId: request.finding.threadId,
            state: "already-settled",
            nextAction: "complete",
            replyId: `reply-${request.finding.threadId}`,
          };
        }
        settled.add(request.finding.threadId);
        effects += 1;
        return {
          schemaVersion: 1,
          mode: "review-hosted-settle",
          response: request.response,
          disposition: request.disposition,
          threadId: request.finding.threadId,
          state: "settled",
          nextAction: "complete",
          replyId: `reply-${request.finding.threadId}`,
        };
      },
      settleReviewResponse: async () => ({ state: "settled" }),
      confirmCandidateResponse: () => Promise.reject(new Error("unexpected Candidate response confirmation")),
    };

    await expect(executeSettlementPlan(plan, dependencies)).resolves.toMatchObject({
      state: "invalidated",
      reason: "stale",
      completedActions: 1,
    });
    interrupt = false;
    await expect(executeSettlementPlan(plan, dependencies)).resolves.toEqual({
      state: "settled",
      completedActions: 2,
    });
    expect(effects).toBe(2);
  });

  it.each([
    ["missing-thread", "missing"],
    ["missing-comment", "missing"],
    ["stale-target", "stale"],
    ["ambiguous", "ambiguous"],
    ["actor-mismatch", "actor-mismatched"],
  ] as const)("maps hosted %s to the %s invalidation", async (state, reason) => {
    const action = hostedAction("d");
    const dependencies: SettlementExecutionDependencies = {
      settleHosted: async (request) => ({
        schemaVersion: 1,
        mode: "review-hosted-settle",
        response: request.response,
        disposition: action.request.disposition,
        threadId: action.request.finding.threadId,
        state,
        nextAction: "stop",
      }),
      settleReviewResponse: async () => ({ state: "settled" }),
      confirmCandidateResponse: () => Promise.reject(new Error("unexpected Candidate response confirmation")),
    };

    await expect(executeSettlementPlan(
      composeCanonicalSettlementPlan([action]),
      dependencies,
    )).resolves.toMatchObject({ state: "invalidated", reason, completedActions: 0 });
  });

  it("hands the review-response executor the head its approved fixes settled at", async () => {
    const action = reviewResponseAction();
    const seen: unknown[] = [];
    const dependencies: SettlementExecutionDependencies = {
      settleHosted: () => Promise.reject(new Error("unexpected hosted settlement")),
      settleReviewResponse: async (input) => {
        seen.push(input);
        return { state: "already-settled" };
      },
      confirmCandidateResponse: () => Promise.reject(new Error("unexpected Candidate response confirmation")),
    };

    await expect(executeSettlementPlan(
      composeCanonicalSettlementPlan([action]),
      dependencies,
    )).resolves.toEqual({ state: "settled", completedActions: 1 });
    expect(seen).toEqual([{ request: action.request, fixTarget: action.fixTarget }]);
  });

  it.each([
    ["stale-target", "stale"],
    ["actor-mismatch", "actor-mismatched"],
    ["missing-record", "missing"],
    ["fix-not-performed", "fix-not-performed"],
    ["ready-to-fix", "ambiguous"],
  ] as const)("maps a review-response %s to the %s invalidation", async (state, reason) => {
    const action = reviewResponseAction();
    const dependencies: SettlementExecutionDependencies = {
      settleHosted: () => Promise.reject(new Error("unexpected hosted settlement")),
      settleReviewResponse: async () => ({ state }),
      confirmCandidateResponse: () => Promise.reject(new Error("unexpected Candidate response confirmation")),
    };

    await expect(executeSettlementPlan(
      composeCanonicalSettlementPlan([action]),
      dependencies,
    )).resolves.toMatchObject({
      state: "invalidated",
      reason,
      dispositionId: action.dispositionId,
      completedActions: 0,
    });
  });
});
