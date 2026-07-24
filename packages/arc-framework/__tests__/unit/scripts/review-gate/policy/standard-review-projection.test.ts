import { describe, expect, it } from "vitest";

import {
  projectStandardReviewObligation,
} from "../../../../../src/scripts/review-gate/policy/standard-review-projection.js";
import {
  STANDARD_REVIEW_RUBRIC_IDENTITY,
} from "../../../../../src/scripts/review-gate/policy/standard-review.js";
import type { ReviewRoutingDecision } from "../../../../../src/scripts/review-gate/policy/routing-schema.js";

const rubric = STANDARD_REVIEW_RUBRIC_IDENTITY;

const decision = (
  standardReview: ReviewRoutingDecision["standardReview"],
  retrigger: ReviewRoutingDecision["retrigger"],
): ReviewRoutingDecision => ({
  schemaVersion: 1,
  authorSelfReview: "required",
  frontlineAction: "attempt",
  standardReview,
  retrigger,
  assuranceMode: "terminal-aggregate",
  reasons: [standardReview === "exempt" ? "auto-eligible-planning" : "sensitive-change-set"],
});

describe("standard-review obligation projection", () => {
  it("emits one topology-neutral logical obligation from one routing decision", () => {
    const projection = projectStandardReviewObligation(decision("required", "full-final"));

    expect(projection).toEqual({
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: "standard-review/v1",
      rubricDigest: rubric.digest,
      retrigger: "full-final",
      count: 1,
    });
    expect(Object.keys(projection).sort()).toEqual([
      "count",
      "obligation",
      "reasons",
      "retrigger",
      "rubricDigest",
      "rubricVersion",
    ]);
  });

  it("keeps exemption explicit without producing target-bound requirement data", () => {
    const projection = projectStandardReviewObligation(decision("exempt", "none"), rubric);

    expect(projection).toEqual({
      obligation: "exempt",
      reasons: ["auto-eligible-planning"],
      rubricVersion: "standard-review/v1",
      rubricDigest: rubric.digest,
      retrigger: "none",
      count: 1,
    });
    expect(projection).not.toHaveProperty("targetId");
    expect(projection).not.toHaveProperty("requirementId");
  });

  it("returns immutable policy output without self-review or frontline fields", () => {
    const projection = projectStandardReviewObligation(decision("recommended", "incremental"), rubric);

    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.reasons)).toBe(true);
    expect(projection).not.toHaveProperty("authorSelfReview");
    expect(projection).not.toHaveProperty("frontlineAction");
  });

  it("preserves one projection per deliverable without accepting topology facts", () => {
    const deliverables = [
      projectStandardReviewObligation(decision("required", "full-final"), rubric),
      projectStandardReviewObligation(decision("required", "full-final"), rubric),
    ];

    expect(deliverables).toHaveLength(2);
    expect(deliverables[0]).not.toBe(deliverables[1]);
    expect(() => projectStandardReviewObligation({
      ...decision("required", "full-final"),
      pullRequestCount: 2,
    } as ReviewRoutingDecision, rubric)).toThrow();
  });
});
