import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";
import {
  PACKAGE_DEFAULT_SEVERITY_GATING_POLICY,
  reduceSeveritySettlementGate,
  resolveFindingGating,
} from "../../../../../src/scripts/review-gate/core/severity-gating.js";
import {
  createFindingConversationClosureV2,
  createFindingSettlementV2,
  createLocalDispositionTerminalV2,
  createProviderNativeConversationClosureV2,
} from "../../../../../src/scripts/review-gate/runtime/finding-settlement.js";

const targetId = canonicalDigest({ target: "severity-gating" });
const finding = (findingId: string, severity: "blocker" | "major" | "minor", nit = false) => ({
  findingId,
  sourceIdentity: "codex-pr",
  locus: `src/index.ts:${findingId.length}`,
  sourceVerification: "verified" as const,
  verificationRefs: [`source:${findingId}`],
  severity,
  ...(nit ? { nit: true as const } : {}),
  disposition: "reject" as const,
  gating: "record-only" as const,
  rationale: "The approved disposition is supported by the exact source.",
  recommendation: "Record the disposition without changing the target.",
  openQuestions: [],
});

function approvedSet(
  findings: Array<ReturnType<typeof finding>>,
  minorGating: "blocking" | "record-only" = "record-only",
) {
  const dispositionSet = createDispositionSet({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    targetId,
    policyVersion: canonicalDigest({ minorGating }),
    rubricVersion: "standard-review/v1",
    rubricDigest: canonicalDigest({ rubric: "implementation-audit" }),
    proposedBy: "author-1",
    findings,
  }, { minorGating });
  return approveDispositionState({
    proposed: proposeDispositionSet(dispositionSet),
    approvedBy: "maintainer-1",
    approvedAt: "2026-07-20T20:00:00Z",
  });
}

const nativeClear = { requestedChanges: false, unresolvedRequiredConversations: 0 };

