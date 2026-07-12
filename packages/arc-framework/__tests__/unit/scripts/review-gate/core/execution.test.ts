import { describe, expect, it } from "vitest";

import {
  parseCapacity,
  parseGateProjection,
  parseReceiptEnvelope,
  parseReviewRequest,
} from "../../../../../src/scripts/review-gate/core/execution.js";

const request = {
  schemaVersion: 1,
  repositoryId: "repo-1",
  changeRequestId: "change-7",
  changeSetId: "a".repeat(64),
  policyVersion: "b".repeat(64),
  semanticsVersion: "review-gate/v1",
  rubricVersion: "independent-analysis/v1",
  requirementId: "independent-analysis",
  sourceIdentity: "agent-9",
  coverage: "full",
  coverageFromSha: "c".repeat(40),
  coverageThroughSha: "d".repeat(40),
  generation: 0,
  actorIdentity: "controller-1",
  requestMechanism: "automatic",
  requiredActorIdentity: "controller-1",
  requestCommand: null,
};

const receipt = {
  schemaVersion: 1,
  eventId: "event-1",
  idempotencyKey: "request-1:g0:reserved",
  previousLedgerVersion: 3,
  receiptHash: "e".repeat(64),
  action: "reserved",
  request,
  result: null,
  reason: null,
  evidenceUrlOrId: null,
  findingIds: [],
  payload: { kind: "reservation", reservedAt: null, pendingProjectionRef: null },
};

const envelope = {
  schemaVersion: 1,
  durableRecordId: "record-9",
  recordedAt: "2026-07-10T20:00:00.000Z",
  lastModifiedAt: "2026-07-10T20:00:00.000Z",
  ledgerVersion: 4,
};

const evidence = {
  schemaVersion: 1,
  requirementId: request.requirementId,
  sourceKind: "agent",
  sourceIdentity: request.sourceIdentity,
  result: "clean",
  evidenceUrlOrId: "https://example.test/evidence/run-1",
  reviewRunId: "run-1",
  reviewerClaim: "agent-9",
  submitterIdentity: request.actorIdentity,
  policyVersion: request.policyVersion,
  rubricVersion: request.rubricVersion,
  coverage: request.coverage,
  coverageFromSha: request.coverageFromSha,
  coverageThroughSha: request.coverageThroughSha,
  baseRef: "main",
  diffBaseSha: request.coverageFromSha,
  changeSetId: request.changeSetId,
  headSha: request.coverageThroughSha,
  findings: [],
  closures: [],
  observedAt: "2026-07-10T20:00:00.000Z",
};

