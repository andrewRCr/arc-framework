import { describe, expect, it } from "vitest";

import type { Evidence } from "../../../../../src/scripts/review-gate/core/evidence.js";
import type { ReceiptEnvelope, ReviewReceipt, SourceCapacity } from "../../../../../src/scripts/review-gate/core/execution.js";
import { computeChangeSetId, computePolicyVersion } from "../../../../../src/scripts/review-gate/core/identity.js";
import type { LifecycleTailProof } from "../../../../../src/scripts/review-gate/core/lifecycle-tail.js";
import { COMMAND_RECEIPT_SOURCE } from "../../../../../src/scripts/review-gate/core/command-receipts.js";
import { createReceipt } from "../../../../../src/scripts/review-gate/core/request-key.js";
import {
  extractAuthenticatedReceiptEvidence,
} from "../../../../../src/scripts/review-gate/core/reduction.js";
import {
  reduceSelfHostingGate,
  type SelfHostingGateReductionInput,
} from "../../../../../src/scripts/review-gate/policy/self-hosting/reduction.js";
import {
  SELF_HOSTING_POLICY,
  type SelfHostingPolicy,
} from "../../../../../src/scripts/review-gate/policy/self-hosting/schema.js";

const changeRequest = {
  schemaVersion: 1 as const,
  repositoryId: "100",
  changeRequestId: "PR_node",
  hostRef: "refs/pull/7/head",
  baseRef: "main",
  baseSha: "a".repeat(40),
  diffBaseSha: "b".repeat(40),
  headSha: "c".repeat(40),
  changeSetId: "d".repeat(64),
};

const nativeReview = {
  requestedChanges: false,
  unresolvedRequiredConversations: 0,
  decision: "not-configured" as const,
};

function input(overrides: Partial<SelfHostingGateReductionInput> = {}): SelfHostingGateReductionInput {
  return {
    policy: SELF_HOSTING_POLICY,
    changeRequest,
    lane: { lane: "auto" as const, reasons: ["author-owned-artifacts" as const] },
    risk: { risk: "routine" as const, reasons: ["routine-doc-surface" as const] },
    evidence: [],
    receipts: [],
    capacities: [],
    readiness: { draft: false, mergeability: "mergeable" as const, baseFresh: true },
    ciState: "success" as const,
    nativeReview,
    authorizedDismissers: [],
    knownHostActors: [],
    inconsistencies: [],
    ledgerVersion: 0,
    receiptRefs: [],
    actorIdentity: SELF_HOSTING_POLICY.providerIdentities.appBotUserId,
    ...overrides,
  };
}

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    schemaVersion: 1,
    requirementId: "independent-analysis",
    sourceKind: "agent",
    sourceIdentity: "codex-cli",
    result: "clean",
    evidenceUrlOrId: "https://example.test/review/run-1",
    policyVersion: computePolicyVersion({ policy: SELF_HOSTING_POLICY }),
    rubricVersion: "independent-analysis/v1",
    coverage: "full",
    coverageFromSha: changeRequest.diffBaseSha,
    coverageThroughSha: changeRequest.headSha,
    baseRef: changeRequest.baseRef,
    diffBaseSha: changeRequest.diffBaseSha,
    changeSetId: changeRequest.changeSetId,
    headSha: changeRequest.headSha,
    findings: [],
    closures: [],
    observedAt: "2026-07-11T20:00:00.000Z",
    ...overrides,
  };
}

function lifecycleTail(policy = SELF_HOSTING_POLICY, sourceIdentity = "codex-cli"): LifecycleTailProof {
  return {
    schemaVersion: 1,
    predicateId: policy.lifecycleTailPredicate.id,
    reviewedThroughSha: "e".repeat(40),
    currentHeadSha: changeRequest.headSha,
    baseRef: changeRequest.baseRef,
    diffBaseSha: changeRequest.diffBaseSha,
    policyVersion: computePolicyVersion({ policy }),
    rubricVersion: "independent-analysis/v1",
    sourceIdentity,
    artifact: { workUnitId: "review-gate", artifactGroupId: "review-gate", cohortPath: null },
    diagnostics: [],
  };
}