describe("deterministic severity gating", () => {
  it("defaults ordinary minors to record-only, keeps major findings blocking, and forces nits record-only", () => {
    expect(PACKAGE_DEFAULT_SEVERITY_GATING_POLICY).toEqual({ minorGating: "record-only" });
    expect(resolveFindingGating({ severity: "major" }, { minorGating: "record-only" })).toBe("blocking");
    expect(resolveFindingGating({ severity: "minor" }, { minorGating: "blocking" })).toBe("blocking");
    expect(resolveFindingGating({ severity: "minor", nit: true }, { minorGating: "blocking" }))
      .toBe("record-only");
  });

  it("retains mixed severities while only unresolved blocking findings prevent local settlement", () => {
    const dispositionState = approvedSet([
      finding("blocker-1", "blocker"),
      finding("major-1", "major"),
      finding("minor-1", "minor"),
    ]);
    const unresolved = reduceSeveritySettlementGate({
      channel: "local",
      policy: PACKAGE_DEFAULT_SEVERITY_GATING_POLICY,
      dispositionState,
      settlements: [],
      recurrences: [],
      localTerminal: null,
      conversationRequirements: [],
      controllerClosures: [],
      providerClosures: [],
      nativeReview: nativeClear,
    });
    expect(unresolved).toMatchObject({
      terminalSettlementAllowed: false,
      blockingFindingIds: ["blocker-1", "major-1"],
      recordOnlyFindingIds: ["minor-1"],
      promptForAnotherRound: false,
    });

    const localTerminal = createLocalDispositionTerminalV2({
      dispositionState,
      reportRef: "local:disposition-report",
      recordedAt: "2026-07-20T20:01:00Z",
    });
    expect(reduceSeveritySettlementGate({
      channel: "local",
      policy: PACKAGE_DEFAULT_SEVERITY_GATING_POLICY,
      dispositionState,
      settlements: [],
      recurrences: [],
      localTerminal,
      conversationRequirements: [],
      controllerClosures: [],
      providerClosures: [],
      nativeReview: nativeClear,
    })).toMatchObject({ terminalSettlementAllowed: true, blockingFindingIds: [] });
  });

  it("applies both minor policies while grouped nits remain record-only", () => {
    const findings = [finding("minor-1", "minor"), finding("nit-1", "minor", true), finding("nit-2", "minor", true)];
    const blocking = approvedSet(findings, "blocking");
    expect(blocking.dispositionSet.findings.map(({ findingId, gating }) => [findingId, gating])).toEqual([
      ["minor-1", "blocking"],
      ["nit-1", "record-only"],
      ["nit-2", "record-only"],
    ]);
    expect(approvedSet(findings).dispositionSet.findings.every((item) => item.gating === "record-only")).toBe(true);
  });

  it("prompts for another round only when a blocking finding recurs", () => {
    const dispositionState = approvedSet([finding("major-1", "major"), finding("nit-1", "minor", true)]);
    const localTerminal = createLocalDispositionTerminalV2({
      dispositionState,
      reportRef: "local:disposition-report",
      recordedAt: "2026-07-20T20:01:00Z",
    });
    const base = {
      channel: "local" as const,
      policy: PACKAGE_DEFAULT_SEVERITY_GATING_POLICY,
      dispositionState,
      settlements: [],
      localTerminal,
      conversationRequirements: [],
      controllerClosures: [],
      providerClosures: [],
      nativeReview: nativeClear,
    };
    expect(reduceSeveritySettlementGate({
      ...base,
      recurrences: [{
        findingId: "major-recurrence",
        severity: "major",
        locus: "src/index.ts:20",
        evidenceUrlOrId: "review:major-recurrence",
        recursFindingId: "major-1",
      }],
    })).toMatchObject({
      terminalSettlementAllowed: false,
      blockingFindingIds: ["major-1"],
      promptForAnotherRound: true,
    });
    expect(reduceSeveritySettlementGate({
      ...base,
      recurrences: [{
        findingId: "nit-recurrence",
        severity: "minor",
        nit: true,
        locus: "src/index.ts:21",
        evidenceUrlOrId: "review:nit-recurrence",
        recursFindingId: "nit-1",
      }],
    })).toMatchObject({ terminalSettlementAllowed: true, promptForAnotherRound: false });
  });

  it("requires source-confirmed closure for controller findings", () => {
    const dispositionState = approvedSet([finding("major-1", "major")]);
    const normalizedFinding = {
      findingId: "major-1",
      severity: "major" as const,
      locus: "src/index.ts:7",
      evidenceUrlOrId: "review:major-1",
    };
    const settlement = createFindingSettlementV2({
      dispositionState,
      finding: normalizedFinding,
      settledBy: "author-1",
      settledAt: "2026-07-20T20:01:00Z",
      fixTargetId: null,
      verificationRefs: [],
    });
    const base = {
      channel: "hosted" as const,
      policy: PACKAGE_DEFAULT_SEVERITY_GATING_POLICY,
      dispositionState,
      settlements: [settlement],
      recurrences: [],
      localTerminal: null,
      conversationRequirements: [{
        kind: "controller-finding" as const,
        findingId: "major-1",
        sourceIdentity: "codex-pr",
      }],
      providerClosures: [],
      nativeReview: nativeClear,
    };
    expect(reduceSeveritySettlementGate({ ...base, controllerClosures: [] }))
      .toMatchObject({ terminalSettlementAllowed: false, blockers: ["conversation:major-1:unresolved"] });
    const closure = createFindingConversationClosureV2({
      settlement,
      authorityIdentity: "codex-pr",
      sourceConfirmationRef: "codex:major-1:closed",
      hostEvidenceRef: "github:thread-1:resolved",
      closedAt: "2026-07-20T20:02:00Z",
    });
    expect(reduceSeveritySettlementGate({ ...base, controllerClosures: [closure] }))
      .toMatchObject({ terminalSettlementAllowed: true, blockers: [] });
  });

  it("does not let ARC record-only results override provider-native state or required conversations", () => {
    const dispositionState = approvedSet([finding("nit-1", "minor", true)]);
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
    const base = {
      channel: "hosted" as const,
      policy: PACKAGE_DEFAULT_SEVERITY_GATING_POLICY,
      dispositionState,
      settlements: [],
      recurrences: [],
      localTerminal: null,
      conversationRequirements: [{
        kind: "provider-native" as const,
        findingId: "nit-1",
        providerIdentity: "provider-review",
        conversationId: "conversation-1",
        decisiveReviewId: "review-1",
      }],
      controllerClosures: [],
      providerClosures: [providerClosure],
    };
    expect(reduceSeveritySettlementGate({ ...base, nativeReview: nativeClear })).toMatchObject({
      terminalSettlementAllowed: true,
      promptForAnotherRound: false,
    });
    expect(reduceSeveritySettlementGate({
      ...base,
      nativeReview: { requestedChanges: true, unresolvedRequiredConversations: 1 },
    })).toMatchObject({
      terminalSettlementAllowed: false,
      blockers: ["native-requested-changes", "unresolved-required-conversations"],
      promptForAnotherRound: false,
    });
  });
});
