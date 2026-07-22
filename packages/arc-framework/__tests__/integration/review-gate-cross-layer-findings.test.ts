import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../src/lib/kernel/index.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../src/scripts/review-gate/core/dispositions.js";
import { createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewSuspensionState } from "../../src/scripts/review-gate/core/operation-state-schema.js";
import type { ReviewOperationStateStore } from "../../src/scripts/review-gate/core/ports.js";
import { projectReviewResponse } from "../../src/scripts/review-gate/core/response-plan.js";
import {
  PACKAGE_DEFAULT_SEVERITY_GATING_POLICY,
  reduceSeveritySettlementGate,
} from "../../src/scripts/review-gate/core/severity-gating.js";
import { resolveFrontlineFollowUp } from "../../src/scripts/review-gate/policy/frontline-follow-up.js";
import {
  createFindingSettlementV2,
  createLocalDispositionTerminalV2,
  createProviderNativeConversationClosureV2,
} from "../../src/scripts/review-gate/runtime/finding-settlement.js";
import {
  armReviewWakeupFallback,
  humanReentryForTerminalWait,
  validateScheduledReviewWakeup,
} from "../../src/scripts/review-gate/runtime/review-reentry-fallback.js";
import { resolveReviewReentry } from "../../src/scripts/review-gate/runtime/review-reentry.js";

