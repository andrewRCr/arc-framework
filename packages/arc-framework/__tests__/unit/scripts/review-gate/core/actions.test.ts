import { describe, expect, it } from "vitest";

import {
  deriveReviewGateAction,
  parseReviewGateAction,
} from "../../../../../src/scripts/review-gate/core/next-action.js";
import type { GateProjection, ReviewRequest } from "../../../../../src/scripts/review-gate/core/execution.js";

const HEAD = "a".repeat(40);

function request(): ReviewRequest {
  return {
    schemaVersion: 1,
    repositoryId: "100",
    changeRequestId: "PR_node",
    changeSetId: "b".repeat(64),
    policyVersion: "c".repeat(64),
    semanticsVersion: "review-gate/v1",
    rubricVersion: "independent-analysis/v1",
    requirementId: "analysis",
    sourceIdentity: "codex-pr",
    coverage: "full",
    coverageFromSha: "d".repeat(40),
    coverageThroughSha: HEAD,
    generation: 2,
    actorIdentity: "controller-1",
    requestMechanism: "user-trigger",
    requiredActorIdentity: "7",
    requestCommand: "@codex review the exact head",
  };
}

function projection(conclusion: GateProjection["conclusion"]): GateProjection {
  return {
    schemaVersion: 1,
    conclusion,
    summary: `controller is ${conclusion}`,
    blockers: [],
    requirementExecutions: [],
    receiptRefs: [],
    policyDecision: {
      lane: "reviewed",
      reviewRisk: "sensitive",
      disposition: "required",
      reasons: [],
      policyVersion: "c".repeat(64),
    },
    ciState: "success",
    ledgerVersion: 1,
    evidence: [],
  };
}

describe("neutral next-action contract", () => {
  it("derives and round-trips an exact actor-bound user trigger", () => {
    const action = deriveReviewGateAction({
      repositoryId: "100",
      changeRequestId: "PR_node",
      headSha: HEAD,
      request: request(),
      projection: projection("pending"),
    });
    expect(action).toMatchObject({
      kind: "needs-user-trigger",
      providerIdentity: "codex-pr",
      generation: 2,
      command: "@codex review the exact head",
      requiredActorIdentity: "7",
    });
    expect(parseReviewGateAction(action)).toEqual(action);
  });

  it.each([
    ["pending", "waiting"],
    ["failure", "attention"],
    ["success", "terminal"],
  ] as const)("maps %s controller state to %s", (conclusion, kind) => {
    expect(deriveReviewGateAction({
      repositoryId: "100",
      changeRequestId: "PR_node",
      headSha: HEAD,
      request: null,
      projection: projection(conclusion),
    })).toMatchObject({ kind });
  });

  it("rejects unknown fields and malformed action identity", () => {
    const action = deriveReviewGateAction({
      repositoryId: "100",
      changeRequestId: "PR_node",
      headSha: HEAD,
      request: request(),
      projection: projection("pending"),
    });
    if (action.kind !== "needs-user-trigger") throw new Error("expected a user trigger");
    expect(() => parseReviewGateAction({ ...action, displayCommand: action.command })).toThrow(/unknown field/u);
    expect(() => parseReviewGateAction({ ...action, requestKey: "short" })).toThrow();
  });
});