describe("request and projection contracts", () => {
  it("round-trips request identity and generation", () => {
    expect(parseReviewRequest(request)).toEqual(request);
  });

  it("round-trips an exact actor-bound user-trigger request", () => {
    const triggered = {
      ...request,
      requestMechanism: "user-trigger",
      requestCommand: "@codex review the exact head",
    };
    expect(parseReviewRequest(triggered)).toEqual(triggered);
  });

  it("validates capacity status and reason pairs", () => {
    expect(parseCapacity({
      schemaVersion: 1,
      sourceIdentity: "agent-9",
      status: "available",
      reason: "provider-reported",
      provenance: "capacity:lookup-7",
      observedAt: "2026-07-10T20:00:00.000Z",
    })).toMatchObject({ status: "available", reason: "provider-reported" });
    expect(() => parseCapacity({
      schemaVersion: 1,
      sourceIdentity: "agent-9",
      status: "unknown",
      reason: "provider-reported",
      provenance: "capacity:lookup-7",
      observedAt: "2026-07-10T20:00:00.000Z",
    })).toThrow();
  });

  it("round-trips a versioned receipt storage envelope", () => {
    const stored = { ...envelope, receipt };
    expect(parseReceiptEnvelope(stored)).toEqual(stored);
  });

  it.each([
    ["reservation", {
      ...receipt,
      payload: {
        kind: "reservation",
        reservedAt: "2026-07-10T20:00:00.000Z",
        pendingProjectionRef: "check-run:41",
      },
    }],
    ["acknowledgement", {
      ...receipt,
      action: "acknowledged",
      evidenceUrlOrId: "provider-run:77",
      payload: {
        kind: "acknowledgement",
        acknowledgedAt: "2026-07-10T20:01:00.000Z",
        acknowledgementRef: "provider-run:77",
        trigger: {
          mechanism: request.requestMechanism,
          eventId: "trigger-1",
          actorIdentity: request.requiredActorIdentity,
          occurredAt: "2026-07-10T20:00:30.000Z",
          headSha: request.coverageThroughSha,
        },
      },
    }],
    ["terminal evidence", {
      ...receipt,
      action: "terminal-failure",
      result: "failed",
      evidenceUrlOrId: "provider-run:77",
      payload: {
        kind: "terminal-evidence",
        terminalAt: "2026-07-10T20:02:00.000Z",
        evidenceRefs: ["provider-run:77"],
        findingIds: [],
      },
    }],
    ["finding lifecycle", {
      ...receipt,
      action: "finding-opened",
      findingIds: ["finding-1"],
      payload: {
        kind: "finding-lifecycle",
        findingId: "finding-1",
        origin: {
          sourceIdentity: request.sourceIdentity,
          evidenceRef: "provider-run:77#finding-1",
          headSha: request.coverageThroughSha,
        },
        carriedThroughHeadSha: "e".repeat(40),
        settlement: { state: "open", settledAt: null, evidenceRef: null },
      },
    }],
    ["contamination", {
      ...receipt,
      action: "contaminated",
      payload: {
        kind: "contamination",
        detectedAt: "2026-07-10T20:03:00.000Z",
        eventRef: "push:event-9",
        reason: "unowned head mutation",
      },
    }],
    ["supersession", {
      ...receipt,
      action: "superseded",
      payload: {
        kind: "supersession",
        supersededAt: "2026-07-10T20:04:00.000Z",
        successorRequestKey: "f".repeat(64),
        reason: "new request generation",
      },
    }],
    ["decision", {
      ...receipt,
      action: "required",
      payload: { kind: "decision", decidedAt: "2026-07-10T20:05:00.000Z" },
    }],
  ])("round-trips the %s payload", (_name, payloadReceipt) => {
    const stored = { ...envelope, receipt: payloadReceipt };
    expect(parseReceiptEnvelope(stored)).toEqual(stored);
  });

  it("round-trips normalized evidence on an attestation receipt", () => {
    const attestationReceipt = {
      ...receipt,
      action: "unadmitted",
      result: "clean",
      evidenceUrlOrId: evidence.evidenceUrlOrId,
      payload: {
        kind: "terminal-evidence",
        terminalAt: null,
        evidenceRefs: [evidence.evidenceUrlOrId],
        findingIds: [],
      },
      evidence,
    };
    expect(parseReceiptEnvelope({
      schemaVersion: 1,
      durableRecordId: "record-10",
      recordedAt: "2026-07-10T20:00:00.000Z",
      lastModifiedAt: "2026-07-10T20:00:00.000Z",
      ledgerVersion: 5,
      receipt: attestationReceipt,
    }).receipt.evidence).toEqual(evidence);
  });

  it("requires evidence on attestation receipts and forbids it on lifecycle receipts", () => {
    const envelope = {
      schemaVersion: 1,
      durableRecordId: "record-10",
      recordedAt: "2026-07-10T20:00:00.000Z",
      lastModifiedAt: "2026-07-10T20:00:00.000Z",
      ledgerVersion: 5,
    };
    expect(() => parseReceiptEnvelope({
      ...envelope,
      receipt: {
        ...receipt,
        action: "unadmitted",
        result: "clean",
        evidenceUrlOrId: evidence.evidenceUrlOrId,
        payload: {
          kind: "terminal-evidence",
          terminalAt: null,
          evidenceRefs: [evidence.evidenceUrlOrId],
          findingIds: [],
        },
      },
    })).toThrow(/evidence/u);
    expect(() => parseReceiptEnvelope({ ...envelope, receipt: { ...receipt, evidence } })).toThrow(/evidence/u);
  });

  it.each([
    ["request identity", { ...evidence, requirementId: "other-requirement" }],
    ["result", { ...evidence, result: "failed" }],
    ["reference", { ...evidence, evidenceUrlOrId: "https://example.test/evidence/other" }],
  ])("rejects incongruent attestation %s", (_name, mismatchedEvidence) => {
    expect(() => parseReceiptEnvelope({
      schemaVersion: 1,
      durableRecordId: "record-10",
      recordedAt: "2026-07-10T20:00:00.000Z",
      lastModifiedAt: "2026-07-10T20:00:00.000Z",
      ledgerVersion: 5,
      receipt: {
        ...receipt,
        action: "unadmitted",
        result: "clean",
        evidenceUrlOrId: evidence.evidenceUrlOrId,
        payload: {
          kind: "terminal-evidence",
          terminalAt: null,
          evidenceRefs: [evidence.evidenceUrlOrId],
          findingIds: [],
        },
        evidence: mismatchedEvidence,
      },
    })).toThrow();
  });

  it("rejects incongruent attestation finding identity", () => {
    expect(() => parseReceiptEnvelope({
      schemaVersion: 1,
      durableRecordId: "record-10",
      recordedAt: "2026-07-10T20:00:00.000Z",
      lastModifiedAt: "2026-07-10T20:00:00.000Z",
      ledgerVersion: 5,
      receipt: {
        ...receipt,
        action: "unadmitted",
        result: "findings",
        evidenceUrlOrId: evidence.evidenceUrlOrId,
        findingIds: [],
        payload: {
          kind: "terminal-evidence",
          terminalAt: null,
          evidenceRefs: [evidence.evidenceUrlOrId],
          findingIds: [],
        },
        evidence: {
          ...evidence,
          result: "findings",
          findings: [{
            findingId: "finding-1",
            severity: "high",
            locus: "src/a.ts:1",
            evidenceUrlOrId: "https://example.test/evidence/finding-1",
          }],
        },
      },
    })).toThrow(/finding identity mismatch/u);
  });

  it("round-trips a neutral gate projection with blocker detail", () => {
    const projection = {
      schemaVersion: 1,
      conclusion: "pending",
      summary: "Independent analysis is not requested",
      blockers: [{ code: "review-not-requested", detail: "checkpoint admission is required" }],
      requirementExecutions: [{
        requirementId: "independent-analysis",
        state: "not-requested",
        sourceIdentity: null,
        detail: "awaiting checkpoint",
      }],
      receiptRefs: ["receipt:anchor-4"],
      policyDecision: {
        lane: "reviewed",
        reviewRisk: "sensitive",
        disposition: "required",
        reasons: ["code-surface"],
        policyVersion: "b".repeat(64),
      },
      ciState: "success",
      ledgerVersion: null,
      evidence: [],
    };
    expect(parseGateProjection(projection)).toEqual(projection);
  });

  it.each([
    ["generation", { ...request, generation: -1 }],
    ["coverage", { ...request, coverage: "partial" }],
    ["obsolete shape", {
      schemaVersion: 1,
      repositoryId: request.repositoryId,
      changeRequestId: request.changeRequestId,
      changeSetId: request.changeSetId,
      policyVersion: request.policyVersion,
      rubricVersion: request.rubricVersion,
      requirementId: request.requirementId,
      sourceIdentity: request.sourceIdentity,
      coverage: request.coverage,
      coverageFromSha: request.coverageFromSha,
      coverageThroughSha: request.coverageThroughSha,
      generation: request.generation,
      actorIdentity: request.actorIdentity,
    }],
    ["unknown causal field", { ...request, triggerIdentity: "trigger-1" }],
    ["automatic command", { ...request, requestCommand: "@codex review" }],
    ["trigger without command", { ...request, requestMechanism: "user-trigger" }],
  ])("rejects malformed request %s", (_name, input) => {
    expect(() => parseReviewRequest(input)).toThrow();
  });

  it.each([
    ["missing payload", { ...receipt, payload: undefined }],
    ["unknown payload field", {
      ...receipt,
      payload: { ...receipt.payload, migratedFrom: 1 },
    }],
    ["trigger mechanism", {
      ...receipt,
      action: "acknowledged",
      evidenceUrlOrId: "provider-run:77",
      payload: {
        kind: "acknowledgement",
        acknowledgedAt: null,
        acknowledgementRef: "provider-run:77",
        trigger: {
          mechanism: "user-trigger",
          eventId: "trigger-1",
          actorIdentity: request.requiredActorIdentity,
          occurredAt: null,
          headSha: request.coverageThroughSha,
        },
      },
    }],
    ["trigger actor", {
      ...receipt,
      action: "acknowledged",
      evidenceUrlOrId: "provider-run:77",
      payload: {
        kind: "acknowledgement",
        acknowledgedAt: null,
        acknowledgementRef: "provider-run:77",
        trigger: {
          mechanism: request.requestMechanism,
          eventId: "trigger-1",
          actorIdentity: "other-actor",
          occurredAt: null,
          headSha: request.coverageThroughSha,
        },
      },
    }],
    ["finding source", {
      ...receipt,
      action: "finding-opened",
      findingIds: ["finding-1"],
      payload: {
        kind: "finding-lifecycle",
        findingId: "finding-1",
        origin: {
          sourceIdentity: "other-source",
          evidenceRef: "provider-run:77#finding-1",
          headSha: request.coverageThroughSha,
        },
        carriedThroughHeadSha: request.coverageThroughSha,
        settlement: { state: "open", settledAt: null, evidenceRef: null },
      },
    }],
    ["open settlement evidence", {
      ...receipt,
      action: "finding-opened",
      findingIds: ["finding-1"],
      payload: {
        kind: "finding-lifecycle",
        findingId: "finding-1",
        origin: {
          sourceIdentity: request.sourceIdentity,
          evidenceRef: "provider-run:77#finding-1",
          headSha: request.coverageThroughSha,
        },
        carriedThroughHeadSha: request.coverageThroughSha,
        settlement: {
          state: "open",
          settledAt: "2026-07-10T20:05:00.000Z",
          evidenceRef: "fix:commit-1",
        },
      },
    }],
  ])("rejects incongruent receipt %s", (_name, malformedReceipt) => {
    expect(() => parseReceiptEnvelope({ ...envelope, receipt: malformedReceipt })).toThrow();
  });

  it("rejects malformed receipt actions and identities", () => {
    expect(() => parseReceiptEnvelope({
      schemaVersion: 1,
      durableRecordId: "record-9",
      recordedAt: "2026-07-10T20:00:00.000Z",
      lastModifiedAt: "2026-07-10T20:00:00.000Z",
      ledgerVersion: 4,
      receipt: { ...receipt, action: "retried", receiptHash: "short" },
    })).toThrow();
  });
});
