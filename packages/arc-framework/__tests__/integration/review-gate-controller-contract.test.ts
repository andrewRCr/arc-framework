import { describe, expect, it } from "vitest";

import type { ReviewRequirement } from "../../src/scripts/review-gate/core/contracts.js";
import type { GateVerdictInput } from "../../src/scripts/review-gate/core/verdict.js";
import { reduceGateVerdict } from "../../src/scripts/review-gate/core/verdict.js";
import { discoverCandidates } from "../../src/scripts/review-gate/runtime/discovery.js";

function requirement(obligation: "required" | "recommended"): ReviewRequirement {
  return {
    schemaVersion: 1, id: "analysis", kind: "independent-analysis", obligation,
    acceptableSources: [{ sourceKind: "agent", qualifier: "independent-analysis/v1" }], count: 1,
    initialAdmission: "automatic", policyVersion: "a".repeat(64), rubricVersion: "independent-analysis/v1",
    reasons: ["code-surface"], changeSetId: "b".repeat(64), headSha: "c".repeat(40),
  };
}

function input(
  obligation: "required" | "recommended" | "exempt",
  state: GateVerdictInput["requirements"][number]["state"] = "clean",
  inconsistencies: string[] = [],
): GateVerdictInput {
  return {
    readiness: { draft: false, mergeability: "mergeable", enforceBaseFreshness: true, baseFresh: true },
    ci: { state: "success" },
    requirements: obligation === "exempt" ? [] : [{ requirement: requirement(obligation), state, sourceIdentity: "agent-1" }],
    nativeReview: { requestedChanges: false, unresolvedRequiredConversations: 0, decision: "not-configured" },
    inconsistencies,
  };
}

describe("integrated review-gate contract", () => {
  it.each([
    ["exempt", "clean", [], "success"],
    ["recommended", "unavailable", [], "success"],
    ["required", "clean", [], "success"],
    ["required", "findings", [], "failure"],
    ["required", "stale", [], "pending"],
    ["required", "waived", [], "success"],
    ["required", "clean", ["malformed-receipt"], "failure"],
    ["required", "clean", ["invalid-capacity"], "failure"],
  ] as const)("projects %s/%s with %j as %s", (obligation, state, inconsistencies, conclusion) => {
    expect(reduceGateVerdict(input(obligation, state, [...inconsistencies])).conclusion).toBe(conclusion);
  });

  it("cannot turn missing or spoofed required evidence green", () => {
    expect(reduceGateVerdict(input("required", "not-requested")).conclusion).toBe("pending");
    expect(reduceGateVerdict(input("required", "clean", ["malformed-receipt"])).conclusion).toBe("failure");
  });

  it("converges event and scheduled entry on the same candidate set", async () => {
    const port = {
      resolveOpenPullRequestsByHead: async () => [7],
      listOpenPullRequests: async function* () { yield [7]; },
    };
    const event = await discoverCandidates({
      kind: "status", repositoryId: 42, pullRequestNumbers: [], headSha: "c".repeat(40), workflowName: null,
    }, port);
    const schedule = await discoverCandidates({
      kind: "schedule", repositoryId: 42, pullRequestNumbers: [], headSha: null, workflowName: null,
    }, port);
    expect(event).toEqual(schedule);
  });
});
