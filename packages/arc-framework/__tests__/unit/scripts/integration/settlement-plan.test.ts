/** Canonical integration settlement-plan behavior. */

import { describe, expect, it } from "vitest";

import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../src/scripts/review-gate/core/dispositions.js";
import { createReviewTarget } from "../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { composeReviewResponseSettlementAction } from "../../../../src/scripts/review-gate/core/response-plan.js";
import {
  composeCanonicalSettlementPlan,
  composeHostedSettlementAction,
} from "../../../../src/scripts/integration/settlement-plan.js";

const oid = (character: string): string => character.repeat(40);
const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;

const TARGET_INPUT = {
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

function target(headSha: string, headTree: string) {
  return createReviewTarget({ ...TARGET_INPUT, headSha, headTree });
}

/** One approved single-finding set over `targetId`, carrying the supplied disposition. */
function approvedSet(targetId: string, disposition: "fix" | "defer") {
  const dispositionSet = createDispositionSet({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    targetId,
    producerId: "settlement-operation",
    resultDigest: digest("3"),
    policyVersion: digest("1"),
    rubricVersion: "standard-review/v1",
    rubricDigest: digest("2"),
    proposedBy: "review-runtime",
    findings: [{
      findingId: "finding-1",
      sourceIdentity: "reviewer",
      locus: "src/example.ts:1",
      sourceVerification: "verified",
      verificationRefs: ["receipt:1"],
      severity: "major",
      disposition,
      rationale: "The finding is supported.",
      recommendation: disposition === "fix"
        ? "Apply the bounded correction."
        : "Carry the correction to a follow-up.",
      openQuestions: [],
    }],
  });
  return {
    dispositionSet,
    request: {
      schemaVersion: 1 as const,
      source: { kind: "frontline" as const, outcomeRef: "frontline:operation:outcome" },
      dispositions: approveDispositionState({
        proposed: proposeDispositionSet(dispositionSet),
        approvedBy: "andrew",
        approvedAt: "2026-08-13T02:00:00Z",
      }),
    },
  };
}

describe("canonical integration settlement plan", () => {
  it("retains every exact hosted-settlement API input", () => {
    const request = {
      schemaVersion: 1 as const,
      response: {
        attemptRef: "hosted-attempt",
        dispositionSetId: digest("c"),
        findingId: "finding-7",
      },
      target: { repository: "owner/repo", pullRequest: 42, headSha: oid("a") },
      fixTarget: { repository: "owner/repo", pullRequest: 42, headSha: oid("b") },
      actorIdentity: "andrew",
      finding: { commentId: "comment-7", threadId: "thread-9" },
      disposition: "fix" as const,
      reply: "Fixed in the exact candidate head.",
    };
    const action = composeHostedSettlementAction({ dispositionId: digest("c"), request });
    const plan = composeCanonicalSettlementPlan([action]);

    expect(plan.actions).toEqual([{
      channel: "hosted",
      dispositionId: digest("c"),
      request,
    }]);
  });

  it("binds local response targets, actors, findings, and approved dispositions", () => {
    const originTarget = target(oid("c"), oid("d"));
    const fixTarget = target(oid("e"), oid("f"));
    const { dispositionSet, request } = approvedSet(originTarget.targetId, "fix");
    const action = composeReviewResponseSettlementAction({ originTarget, fixTarget, request });

    expect(action).toMatchObject({
      channel: "review-response",
      dispositionId: dispositionSet.dispositionSetId,
      originTarget: { targetId: originTarget.targetId },
      fixTarget: { targetId: fixTarget.targetId },
      actors: { approverIdentity: "andrew", proposerIdentity: "review-runtime" },
      findingIds: ["finding-1"],
      request,
    });
  });

  it("settles a set that authorized no fix at its own origin target", () => {
    const originTarget = target(oid("c"), oid("d"));
    const { request } = approvedSet(originTarget.targetId, "defer");

    expect(composeReviewResponseSettlementAction({
      originTarget,
      fixTarget: originTarget,
      request,
    })).toMatchObject({ fixTarget: { targetId: originTarget.targetId } });
  });

  it("refuses a fix-bearing set that settles at its unchanged origin target", () => {
    const originTarget = target(oid("c"), oid("d"));
    const { request } = approvedSet(originTarget.targetId, "fix");

    expect(() => composeReviewResponseSettlementAction({
      originTarget,
      fixTarget: originTarget,
      request,
    })).toThrow(/must be a changed target when fixes exist/u);
  });
});
