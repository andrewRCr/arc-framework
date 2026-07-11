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
  rubricVersion: "independent-analysis/v1",
  requirementId: "independent-analysis",
  sourceIdentity: "agent-9",
  coverage: "full",
  coverageFromSha: "c".repeat(40),
  coverageThroughSha: "d".repeat(40),
  generation: 0,
  actorIdentity: "controller-1",
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
  evidenceUrlOrId: null,
  findingIds: [],
};

describe("request and projection contracts", () => {
  it("round-trips request identity and generation", () => {
    expect(parseReviewRequest(request)).toEqual(request);
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
    const envelope = {
      schemaVersion: 1,
      durableRecordId: "record-9",
      recordedAt: "2026-07-10T20:00:00.000Z",
      lastModifiedAt: "2026-07-10T20:00:00.000Z",
      ledgerVersion: 4,
      receipt,
    };
    expect(parseReceiptEnvelope(envelope)).toEqual(envelope);
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
    };
    expect(parseGateProjection(projection)).toEqual(projection);
  });

  it.each([
    ["generation", { ...request, generation: -1 }],
    ["coverage", { ...request, coverage: "partial" }],
  ])("rejects malformed request %s", (_name, input) => {
    expect(() => parseReviewRequest(input)).toThrow();
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