function coderabbitPolicy(additional = false): SelfHostingPolicy {
  const [coderabbit, ...otherQualifications] = SELF_HOSTING_POLICY.qualifications;
  if (coderabbit === undefined) throw new Error("missing CodeRabbit policy fixture");
  const qualified = {
    ...coderabbit,
    mode: "enabled" as const,
    exactCoverage: true,
    durableResults: true,
    distinctOutcomes: true,
    closureCapability: true,
  };
  return {
    ...SELF_HOSTING_POLICY,
    qualifications: [
      qualified,
      ...(additional ? [{ ...qualified, sourceIdentity: "other-provider" }] : []),
      ...otherQualifications,
    ],
  };
}

function capacity(sourceIdentity = "coderabbit-pr"): SourceCapacity {
  return {
    schemaVersion: 1,
    sourceIdentity,
    status: "available",
    reason: "provider-reported",
    provenance: `capacity:${sourceIdentity}`,
    observedAt: "2026-07-11T20:00:00.000Z",
  };
}

function admittedReceipt(policy: SelfHostingPolicy): ReviewReceipt {
  return {
    schemaVersion: 1,
    eventId: "request:reserved",
    idempotencyKey: "request-key",
    previousLedgerVersion: 0,
    receiptHash: "e".repeat(64),
    action: "reserved",
    request: {
      schemaVersion: 1,
      repositoryId: changeRequest.repositoryId,
      changeRequestId: changeRequest.changeRequestId,
      changeSetId: changeRequest.changeSetId,
      policyVersion: computePolicyVersion({ policy }),
      semanticsVersion: "review-gate/v1",
      rubricVersion: "independent-analysis/v1",
      requirementId: "independent-analysis",
      sourceIdentity: "coderabbit-pr",
      coverage: "full",
      coverageFromSha: changeRequest.diffBaseSha,
      coverageThroughSha: changeRequest.headSha,
      generation: 0,
      actorIdentity: SELF_HOSTING_POLICY.providerIdentities.appBotUserId,
      requestMechanism: "automatic",
      requiredActorIdentity: SELF_HOSTING_POLICY.providerIdentities.appBotUserId,
      requestCommand: null,
    },
    result: null,
    reason: null,
    evidenceUrlOrId: null,
    findingIds: [],
    payload: { kind: "reservation", reservedAt: null, pendingProjectionRef: null },
  };
}

function requiredReceipt(policy: SelfHostingPolicy): ReviewReceipt {
  return createReceipt({
    eventId: "command:IC_1:required",
    previousLedgerVersion: 0,
    action: "required",
    request: {
      schemaVersion: 1,
      repositoryId: changeRequest.repositoryId,
      changeRequestId: changeRequest.changeRequestId,
      changeSetId: changeRequest.changeSetId,
      policyVersion: computePolicyVersion({ policy }),
      semanticsVersion: "review-gate/v1",
      rubricVersion: "independent-analysis/v1",
      requirementId: "independent-analysis",
      sourceIdentity: COMMAND_RECEIPT_SOURCE,
      coverage: "full",
      coverageFromSha: changeRequest.diffBaseSha,
      coverageThroughSha: changeRequest.headSha,
      generation: 0,
      actorIdentity: "7",
      requestMechanism: "authorized-command",
      requiredActorIdentity: "7",
      requestCommand: null,
    },
    result: null,
    reason: "run independent analysis",
    evidenceUrlOrId: "https://github.test/pull/7#issuecomment-1",
    findingIds: [],
    payload: { kind: "decision", decidedAt: null },
  });
}

function waivedReceipt(policy: SelfHostingPolicy): ReviewReceipt {
  return createReceipt({
    eventId: "command:IC_2:waived",
    previousLedgerVersion: 0,
    action: "waived",
    request: {
      schemaVersion: 1,
      repositoryId: changeRequest.repositoryId,
      changeRequestId: changeRequest.changeRequestId,
      changeSetId: changeRequest.changeSetId,
      policyVersion: computePolicyVersion({ policy }),
      semanticsVersion: "review-gate/v1",
      rubricVersion: "independent-analysis/v1",
      requirementId: "independent-analysis",
      sourceIdentity: COMMAND_RECEIPT_SOURCE,
      coverage: "full",
      coverageFromSha: changeRequest.diffBaseSha,
      coverageThroughSha: changeRequest.headSha,
      generation: 0,
      actorIdentity: "7",
      requestMechanism: "authorized-command",
      requiredActorIdentity: "7",
      requestCommand: null,
    },
    result: null,
    reason: "accepted operational risk",
    evidenceUrlOrId: "https://github.test/pull/7#issuecomment-2",
    findingIds: [],
    payload: { kind: "decision", decidedAt: null },
  });
}

