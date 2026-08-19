import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  composeReviewResponseSettlementAction,
  projectReviewResponse,
} from "../../../../../src/scripts/review-gate/core/response-plan.js";

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
  standardReview: "required" as const,
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
    rubricVersion: "standard-review/v1",
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
  const proposed = proposeDispositionSet(dispositionSet);
  return {
    proposed,
    dispositionState: approveDispositionState({
      proposed,
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
    dispositionState: null,
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
    expect(projectReviewResponse({ ...input(), dispositionState: approval.proposed })).toMatchObject({
      state: "awaiting-approval",
      allowedCapabilities: ["approve"],
    });
    expect(projectReviewResponse({
      ...input(),
      dispositionState: approval.proposed,
      candidateTarget,
      verificationPassed: true,
      verificationRefs: ["ci:run-1"],
    })).toMatchObject({ state: "awaiting-approval", allowedCapabilities: ["approve"] });
    const readyToFix = projectReviewResponse({ ...input(), dispositionState: approval.dispositionState });
    expect(readyToFix).toMatchObject({
      state: "ready-to-fix",
      allowedCapabilities: ["fix"],
      fixAuthorization: {
        oldTargetId: currentTarget.targetId,
        dispositionSetId: approval.dispositionState.dispositionSet.dispositionSetId,
        authorizedFindingIds: ["finding-1"],
      },
    });
    expect(readyToFix.fixAuthorization).not.toHaveProperty("newTargetId");
    expect(projectReviewResponse({
      ...input(),
      dispositionState: approval.dispositionState,
      candidateTarget,
      verificationPassed: true,
      verificationRefs: ["ci:run-1"],
    })).toMatchObject({ state: "ready-to-persist", allowedCapabilities: ["persist"] });
    expect(projectReviewResponse({
      ...input(),
      dispositionState: approval.dispositionState,
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

  it("returns approved unchanged-target dispositions for caller closure", () => {
    expect(projectReviewResponse({ ...input(), dispositionState: approved("reject").dispositionState })).toMatchObject({
      state: "ready-to-close",
      allowedCapabilities: ["close"],
      newTarget: null,
      blocking: false,
    });
  });

  it("matches approved regraded reviewer nits by their source identity", () => {
    const dispositionSet = createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: currentTarget.targetId,
      policyVersion: canonicalDigest({ policy: "review" }),
      rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: "implementation-audit" }),
      proposedBy: "author-1",
      findings: [{
        findingId: normalizedFinding.findingId,
        sourceIdentity: "codex-pr",
        locus: normalizedFinding.locus,
        sourceVerification: "verified",
        verificationRefs: ["source:src/index.ts:7"],
        reviewerSeverity: "minor",
        reviewerNit: true,
        arcSeverity: "major",
        disposition: "fix",
        rationale: "The source supports the regraded finding.",
        recommendation: "Apply the bounded fix.",
        openQuestions: [],
      }],
    });
    const dispositionState = approveDispositionState({
      proposed: proposeDispositionSet(dispositionSet),
      approvedBy: "maintainer-1",
      approvedAt: "2026-07-20T20:00:00Z",
    });

    expect(projectReviewResponse({
      ...input(),
      findings: [{ ...normalizedFinding, severity: "minor", nit: true }],
      dispositionState,
    })).toMatchObject({ state: "ready-to-fix", allowedCapabilities: ["fix"] });
  });

  it("keeps an unsupported reviewer nit record-only under blocking minor policy", () => {
    const dispositionSet = createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: currentTarget.targetId,
      policyVersion: canonicalDigest({ policy: "review" }),
      rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: "implementation-audit" }),
      proposedBy: "author-1",
      findings: [{
        findingId: normalizedFinding.findingId,
        sourceIdentity: "codex-pr",
        locus: normalizedFinding.locus,
        sourceVerification: "not-supported",
        verificationRefs: ["source:src/index.ts:7"],
        reviewerSeverity: "minor",
        reviewerNit: true,
        disposition: "reject",
        rationale: "The source does not support the finding.",
        recommendation: "Reject the finding.",
        openQuestions: [],
      }],
    }, { minorGating: "blocking" });

    expect(dispositionSet.findings).toEqual([
      expect.objectContaining({ reviewerNit: true, gating: "record-only" }),
    ]);
  });

  it("blocks stale findings, failed verification, and unavailable required capabilities", () => {
    const approval = approved();
    expect(projectReviewResponse({
      ...input(),
      dispositionState: approval.dispositionState,
      findings: [normalizedFinding, {
        findingId: "finding-2",
        severity: "minor",
        locus: "src/other.ts:2",
        evidenceUrlOrId: "review:finding-2",
      }],
    })).toMatchObject({ state: "blocked", blocking: true, allowedCapabilities: [] });
    expect(projectReviewResponse({
      ...input(),
      dispositionState: approval.dispositionState,
      findings: [{ ...normalizedFinding, locus: "src/other.ts:1" }],
    })).toMatchObject({ state: "blocked", blocking: true, allowedCapabilities: [] });
    expect(() => projectReviewResponse({
      ...input(),
      dispositionState: {
        ...approval.dispositionState,
        approval: {
          ...approval.dispositionState.approval,
          targetId: candidateTarget.targetId,
        },
      },
    })).toThrow(/exact disposition set and target/iu);
    expect(projectReviewResponse({ ...input(), dispositionState: approval.dispositionState, candidateTarget }))
      .toMatchObject({ state: "blocked", nextAction: expect.stringMatching(/verification/iu) });
    expect(projectReviewResponse({
      ...input(),
      dispositionState: approval.dispositionState,
      capabilities: { ...capabilities, fix: false },
    })).toMatchObject({ state: "blocked", nextAction: expect.stringMatching(/fix capability/iu) });
  });

  it("rejects provider, channel, and controller state at the strict input boundary", () => {
    expect(() => projectReviewResponse({ ...input(), providerCommand: "@provider review" })).toThrow();
    expect(() => projectReviewResponse({ ...input(), channel: "hosted" })).toThrow();
    expect(() => projectReviewResponse({ ...input(), conversations: [] })).toThrow();
    expect(() => projectReviewResponse({ ...input(), controllerState: { verdict: "clean" } })).toThrow();
  });

  it("rejects structurally valid targets whose semantic identity is corrupt", () => {
    expect(() => projectReviewResponse({
      ...input(),
      currentTarget: { ...currentTarget, targetId: canonicalDigest({ forged: true }) },
    })).toThrow(/target ID/iu);
    expect(() => composeReviewResponseSettlementAction({
      originTarget: { ...currentTarget, targetId: canonicalDigest({ forged: true }) },
      fixTarget: null,
      request: {
        schemaVersion: 1,
        source: { kind: "attested-local", receiptRef: "receipt-1" },
        dispositions: approved("reject").dispositionState,
      },
    })).toThrow(/target ID/iu);
  });
});
