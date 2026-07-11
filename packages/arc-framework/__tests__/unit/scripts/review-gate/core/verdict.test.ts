import { describe, expect, it } from "vitest";

import type { ReviewRequirement } from "../../../../../src/scripts/review-gate/core/contracts.js";
import { reduceGateVerdict } from "../../../../../src/scripts/review-gate/core/verdict.js";

function requirement(obligation: "required" | "recommended" = "required"): ReviewRequirement {
  return {
    schemaVersion: 1,
    id: "analysis",
    kind: "independent-analysis",
    obligation,
    acceptableSources: [{ sourceKind: "agent", qualifier: "independent-analysis/v1" }],
    count: 1,
    initialAdmission: "automatic",
    policyVersion: "a".repeat(64),
    rubricVersion: "independent-analysis/v1",
    reasons: ["code-surface"],
    changeSetId: "b".repeat(64),
    headSha: "c".repeat(40),
  };
}

const passing = {
  readiness: { draft: false, mergeability: "mergeable" as const, enforceBaseFreshness: true, baseFresh: true },
  ci: { state: "success" as const },
  requirements: [{ requirement: requirement(), state: "clean" as const, sourceIdentity: "agent-1" }],
  nativeReview: {
    requestedChanges: false,
    unresolvedRequiredConversations: 0,
    decision: "not-configured" as const,
  },
  inconsistencies: [] as string[],
};

describe("complete merge readiness verdict", () => {
  it.each([
    ["draft", { readiness: { ...passing.readiness, draft: true } }, "pending"],
    ["unknown mergeability", { readiness: { ...passing.readiness, mergeability: "unknown" as const } }, "pending"],
    ["base wait", { readiness: { ...passing.readiness, baseFresh: false } }, "pending"],
    ["conflict", { readiness: { ...passing.readiness, mergeability: "conflicting" as const } }, "failure"],
    ["CI pending", { ci: { state: "pending" as const } }, "pending"],
    ["CI failure", { ci: { state: "failure" as const } }, "failure"],
  ])("maps %s to %s", (_name, override, conclusion) => {
    expect(reduceGateVerdict({ ...passing, ...override }).conclusion).toBe(conclusion);
  });

  it.each([
    ["not-requested", "pending"],
    ["queued", "pending"],
    ["running", "pending"],
    ["stale", "pending"],
    ["findings", "failure"],
    ["failed", "failure"],
    ["unavailable", "failure"],
    ["clean", "success"],
    ["waived", "success"],
  ] as const)("maps required %s to %s", (state, conclusion) => {
    expect(reduceGateVerdict({
      ...passing,
      requirements: [{ requirement: requirement(), state, sourceIdentity: null }],
    }).conclusion).toBe(conclusion);
  });

  it("keeps recommended unsatisfied requirements visible but non-blocking", () => {
    const verdict = reduceGateVerdict({
      ...passing,
      requirements: [{ requirement: requirement("recommended"), state: "unavailable", sourceIdentity: null }],
    });
    expect(verdict.conclusion).toBe("success");
    expect(verdict.requirements[0]).toMatchObject({ state: "unavailable", blocking: false });
  });

  it("keeps native requested changes and required conversations blocking", () => {
    expect(reduceGateVerdict({
      ...passing,
      nativeReview: { requestedChanges: true, unresolvedRequiredConversations: 2, decision: "approved" },
    })).toMatchObject({ conclusion: "failure" });
  });

  it("never succeeds with inconsistent controller state", () => {
    for (const inconsistency of [
      "malformed-receipt", "ledger-fork", "ledger-regression", "duplicate-projection", "invalid-capacity",
    ]) {
      expect(reduceGateVerdict({ ...passing, inconsistencies: [inconsistency] }).conclusion).toBe("failure");
    }
    expect(reduceGateVerdict({ ...passing, inconsistencies: ["stale-evidence"] }).conclusion).toBe("pending");
  });
});
