import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  FindingConversationClosureV2Schema,
  FindingSettlementV2Schema,
  LocalDispositionTerminalV2Schema,
  NormalizedReviewFindingSchema,
  ProviderNativeConversationClosureV2Schema,
  normalizeProviderFindingClassification,
} from "../../../../../src/scripts/review-gate/core/finding-records.js";
import { reduceNormalizedFindings } from "../../../../../src/scripts/review-gate/core/findings.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";
import {
  createFindingConversationClosureV2,
  createFindingSettlementV2,
  createLocalDispositionTerminalV2,
  createProviderNativeConversationClosureV2,
} from "../../../../../src/scripts/review-gate/runtime/finding-settlement.js";

const targetId = canonicalDigest({ target: "old" });
const fixTargetId = canonicalDigest({ target: "fixed" });
const finding = {
  findingId: "finding-1",
  severity: "minor" as const,
  nit: true as const,
  locus: "src/index.ts:7",
  evidenceUrlOrId: "review:finding-1",
};

function approvedSet(disposition: "fix" | "defer" | "reject") {
  const dispositionSet = createDispositionSet({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    targetId,
    policyVersion: canonicalDigest({ policy: "review" }),
    rubricVersion: "independent-analysis/v1",
    rubricDigest: canonicalDigest({ rubric: "implementation-audit" }),
    proposedBy: "author-1",
    findings: [{
      findingId: finding.findingId,
      locus: finding.locus,
      severity: finding.severity,
      nit: finding.nit,
      sourceIdentity: "codex-pr",
      sourceVerification: "verified",
      verificationRefs: ["source:src/index.ts:7"],
      disposition,
      gating: "record-only",
      rationale: "The report is source-verified and the proposed fate is appropriate.",
      recommendation: disposition === "fix" ? "Apply the bounded fix." : "Leave the target unchanged.",
      openQuestions: [],
    }],
  });
  const proposed = proposeDispositionSet(dispositionSet);
  return {
    dispositionState: approveDispositionState({
      proposed,
      approvedBy: "maintainer-1",
      approvedAt: "2026-07-20T19:59:00Z",
    }),
  };
}

describe("normalized finding records", () => {
  it.each([
    ["critical", "blocker"],
    ["high", "major"],
    ["medium", "major"],
    ["low", "minor"],
    ["info", "minor"],
  ] as const)("normalizes provider %s severity to %s", (providerSeverity, severity) => {
    expect(normalizeProviderFindingClassification(providerSeverity, false)).toEqual({ severity });
  });

  it("requires an explicit pure-polish signal and rejects nit on non-minor findings", () => {
    expect(normalizeProviderFindingClassification("low", false)).toEqual({ severity: "minor" });
    expect(normalizeProviderFindingClassification("low", true)).toEqual({ severity: "minor", nit: true });
    expect(() => NormalizedReviewFindingSchema.parse({ ...finding, severity: "major" })).toThrow(/nit/iu);
  });

  it("reduces the registered finding shape and rejects reused source identities", () => {
    expect(reduceNormalizedFindings([{ sourceIdentity: "codex-pr", findings: [finding] }]))
      .toEqual([{ ...finding, sourceIdentity: "codex-pr" }]);
    expect(() => reduceNormalizedFindings([
      { sourceIdentity: "codex-pr", findings: [finding] },
      { sourceIdentity: "codex-pr", findings: [{ ...finding, locus: "src/other.ts:1" }] },
    ])).toThrow(/finding-identity-reused/u);
  });
});

