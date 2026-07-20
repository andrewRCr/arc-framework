import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { approveDispositionSet, createDispositionSet } from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { projectReviewResponse } from "../../../../../src/scripts/review-gate/core/response-plan.js";

const objectId = (character: string): string => character.repeat(40);

function target(head: string) {
  return createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: objectId(head),
    headTree: objectId(head),
  });
}

const currentTarget = target("c");
const candidateTarget = target("d");
const normalizedFinding = {
  findingId: "finding-1",
  severity: "major" as const,
  locus: "src/index.ts:7",
  evidenceUrlOrId: "review:finding-1",
};
const routing = {
  schemaVersion: 1 as const,
  authorSelfReview: "required" as const,
  frontlineAction: "attempt" as const,
  independentAnalysis: "required" as const,
  retrigger: "full-final" as const,
  assuranceMode: "terminal-aggregate" as const,
  reasons: ["sensitive-change-set" as const],
};
const capabilities = { approve: true, fix: true, persist: true, close: true, reroute: true };

function approved(disposition: "fix" | "defer" | "reject" = "fix") {
  const dispositionSet = createDispositionSet({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    targetId: currentTarget.targetId,
    policyVersion: canonicalDigest({ policy: "review" }),
    rubricVersion: "independent-analysis/v1",
    rubricDigest: canonicalDigest({ rubric: "implementation-audit" }),
    proposedBy: "author-1",
    findings: [{
      findingId: normalizedFinding.findingId,
      sourceIdentity: "codex-pr",
      locus: normalizedFinding.locus,
      sourceVerification: "verified",
      verificationRefs: ["source:src/index.ts:7"],
      severity: normalizedFinding.severity,
      disposition,
      gating: disposition === "fix" ? "blocking" : "record-only",
      rationale: "The source supports this proposed disposition.",
      recommendation: disposition === "fix" ? "Apply the bounded fix." : "Leave the target unchanged.",
      openQuestions: [],
    }],
  });
  return {
    dispositionSet,
    approval: approveDispositionSet({
      dispositionSet,
      approvedBy: "maintainer-1",
      approvedAt: "2026-07-20T20:00:00Z",
    }),
  };
}

function input() {
  return {
    currentTarget,
    findings: [normalizedFinding],
    routing,
    dispositionSet: null,
    approval: null,
    candidateTarget: null,
    persistedTargetId: null,
    verificationPassed: false,
    verificationRefs: [],
    capabilities,
  };
}

describe("review response planning", () => {
  it("moves an approved fix through approval, fix, persistence, and rerouting states", () => {
    expect(projectReviewResponse(input())).toMatchObject({
      state: "awaiting-approval",
      allowedCapabilities: ["approve"],
      blocking: true,
    });
    const approval = approved();
    expect(projectReviewResponse({ ...input(), ...approval })).toMatchObject({
      state: "ready-to-fix",
      allowedCapabilities: ["fix"],
    });
    expect(projectReviewResponse({
      ...input(),
      ...approval,
      candidateTarget,
      verificationPassed: true,
      verificationRefs: ["ci:run-1"],
    })).toMatchObject({ state: "ready-to-persist", allowedCapabilities: ["persist"] });
    expect(projectReviewResponse({
      ...input(),
      ...approval,
      candidateTarget,
      persistedTargetId: candidateTarget.targetId,
      verificationPassed: true,
      verificationRefs: ["ci:run-1"],
    })).toMatchObject({
      state: "reroute",
      oldTarget: { targetId: currentTarget.targetId },
      newTarget: { targetId: candidateTarget.targetId },
      verificationRefs: ["ci:run-1"],
      blocking: false,
    });
  });

  it("returns approved unchanged-target dispositions for channel closure", () => {
    expect(projectReviewResponse({ ...input(), ...approved("reject") })).toMatchObject({
      state: "ready-to-close",
      allowedCapabilities: ["close"],
      newTarget: null,
      blocking: false,
    });
  });

  it("blocks stale findings, failed verification, and unavailable required capabilities", () => {
    const approval = approved();
    expect(projectReviewResponse({
      ...input(),
      ...approval,
      findings: [{ ...normalizedFinding, locus: "src/other.ts:1" }],
    })).toMatchObject({ state: "blocked", blocking: true, allowedCapabilities: [] });
    expect(projectReviewResponse({ ...input(), ...approval, candidateTarget }))
      .toMatchObject({ state: "blocked", nextAction: expect.stringMatching(/verification/iu) });
    expect(projectReviewResponse({
      ...input(),
      ...approval,
      capabilities: { ...capabilities, fix: false },
    })).toMatchObject({ state: "blocked", nextAction: expect.stringMatching(/fix capability/iu) });
  });

  it("rejects provider commands and controller-private state at the strict input boundary", () => {
    expect(() => projectReviewResponse({ ...input(), providerCommand: "@provider review" })).toThrow();
    expect(() => projectReviewResponse({ ...input(), controllerState: { verdict: "clean" } })).toThrow();
  });
});
