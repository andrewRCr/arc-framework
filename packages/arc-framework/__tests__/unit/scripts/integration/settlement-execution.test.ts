/** Idempotent execution of persisted integration settlement plans. */

import { describe, expect, it } from "vitest";

import {
  executeSettlementPlan,
  type SettlementExecutionDependencies,
} from "../../../../src/scripts/integration/settlement-execution.js";
import {
  composeCanonicalSettlementPlan,
  composeHostedSettlementAction,
} from "../../../../src/scripts/integration/settlement-plan.js";

const oid = (character: string): string => character.repeat(40);
const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;

function hostedAction(character: string) {
  return composeHostedSettlementAction({
    dispositionId: digest(character),
    request: {
      schemaVersion: 1,
      target: { repository: "owner/repo", pullRequest: 42, headSha: oid("a") },
      fixTarget: null,
      actorIdentity: "andrew",
      finding: { commentId: `comment-${character}`, threadId: `thread-${character}` },
      disposition: "defer",
      reply: `Deferred ${character}.`,
    },
  });
}

describe("integration settlement execution", () => {
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
            disposition: request.disposition,
            threadId: request.finding.threadId,
            state: "already-settled",
            nextAction: "complete",
          };
        }
        settled.add(request.finding.threadId);
        effects += 1;
        return {
          schemaVersion: 1,
          mode: "review-hosted-settle",
          disposition: request.disposition,
          threadId: request.finding.threadId,
          state: "settled",
          nextAction: "complete",
          replyId: `reply-${request.finding.threadId}`,
        };
      },
      settleReviewResponse: async () => ({ state: "settled" }),
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
      settleHosted: async () => ({
        schemaVersion: 1,
        mode: "review-hosted-settle",
        disposition: action.request.disposition,
        threadId: action.request.finding.threadId,
        state,
        nextAction: "stop",
      }),
      settleReviewResponse: async () => ({ state: "settled" }),
    };

    await expect(executeSettlementPlan(
      composeCanonicalSettlementPlan([action]),
      dependencies,
    )).resolves.toMatchObject({ state: "invalidated", reason, completedActions: 0 });
  });
});