describe("forward finding settlement", () => {
  it("records severity and disposition while keeping conversation closure separate", () => {
    const approved = approvedSet("fix");
    const settlement = createFindingSettlementV2({
      ...approved,
      finding,
      settledBy: "author-1",
      settledAt: "2026-07-20T20:00:00Z",
      fixTargetId,
      fixConsumption: {
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        fixAuthorizationId: canonicalDigest({ authorization: "fix-1" }),
        dispositionSetId: approved.dispositionState.dispositionSet.dispositionSetId,
        oldTargetId: targetId,
        newTargetId: fixTargetId,
        oldHeadSha: "a".repeat(40),
        newHeadSha: "b".repeat(40),
        appliedBy: "author-1",
        consumedAt: "2026-07-20T19:59:30Z",
        verificationRefs: ["ci:run-1"],
      },
      verificationRefs: ["ci:run-1"],
    });
    expect(FindingSettlementV2Schema.parse(settlement)).toMatchObject({
      dispositionSetId: approved.dispositionState.dispositionSet.dispositionSetId,
      approval: { approvedBy: "maintainer-1" },
      severity: "minor",
      nit: true,
      disposition: "fix",
      fixTargetId,
    });

    const closure = createFindingConversationClosureV2({
      settlement,
      authorityIdentity: "codex-pr",
      sourceConfirmationRef: "codex-pr:closure:finding-1",
      hostEvidenceRef: "github:thread-1:resolved",
      closedAt: "2026-07-20T20:01:00Z",
    });
    expect(FindingConversationClosureV2Schema.parse(closure)).toMatchObject({
      findingId: finding.findingId,
      closureKind: "controller-source-confirmed",
      settlementId: canonicalDigest(settlement),
    });
    expect(closure).not.toHaveProperty("disposition");
  });

  it("keeps local reports and provider-native decisive closure on separate authority records", () => {
    const localApproved = approvedSet("reject");
    expect(createLocalDispositionTerminalV2({
      ...localApproved,
      reportRef: "local-report:dispositions-1",
      recordedAt: "2026-07-20T20:00:00Z",
    })).toMatchObject({
      terminalKind: "local-disposition-report",
      dispositionSetId: localApproved.dispositionState.dispositionSet.dispositionSetId,
    });
    const providerClosure = createProviderNativeConversationClosureV2({
      targetId,
      providerIdentity: "provider-review",
      conversationId: "conversation-1",
      decisiveReviewId: "review-1",
      decisiveState: "approved",
      conversationState: "resolved",
      decisiveEvidenceRef: "provider:review-1:approved",
      conversationEvidenceRef: "provider:conversation-1:resolved",
      observedAt: "2026-07-20T20:01:00Z",
    });
    expect(ProviderNativeConversationClosureV2Schema.parse(providerClosure)).toMatchObject({
      closureKind: "provider-native-decisive",
      decisiveState: "approved",
      conversationState: "resolved",
    });
    expect(LocalDispositionTerminalV2Schema.parse(createLocalDispositionTerminalV2({
      ...localApproved,
      reportRef: "local-report:dispositions-1",
      recordedAt: "2026-07-20T20:00:00Z",
    }))).not.toHaveProperty("conversationId");
  });

  it("rejects bare resolution, generic approval, coordinator claims, and provider ignore state", () => {
    const approvedFix = approvedSet("fix");
    const settlement = createFindingSettlementV2({
      ...approvedFix,
      finding,
      settledBy: "author-1",
      settledAt: "2026-07-20T20:00:00Z",
      fixTargetId,
      fixConsumption: {
        schemaVersion: 2, semanticsVersion: "review-gate/v2",
        fixAuthorizationId: canonicalDigest({ authorization: "fix-2" }),
        dispositionSetId: approvedFix.dispositionState.dispositionSet.dispositionSetId,
        oldTargetId: targetId, newTargetId: fixTargetId,
        oldHeadSha: "a".repeat(40), newHeadSha: "b".repeat(40), appliedBy: "author-1",
        consumedAt: "2026-07-20T19:59:30Z", verificationRefs: ["ci:run-1"],
      },
      verificationRefs: ["ci:run-1"],
    });
    expect(() => createFindingConversationClosureV2({
      settlement,
      authorityIdentity: "coordinator-1",
      sourceConfirmationRef: "coordinator:claimed-closed",
      hostEvidenceRef: "host:thread-resolved",
      closedAt: "2026-07-20T20:01:00Z",
    })).toThrow(/finding source/iu);
    for (const input of [
      { decisiveState: "approved" as const, conversationState: "unresolved" as const },
      { decisiveState: "changes-requested" as const, conversationState: "resolved" as const },
      { decisiveState: "review-required" as const, conversationState: "resolved" as const },
    ]) {
      expect(() => createProviderNativeConversationClosureV2({
        targetId, providerIdentity: "provider-review", conversationId: "conversation-1",
        decisiveReviewId: "review-1", ...input, decisiveEvidenceRef: "provider:review-1",
        conversationEvidenceRef: "provider:conversation-1", observedAt: "2026-07-20T20:01:00Z",
      })).toThrow();
    }
    expect(() => ProviderNativeConversationClosureV2Schema.parse({
      schemaVersion: 2, semanticsVersion: "review-gate/v2", closureKind: "provider-native-decisive",
      targetId, providerIdentity: "provider-review", conversationId: "conversation-1",
      decisiveReviewId: "review-1", decisiveState: "approved", conversationState: "resolved",
      decisiveEvidenceRef: "provider:review-1", conversationEvidenceRef: "provider:conversation-1",
      observedAt: "2026-07-20T20:01:00Z", ignoreCommand: "@provider ignore",
    })).toThrow();
  });

  it("rejects invalid fix and non-fix target bindings", () => {
    const base = {
      finding,
      settledBy: "author-1",
      settledAt: "2026-07-20T20:00:00Z",
      verificationRefs: ["ci:run-1"],
    };
    expect(() => createFindingSettlementV2({ ...base, ...approvedSet("fix"), fixTargetId: null }))
      .toThrow(/resulting target/iu);
    expect(() => createFindingSettlementV2({ ...base, ...approvedSet("defer"), fixTargetId }))
      .toThrow(/resulting target/iu);
  });
});
