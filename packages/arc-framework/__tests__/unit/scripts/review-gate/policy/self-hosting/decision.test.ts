import { describe, expect, it } from "vitest";

import { resolveSelfHostingDecision } from "../../../../../../src/scripts/review-gate/policy/self-hosting/decision.js";
import { SELF_HOSTING_POLICY } from "../../../../../../src/scripts/review-gate/policy/self-hosting/schema.js";
import { reduceReviewRouting } from "../../../../../../src/scripts/review-gate/policy/routing.js";
import type { ReviewRoutingFacts } from "../../../../../../src/scripts/review-gate/policy/routing-schema.js";

const changeRequest = {
  schemaVersion: 1 as const,
  repositoryId: "repo-1",
  changeRequestId: "change-7",
  hostRef: "opaque-change-7",
  baseRef: "main",
  baseSha: "a".repeat(40),
  diffBaseSha: "b".repeat(40),
  headSha: "c".repeat(40),
  changeSetId: "d".repeat(64),
};

const facts: ReviewRoutingFacts = {
  schemaVersion: 1,
  changeSetState: "known",
  contentKind: "documentation",
  reviewRisk: "routine",
  changeDeterminacy: "ordinary",
  ownership: "self",
  surfaceAuthority: "planning-grooming",
  assurance: { workContext: "work-unit", workClass: "Light" },
  activity: { selfReview: true, frontlineReview: true },
};

describe("aggregate self-hosting policy decision", () => {
  it.each([
    [{ ...facts }, "auto", "exempt", 0],
    [{ ...facts, ownership: "not-applicable" as const, surfaceAuthority: "ordinary" as const }, "reviewed", "recommended", 1],
    [{ ...facts, reviewRisk: "sensitive" as const }, "reviewed", "required", 1],
  ] as const)("derives %s presentation from normalized routing", (routingFacts, lane, disposition, requirementCount) => {
    const routing = reduceReviewRouting(routingFacts);
    const decision = resolveSelfHostingDecision({
      policy: SELF_HOSTING_POLICY,
      changeRequest,
      routingFacts,
      routing,
    });

    expect(decision.routing).toEqual(routing);
    expect(decision.reviewRisk).toBe(routingFacts.reviewRisk);
    expect(decision.lane).toBe(lane);
    expect(decision.disposition).toBe(disposition);
    expect(decision.requirements).toHaveLength(requirementCount);
    if (requirementCount > 0) {
      expect(decision.requirements[0]?.obligation).toBe(disposition === "required" ? "required" : "recommended");
    }
  });

  it("does not accept mutable CI weight as policy input", () => {
    const decision = resolveSelfHostingDecision({
      policy: SELF_HOSTING_POLICY,
      changeRequest,
      routingFacts: { ...facts, reviewRisk: "sensitive" },
      routing: reduceReviewRouting({ ...facts, reviewRisk: "sensitive" }),
    });

    expect(decision).not.toHaveProperty("ciWeight");
    expect(decision).not.toHaveProperty("capacity");
  });

  it("changes policy binding when canonical policy data changes", () => {
    const input = {
      changeRequest,
      routingFacts: { ...facts, reviewRisk: "sensitive" as const },
      routing: reduceReviewRouting({ ...facts, reviewRisk: "sensitive" }),
    };
    const original = resolveSelfHostingDecision({ ...input, policy: SELF_HOSTING_POLICY });
    const changed = resolveSelfHostingDecision({
      ...input,
      policy: { ...SELF_HOSTING_POLICY, semanticsVersion: "self-hosting-review/v2" },
    });

    expect(changed.policyVersion).not.toBe(original.policyVersion);
    expect(changed.requirements[0]?.policyVersion).toBe(changed.policyVersion);
  });
});