const objectId = (character: string): string => character.repeat(40);
const digest = (value: string): string => canonicalDigest({ value });
const target = (head: string) => createReviewTarget({
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

const reviewedTarget = target("c");
const changedTarget = target("d");
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
const normalizedFindings = [
  { findingId: "major-1", severity: "major" as const, locus: "src/a.ts:7", evidenceUrlOrId: "review:major-1" },
  { findingId: "minor-1", severity: "minor" as const, locus: "src/b.ts:8", evidenceUrlOrId: "review:minor-1" },
  {
    findingId: "nit-1",
    severity: "minor" as const,
    nit: true as const,
    locus: "src/c.ts:9",
    evidenceUrlOrId: "review:nit-1",
  },
];

type Disposition = "fix" | "defer" | "reject";

function approved(dispositions: [Disposition, Disposition, Disposition]) {
  const dispositionSet = createDispositionSet({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    targetId: reviewedTarget.targetId,
    policyVersion: digest("policy"),
    rubricVersion: "independent-analysis/v1",
    rubricDigest: digest("rubric"),
    proposedBy: "author-1",
    findings: normalizedFindings.map((finding, index) => ({
      findingId: finding.findingId,
      sourceIdentity: "codex-pr",
      locus: finding.locus,
      sourceVerification: "verified" as const,
      verificationRefs: [`source:${finding.findingId}`],
      severity: finding.severity,
      ...(finding.nit === true ? { nit: true as const } : {}),
      disposition: dispositions[index]!,
      gating: finding.severity === "major" ? "blocking" as const : "record-only" as const,
      rationale: "The exact source supports this disposition.",
      recommendation: "Apply the approved response.",
      openQuestions: [],
    })),
  });
  return approveDispositionState({
    proposed: proposeDispositionSet(dispositionSet),
    approvedBy: "maintainer-1",
    approvedAt: "2026-07-20T20:00:00Z",
  });
}

function responseInput(dispositionState: ReturnType<typeof approved> | null) {
  return {
    currentTarget: reviewedTarget,
    findings: normalizedFindings,
    routing,
    dispositionState,
    candidateTarget: null,
    persistedTargetId: null,
    verificationPassed: false,
    verificationRefs: [],
    capabilities,
    channel: "local" as const,
    conversations: [],
  };
}

const suspension: ReviewSuspensionState = {
  schemaVersion: 1,
  semanticsVersion: "review-operation/v1",
  operationId: "suspension-review-1",
  updatedAt: "2026-07-20T20:00:00Z",
  kind: "review-suspension",
  vehicle: { kind: "work-unit", identity: "review-architecture" },
  repositoryId: "repo-1",
  changeRequestId: "pull/42",
  targetId: reviewedTarget.targetId,
  requestId: digest("request"),
  sourceIdentity: "codex-pr",
  generation: 1,
  policyVersion: digest("policy"),
  rubricVersion: "independent-analysis/v1",
  rubricDigest: digest("rubric"),
  deadlineAt: "2026-07-20T21:00:00Z",
  wakeupToken: digest("wakeup"),
};

function memoryStore(): ReviewOperationStateStore {
  return {
    readOperation: async () => ({ version: 1, state: suspension }),
    publishOperation: async () => ({ version: 2 }),
  };
}

describe("cross-layer finding response and review re-entry", () => {
  it("carries approved fix, defer, and reject decisions across a mixed-severity local response", () => {
    const fixState = approved(["fix", "defer", "reject"]);
    expect(projectReviewResponse(responseInput(fixState))).toMatchObject({
      state: "ready-to-fix",
      allowedCapabilities: ["fix"],
      fixAuthorization: { authorizedFindingIds: ["major-1"] },
    });

    const nonFixState = approved(["reject", "defer", "reject"]);
    const response = projectReviewResponse(responseInput(nonFixState));
    expect(response).toMatchObject({
      state: "ready-to-close",
      localTerminalRecord: "local-disposition-report",
      channelActions: [],
    });
    const settlements = normalizedFindings.map((finding) => createFindingSettlementV2({
      dispositionState: nonFixState,
      finding,
      settledBy: "maintainer-1",
      settledAt: "2026-07-20T20:01:00Z",
      fixTargetId: null,
      verificationRefs: [],
    }));
    const localTerminal = createLocalDispositionTerminalV2({
      dispositionState: nonFixState,
      reportRef: "local:disposition-report-1",
      recordedAt: "2026-07-20T20:02:00Z",
    });
    expect(reduceSeveritySettlementGate({
      channel: "local",
      policy: PACKAGE_DEFAULT_SEVERITY_GATING_POLICY,
      dispositionState: nonFixState,
      settlements,
      recurrences: [],
      localTerminal,
      conversationRequirements: [],
      controllerClosures: [],
      providerClosures: [],
      nativeReview: { requestedChanges: false, unresolvedRequiredConversations: 0 },
    })).toMatchObject({
      terminalSettlementAllowed: true,
      blockingFindingIds: [],
      recordOnlyFindingIds: ["minor-1", "nit-1"],
      blockers: [],
    });
  });

  it("keeps provider-native conversation authority decisive for hosted closure", () => {
    const dispositionState = approved(["reject", "defer", "reject"]);
    const response = projectReviewResponse({
      ...responseInput(dispositionState),
      channel: "hosted",
      conversations: [{
        kind: "provider-native",
        findingId: "nit-1",
        immutableLocus: "src/c.ts:9",
        providerReplyHandle: "provider:reply-1",
        threadStateHandle: "provider:conversation-1",
        decisiveReviewHandle: "provider:review-1",
        canReply: true,
      }],
    });
    expect(response.channelActions).toEqual([expect.objectContaining({
      kind: "provider-native",
      requiredClosure: "provider-native-decisive",
      decisiveReviewHandle: "provider:review-1",
    })]);

    const providerClosure = createProviderNativeConversationClosureV2({
      targetId: reviewedTarget.targetId,
      providerIdentity: "provider-review",
      conversationId: "conversation-1",
      decisiveReviewId: "review-1",
      decisiveState: "approved",
      conversationState: "resolved",
      decisiveEvidenceRef: "provider:review-1:approved",
      conversationEvidenceRef: "provider:conversation-1:resolved",
      observedAt: "2026-07-20T20:02:00Z",
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
    expect(reduceSeveritySettlementGate({
      ...base,
      nativeReview: { requestedChanges: false, unresolvedRequiredConversations: 0 },
    })).toMatchObject({ terminalSettlementAllowed: true, blockers: [] });
    expect(reduceSeveritySettlementGate({
      ...base,
      nativeReview: { requestedChanges: true, unresolvedRequiredConversations: 1 },
    })).toMatchObject({
      terminalSettlementAllowed: false,
      blockers: ["native-requested-changes", "unresolved-required-conversations"],
    });
  });

  it("preserves suspension until scheduled or human re-entry and rejects stale or timed-out state", async () => {
    const suspended = await resolveReviewReentry(memoryStore(), {
      suspension,
      observedAt: "2026-07-20T20:30:00Z",
    }, { observe: async () => ({ currentTarget: reviewedTarget, reviewState: "pending", responseInput: null }) });
    expect(suspended).toMatchObject({ state: "suspended", targetId: reviewedTarget.targetId });

    await expect(armReviewWakeupFallback({
      schedule: async () => ({ status: "scheduled", wakeupRef: "harness:wakeup-1" }),
    }, suspension, "2026-07-20T20:45:00Z")).resolves.toEqual({
      kind: "scheduled",
      scheduledFor: "2026-07-20T20:45:00Z",
      wakeupRef: "harness:wakeup-1",
    });
    await expect(armReviewWakeupFallback(null, suspension, "2026-07-20T20:45:00Z"))
      .resolves.toMatchObject({ kind: "human", reason: "scheduled-wakeup-unavailable" });

    const invocation = {
      operationId: suspension.operationId,
      targetId: suspension.targetId,
      requestId: suspension.requestId,
      generation: suspension.generation,
      wakeupToken: suspension.wakeupToken,
    };
    expect(validateScheduledReviewWakeup(invocation, suspension)).toEqual({ current: true });
    expect(validateScheduledReviewWakeup({ ...invocation, generation: 2 }, suspension))
      .toEqual({ current: false, reason: "stale-wakeup" });

    const stale = await resolveReviewReentry(memoryStore(), {
      suspension,
      observedAt: "2026-07-20T20:30:00Z",
    }, { observe: async () => ({ currentTarget: changedTarget, reviewState: "clean", responseInput: null }) });
    expect(stale).toMatchObject({ state: "stale-target", targetId: changedTarget.targetId });

    const timedOut = await resolveReviewReentry(memoryStore(), {
      suspension,
      observedAt: suspension.deadlineAt,
    }, { observe: async () => ({ currentTarget: reviewedTarget, reviewState: "pending", responseInput: null }) });
    expect(timedOut).toMatchObject({ state: "timed-out" });
    expect(humanReentryForTerminalWait(timedOut, suspension)).toMatchObject({
      kind: "human",
      reason: "review-timed-out",
    });
  });

  it("stops a material-fix follow-up when the configured pass cap is exhausted", () => {
    const dispositionState = approved(["fix", "defer", "reject"]);
    expect(resolveFrontlineFollowUp({
      outcome: {
        schemaVersion: 1,
        semanticsVersion: "frontline-review/v1",
        outcome: "findings",
        source: { sourceId: "codex-pr", kind: "command", executable: "reviewer", argv: ["--plain"] },
        target: reviewedTarget,
        pass: 1,
        maxPasses: 1,
        findings: normalizedFindings,
        reason: null,
      },
      dispositionState,
      changedTarget,
    })).toEqual({ action: "stop", reason: "pass-cap-exhausted" });
  });
});
