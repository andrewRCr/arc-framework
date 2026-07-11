import { describe, expect, it } from "vitest";

import type { ReviewRequirement } from "../../../../../src/scripts/review-gate/core/contracts.js";
import {
  aggregateRequirementDisposition,
  evaluateRequirements,
} from "../../../../../src/scripts/review-gate/core/requirements.js";

function requirement(overrides: Partial<ReviewRequirement> = {}): ReviewRequirement {
  return {
    schemaVersion: 1,
    id: "analysis",
    kind: "independent-analysis",
    obligation: "required",
    acceptableSources: [{ sourceKind: "agent", qualifier: "independent-analysis/v1" }],
    count: 1,
    initialAdmission: "automatic",
    policyVersion: "a".repeat(64),
    rubricVersion: "independent-analysis/v1",
    reasons: ["code-surface"],
    changeSetId: "b".repeat(64),
    headSha: "c".repeat(40),
    ...overrides,
  };
}

describe("typed requirement reduction", () => {
  it("does not substitute agent analysis for peer approval or generic approval for specialist review", () => {
    const peer = requirement({
      id: "peer",
      kind: "peer-approval",
      acceptableSources: [{ sourceKind: "human", qualifier: "peer" }],
    });
    const specialist = requirement({
      id: "security",
      kind: "specialist-review",
      acceptableSources: [{ sourceKind: "human", qualifier: "security" }],
    });
    const result = evaluateRequirements({
      requirements: [peer, specialist],
      candidates: [
        { requirementId: "peer", sourceKind: "agent", qualifier: "peer", sourceIdentity: "agent-1" },
        { requirementId: "security", sourceKind: "human", qualifier: "generic", sourceIdentity: "human-1", humanActorIdentity: "human-1" },
      ],
      nativeReview: { requestedChanges: false, unresolvedRequiredConversations: 0 },
    });

    expect(result.evaluations.every((evaluation) => !evaluation.satisfied)).toBe(true);
  });

  it("requires distinct source identities and distinct human actors for counts", () => {
    const counted = requirement({ count: 2 });
    const duplicate = {
      requirementId: "analysis",
      sourceKind: "agent" as const,
      qualifier: "independent-analysis/v1",
      sourceIdentity: "agent-1",
    };
    expect(evaluateRequirements({
      requirements: [counted],
      candidates: [duplicate, duplicate],
      nativeReview: { requestedChanges: false, unresolvedRequiredConversations: 0 },
    }).evaluations[0]?.satisfied).toBe(false);

    const peer = requirement({
      id: "peer",
      kind: "peer-approval",
      count: 2,
      acceptableSources: [{ sourceKind: "human", qualifier: "peer" }],
    });
    expect(evaluateRequirements({
      requirements: [peer],
      candidates: [
        { requirementId: "peer", sourceKind: "human", qualifier: "peer", sourceIdentity: "approval-1", humanActorIdentity: "actor-1" },
        { requirementId: "peer", sourceKind: "human", qualifier: "peer", sourceIdentity: "approval-2", humanActorIdentity: "actor-1" },
      ],
      nativeReview: { requestedChanges: false, unresolvedRequiredConversations: 0 },
    }).evaluations[0]?.satisfied).toBe(false);
  });

  it("keeps native requested changes and required conversations independently blocking", () => {
    const result = evaluateRequirements({
      requirements: [requirement()],
      candidates: [{
        requirementId: "analysis",
        sourceKind: "agent",
        qualifier: "independent-analysis/v1",
        sourceIdentity: "agent-1",
      }],
      nativeReview: { requestedChanges: true, unresolvedRequiredConversations: 2 },
    });

    expect(result.evaluations[0]?.satisfied).toBe(true);
    expect(result.blockers).toEqual(["native-requested-changes", "unresolved-required-conversations"]);
  });

  it("aggregates obligations without erasing requirement detail", () => {
    const recommended = requirement({ id: "analysis", obligation: "recommended" });
    const required = requirement({
      id: "peer",
      kind: "peer-approval",
      acceptableSources: [{ sourceKind: "human", qualifier: "peer" }],
    });
    const reduced = evaluateRequirements({
      requirements: [recommended, required],
      candidates: [],
      nativeReview: { requestedChanges: false, unresolvedRequiredConversations: 0 },
    });
    const aggregate = aggregateRequirementDisposition(reduced.evaluations);

    expect(aggregate.disposition).toBe("required");
    expect(aggregate.evaluations.map((evaluation) => evaluation.requirement.id)).toEqual(["analysis", "peer"]);
    expect(aggregate.blockers).toContain("requirement:peer:unsatisfied");
    expect(aggregateRequirementDisposition([]).disposition).toBe("exempt");
  });
});