function dismissalReceipt(policy: SelfHostingPolicy, sourceIdentity = "codex-cli"): ReviewReceipt {
  return createReceipt({
    eventId: `command:IC_3:dismiss:${sourceIdentity}`,
    previousLedgerVersion: 0,
    action: "dismissed",
    request: {
      schemaVersion: 1,
      repositoryId: changeRequest.repositoryId,
      changeRequestId: changeRequest.changeRequestId,
      changeSetId: changeRequest.changeSetId,
      policyVersion: computePolicyVersion({ policy }),
      semanticsVersion: "review-gate/v1",
      rubricVersion: "independent-analysis/v1",
      requirementId: "independent-analysis",
      sourceIdentity,
      coverage: "full",
      coverageFromSha: changeRequest.diffBaseSha,
      coverageThroughSha: changeRequest.headSha,
      generation: 0,
      actorIdentity: "maintainer-1",
      requestMechanism: "authorized-command",
      requiredActorIdentity: "maintainer-1",
      requestCommand: null,
    },
    result: null,
    reason: "not applicable",
    evidenceUrlOrId: "https://github.test/pull/7#issuecomment-3",
    findingIds: ["finding-1"],
    payload: { kind: "decision", decidedAt: null },
  });
}

describe("self-hosting gate reduction", () => {
  it("reduces only normalized evidence recovered from authenticated receipt envelopes", () => {
    const normalized = evidence();
    const attestation = createReceipt({
      eventId: "attestation:run-1:digest",
      previousLedgerVersion: 0,
      action: "unadmitted",
      request: {
        schemaVersion: 1,
        repositoryId: changeRequest.repositoryId,
        changeRequestId: changeRequest.changeRequestId,
        changeSetId: normalized.changeSetId,
        policyVersion: normalized.policyVersion,
        semanticsVersion: "review-gate/v1",
        rubricVersion: normalized.rubricVersion,
        requirementId: normalized.requirementId,
        sourceIdentity: normalized.sourceIdentity,
        coverage: normalized.coverage,
        coverageFromSha: normalized.coverageFromSha,
        coverageThroughSha: normalized.coverageThroughSha,
        generation: 0,
        actorIdentity: "maintainer-1",
        requestMechanism: "attestation",
        requiredActorIdentity: "maintainer-1",
        requestCommand: null,
      },
      result: normalized.result,
      evidenceUrlOrId: normalized.evidenceUrlOrId,
      findingIds: [],
      payload: {
        kind: "terminal-evidence",
        terminalAt: normalized.observedAt,
        evidenceRefs: [normalized.evidenceUrlOrId],
        findingIds: [],
      },
      evidence: normalized,
    });
    const envelopes: ReceiptEnvelope[] = [{
      schemaVersion: 1,
      durableRecordId: "IC_attestation",
      recordedAt: normalized.observedAt,
      lastModifiedAt: normalized.observedAt,
      ledgerVersion: 1,
      receipt: attestation,
    }];

    const recovered = extractAuthenticatedReceiptEvidence(envelopes);
    expect(recovered).toEqual([normalized]);
    expect(reduceSelfHostingGate(input({
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      evidence: recovered,
    })).projection).toMatchObject({
      conclusion: "success",
      requirementExecutions: [{ state: "clean", sourceIdentity: "codex-cli" }],
      evidence: [{ evidenceRef: normalized.evidenceUrlOrId }],
    });
    expect(extractAuthenticatedReceiptEvidence([{
      schemaVersion: 1,
      durableRecordId: "IC_summary",
      recordedAt: normalized.observedAt,
      lastModifiedAt: normalized.observedAt,
      ledgerVersion: 1,
      receipt: admittedReceipt(SELF_HOSTING_POLICY),
    }])).toEqual([]);
  });

  it("projects an exempt automatic-lane change truthfully", () => {
    const decision = reduceSelfHostingGate(input());

    expect(decision.request).toBeNull();
    expect(decision.projection).toMatchObject({
      conclusion: "success",
      summary: "review: inapplicable",
      requirementExecutions: [],
      policyDecision: { disposition: "exempt" },
    });
  });

  it("reduces current clean full coverage to success", () => {
    const decision = reduceSelfHostingGate(input({
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      evidence: [evidence()],
    }));

    expect(decision.request).toBeNull();
    expect(decision.projection).toMatchObject({
      conclusion: "success",
      requirementExecutions: [{
        requirementId: "independent-analysis",
        state: "clean",
        sourceIdentity: "codex-cli",
      }],
    });
  });

  it("carries exact reviewed evidence through a valid lifecycle tail", () => {
    const tail = lifecycleTail();
    const reviewedEvidence = evidence({
      headSha: tail.reviewedThroughSha,
      coverageThroughSha: tail.reviewedThroughSha,
      changeSetId: computeChangeSetId({
        baseRef: changeRequest.baseRef,
        diffBaseSha: changeRequest.diffBaseSha,
        headSha: tail.reviewedThroughSha,
      }),
    });
    const decision = reduceSelfHostingGate(input({
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      evidence: [reviewedEvidence],
      lifecycleTail: tail,
    }));

    expect(decision.projection).toMatchObject({
      conclusion: "success",
      requirementExecutions: [{ state: "clean", detail: "carried forward by lifecycle tail" }],
      evidence: [{ evidenceRef: reviewedEvidence.evidenceUrlOrId }],
    });
  });

  it("keeps an open reviewed finding blocking across an otherwise valid lifecycle tail", () => {
    const tail = lifecycleTail();
    const reviewedChangeSetId = computeChangeSetId({
      baseRef: changeRequest.baseRef,
      diffBaseSha: changeRequest.diffBaseSha,
      headSha: tail.reviewedThroughSha,
    });
    const clean = evidence({
      headSha: tail.reviewedThroughSha,
      coverageThroughSha: tail.reviewedThroughSha,
      changeSetId: reviewedChangeSetId,
    });
    const finding = evidence({
      headSha: tail.reviewedThroughSha,
      coverageThroughSha: tail.reviewedThroughSha,
      changeSetId: reviewedChangeSetId,
      result: "findings",
      findings: [{
        findingId: "finding-1",
        severity: "high",
        locus: "src/controller.ts:10",
        evidenceUrlOrId: "https://example.test/findings/1",
      }],
      observedAt: "2026-07-11T21:00:00.000Z",
    });
    const decision = reduceSelfHostingGate(input({
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      evidence: [clean, finding],
      lifecycleTail: tail,
    }));

    expect(decision.projection).toMatchObject({
      conclusion: "failure",
      requirementExecutions: [{ state: "findings" }],
    });
  });

  it("keeps native requested changes blocking after lifecycle-tail carry-forward", () => {
    const tail = lifecycleTail();
    const reviewedEvidence = evidence({
      headSha: tail.reviewedThroughSha,
      coverageThroughSha: tail.reviewedThroughSha,
      changeSetId: computeChangeSetId({
        baseRef: changeRequest.baseRef,
        diffBaseSha: changeRequest.diffBaseSha,
        headSha: tail.reviewedThroughSha,
      }),
    });
    const decision = reduceSelfHostingGate(input({
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      evidence: [reviewedEvidence],
      lifecycleTail: tail,
      nativeReview: { ...nativeReview, requestedChanges: true, decision: "changes-requested" },
    }));

    expect(decision.projection).toMatchObject({
      conclusion: "failure",
      blockers: expect.arrayContaining([expect.objectContaining({ code: "native-requested-changes" })]),
    });
  });

  it("does not treat a lifecycle proof as independent analysis evidence", () => {
    const decision = reduceSelfHostingGate(input({
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      lifecycleTail: lifecycleTail(),
    }));

    expect(decision.projection).toMatchObject({
      conclusion: "pending",
      evidence: [],
      requirementExecutions: [{ state: "not-requested" }],
    });
  });

  it("replaces an otherwise green projection when the receipt ledger is unavailable", () => {
    const decision = reduceSelfHostingGate(input({
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      evidence: [evidence()],
      inconsistencies: ["ledger-unavailable"],
      ledgerVersion: null,
    }));

    expect(decision.request).toBeNull();
    expect(decision.projection).toMatchObject({
      conclusion: "failure",
      ledgerVersion: null,
      blockers: expect.arrayContaining([expect.objectContaining({ code: "ledger-unavailable" })]),
    });
  });

  it("suppresses an admitted provider request when controller state is inconsistent", () => {
    const decision = reduceSelfHostingGate(input({
      policy: coderabbitPolicy(),
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      capacities: [capacity()],
      inconsistencies: ["ledger-fork"],
      ledgerVersion: 0,
    }));

    expect(decision.request).toBeNull();
    expect(decision.projection).toMatchObject({
      conclusion: "failure",
      blockers: expect.arrayContaining([expect.objectContaining({ code: "ledger-fork" })]),
    });
  });

  it("accepts the policy-qualified non-author human attestation source", () => {
    const decision = reduceSelfHostingGate(input({
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      evidence: [evidence({
        sourceKind: "human",
        sourceIdentity: "reviewer-42",
        reviewerClaim: "qualified-non-author-human",
      })],
    }));

    expect(decision.projection).toMatchObject({
      conclusion: "success",
      requirementExecutions: [{ state: "clean", sourceIdentity: "reviewer-42" }],
    });
  });

  it.each([
    ["open findings", evidence({
      result: "findings",
      findings: [{
        findingId: "finding-1",
        severity: "high",
        locus: "src/controller.ts:10",
        evidenceUrlOrId: "https://example.test/findings/1",
      }],
    })],
    ["failed evidence", evidence({ result: "failed" })],
  ])("reduces %s to failure", (_name, item) => {
    const decision = reduceSelfHostingGate(input({
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      evidence: [item],
    }));

    expect(decision.projection.conclusion).toBe("failure");
  });

  it("keeps attestation-only obligations pending without an automatic request", () => {
    const decision = reduceSelfHostingGate(input({
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
    }));

    expect(decision.request).toBeNull();
    expect(decision.projection).toMatchObject({
      conclusion: "pending",
      requirementExecutions: [{ state: "not-requested" }],
    });
  });

  it("does not invoke a disabled or unqualified durable-record declaration", () => {
    const decision = reduceSelfHostingGate(input({
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      capacities: [capacity()],
    }));

    expect(decision.request).toBeNull();
    expect(decision.projection.requirementExecutions[0]?.state).toBe("not-requested");
  });

  it("elevates a current require receipt into normal generation-zero admission", () => {
    const policy = coderabbitPolicy();
    const decision = reduceSelfHostingGate(input({
      policy,
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "routine", reasons: ["routine-doc-surface"] },
      capacities: [capacity()],
      receipts: [requiredReceipt(policy)],
    }));

    expect(decision.request).toMatchObject({ sourceIdentity: "coderabbit-pr", generation: 0, coverage: "full" });
  });

  it("applies a waiver only while its requirement scope is current", () => {
    const current = reduceSelfHostingGate(input({
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      receipts: [waivedReceipt(SELF_HOSTING_POLICY)],
    }));
    const stale = reduceSelfHostingGate(input({
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      receipts: [createReceipt({
        eventId: "command:IC_2:stale-waived",
        previousLedgerVersion: 0,
        action: "waived",
        request: {
          ...waivedReceipt(SELF_HOSTING_POLICY).request,
          policyVersion: "f".repeat(64),
        },
        result: null,
        reason: "accepted operational risk",
        evidenceUrlOrId: "https://github.test/pull/7#issuecomment-2",
        findingIds: [],
        payload: { kind: "decision", decidedAt: null },
      })],
    }));

    expect(current.projection.requirementExecutions[0]).toMatchObject({ state: "waived" });
    expect(stale.projection.requirementExecutions[0]).toMatchObject({ state: "not-requested" });
  });

  it("closes only the exact source-scoped finding without manufacturing clean evidence", () => {
    const finding = evidence({
      result: "findings",
      findings: [{
        findingId: "finding-1",
        severity: "high",
        locus: "src/controller.ts:10",
        evidenceUrlOrId: "https://example.test/findings/1",
      }],
    });
    const dismissed = reduceSelfHostingGate(input({
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      evidence: [finding],
      receipts: [dismissalReceipt(SELF_HOSTING_POLICY)],
      authorizedDismissers: ["maintainer-1"],
    }));
    const crossSource = reduceSelfHostingGate(input({
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      evidence: [finding],
      receipts: [dismissalReceipt(SELF_HOSTING_POLICY, "other-source")],
      authorizedDismissers: ["maintainer-1"],
    }));

    expect(dismissed.projection.requirementExecutions[0]).toMatchObject({ state: "not-requested" });
    expect(dismissed.projection.conclusion).toBe("pending");
    expect(crossSource.projection.conclusion).toBe("failure");
  });

  it.each([
    ["exhausted", { status: "exhausted" as const, reason: "provider-reported" as const }],
    ["lookup failure", { status: "unknown" as const, reason: "lookup-failed" as const }],
  ])("does not admit when provider capacity is %s", (_name, capacityOverride) => {
    const policy = coderabbitPolicy();
    const decision = reduceSelfHostingGate(input({
      policy,
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      capacities: [{ ...capacity(), ...capacityOverride }],
    }));

    expect(decision.request).toBeNull();
    expect(decision.projection.conclusion).toBe("failure");
  });

  it("admits one qualified invokable provider request and never re-admits its history", () => {
    const policy = coderabbitPolicy();
    const first = reduceSelfHostingGate(input({
      policy,
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      capacities: [capacity()],
    }));
    expect(first.request).toMatchObject({
      sourceIdentity: "coderabbit-pr",
      generation: 0,
      coverage: "full",
      semanticsVersion: "review-gate/v1",
      requestMechanism: "automatic",
      requiredActorIdentity: SELF_HOSTING_POLICY.providerIdentities.appBotUserId,
    });

    const replay = reduceSelfHostingGate(input({
      policy,
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      capacities: [capacity()],
      receipts: [admittedReceipt(policy)],
    }));
    expect(replay.request).toBeNull();
    expect(replay.projection.requirementExecutions[0]?.state).toBe("queued");
  });

  it("selects the first qualified provider while retaining later fallback candidates", () => {
    const decision = reduceSelfHostingGate(input({
      policy: coderabbitPolicy(true),
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      capacities: [capacity(), capacity("other-provider")],
    }));

    expect(decision.request).toMatchObject({ sourceIdentity: "coderabbit-pr" });
    expect(decision.projection.conclusion).toBe("pending");
  });

  it("selects an alternate only after the capacity supersession is durable", () => {
    const policy = coderabbitPolicy(true);
    const first = reduceSelfHostingGate(input({
      policy,
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      capacities: [
        { ...capacity(), status: "exhausted", reason: "provider-reported" },
        capacity("other-provider"),
      ],
      now: new Date("2026-07-12T20:00:00.000Z"),
    }));
    expect(first.request).toBeNull();
    expect(first.receiptsToAppend).toEqual([
      expect.objectContaining({ action: "source-superseded", request: expect.objectContaining({ sourceIdentity: "coderabbit-pr" }) }),
    ]);

    const second = reduceSelfHostingGate(input({
      policy,
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      receipts: first.receiptsToAppend,
      capacities: [capacity(), capacity("other-provider")],
      ledgerVersion: 1,
    }));
    expect(second.request).toMatchObject({ sourceIdentity: "other-provider" });
  });

  it("consumes qualified provider approval through the ordinary evidence reducers", () => {
    const policy = coderabbitPolicy();
    const approved = evidence({
      sourceIdentity: "coderabbit-pr",
      policyVersion: computePolicyVersion({ policy }),
      evidenceUrlOrId: "https://github.test/pull/7#pullrequestreview-1",
    });
    const decision = reduceSelfHostingGate(input({
      policy,
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      evidence: [approved],
      capacities: [capacity()],
    }));

    expect(decision.request).toBeNull();
    expect(decision.projection).toMatchObject({
      conclusion: "success",
      requirementExecutions: [{ state: "clean", sourceIdentity: "coderabbit-pr" }],
    });
  });

  it("keeps prior-change evidence stale and pending", () => {
    const decision = reduceSelfHostingGate(input({
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      evidence: [evidence({ changeSetId: "f".repeat(64), headSha: "9".repeat(40) })],
    }));

    expect(decision.projection).toMatchObject({
      conclusion: "pending",
      requirementExecutions: [{ state: "stale" }],
    });
  });

  it.each([
    ["CI pending", { ciState: "pending" as const }, "pending"],
    ["CI failure", { ciState: "failure" as const }, "failure"],
    ["merge conflict", {
      readiness: { draft: false, mergeability: "conflicting" as const, baseFresh: true },
    }, "failure"],
    ["native changes requested", {
      nativeReview: { ...nativeReview, requestedChanges: true, decision: "changes-requested" as const },
    }, "failure"],
  ])("composes %s into a %s conclusion", (_name, overrides, conclusion) => {
    const decision = reduceSelfHostingGate(input({
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
      evidence: [evidence()],
      ...overrides,
    }));

    expect(decision.projection.conclusion).toBe(conclusion);
  });
});
