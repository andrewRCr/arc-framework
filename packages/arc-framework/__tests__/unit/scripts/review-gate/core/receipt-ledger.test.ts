import { describe, expect, it } from "vitest";

import type { ReviewRequest } from "../../../../../src/scripts/review-gate/core/execution.js";
import {
  computeRequestKey,
  createReceipt,
} from "../../../../../src/scripts/review-gate/core/request-key.js";
import { validateReceiptLedger } from "../../../../../src/scripts/review-gate/core/receipt-ledger.js";

function request(overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    schemaVersion: 1,
    repositoryId: "repo-1",
    changeRequestId: "change-7",
    changeSetId: "a".repeat(64),
    policyVersion: "b".repeat(64),
    rubricVersion: "independent-analysis/v1",
    requirementId: "analysis",
    sourceIdentity: "agent-1",
    coverage: "full",
    coverageFromSha: "c".repeat(40),
    coverageThroughSha: "d".repeat(40),
    generation: 0,
    actorIdentity: "actor-1",
    ...overrides,
  };
}

function envelope(ledgerVersion: number, receipt = createReceipt({
  request: request({ generation: ledgerVersion - 1 }),
  previousLedgerVersion: ledgerVersion - 1,
  action: "reserved",
  eventId: `event-${ledgerVersion}`,
  result: null,
  evidenceUrlOrId: null,
  findingIds: [],
})) {
  return {
    schemaVersion: 1 as const,
    durableRecordId: `record-${ledgerVersion}`,
    recordedAt: `2026-07-10T20:0${ledgerVersion}:00.000Z`,
    lastModifiedAt: `2026-07-10T20:0${ledgerVersion}:00.000Z`,
    ledgerVersion,
    receipt,
  };
}

describe("canonical request keys and receipt ledger", () => {
  it("changes request identity for source, coverage, or generation", () => {
    const baseline = computeRequestKey(request());
    expect(computeRequestKey(request({ sourceIdentity: "agent-2" }))).not.toBe(baseline);
    expect(computeRequestKey(request({ coverageFromSha: "e".repeat(40) }))).not.toBe(baseline);
    expect(computeRequestKey(request({ generation: 1 }))).not.toBe(baseline);
  });

  it("accepts a contiguous, hash-valid ledger", () => {
    expect(validateReceiptLedger({
      envelopes: [envelope(1), envelope(2)],
      anchorVersion: 2,
      anchorCount: 2,
    })).toMatchObject({ valid: true, ledgerVersion: 2 });
  });

  it("collapses byte-equivalent duplicate records", () => {
    const first = envelope(1);
    expect(validateReceiptLedger({
      envelopes: [first, { ...first, durableRecordId: "record-duplicate" }],
      anchorVersion: 1,
      anchorCount: 1,
    })).toMatchObject({ valid: true, receipts: [first.receipt] });
  });

  it("rejects exact request replay across event retries", () => {
    const first = envelope(1);
    const replay = envelope(2, createReceipt({
      request: request(), previousLedgerVersion: 1, action: "reserved", eventId: "event-retry",
      result: null, evidenceUrlOrId: null, findingIds: [],
    }));
    expect(validateReceiptLedger({
      envelopes: [first, replay], anchorVersion: 2, anchorCount: 2,
    }).valid).toBe(false);
  });

  it.each([
    ["divergent duplicate", () => {
      const first = envelope(1);
      return [first, { ...first, receipt: createReceipt({
        request: request(), previousLedgerVersion: 0, action: "waived", eventId: "event-other",
        result: null, evidenceUrlOrId: null, findingIds: [],
      }) }];
    }],
    ["fork", () => [envelope(1), envelope(2, createReceipt({
      request: request({ generation: 1 }), previousLedgerVersion: 0, action: "reserved", eventId: "event-2",
      result: null, evidenceUrlOrId: null, findingIds: [],
    }))]],
    ["edited envelope", () => [{ ...envelope(1), lastModifiedAt: "2026-07-10T21:00:00.000Z" }]],
    ["truncated history", () => [envelope(2)]],
  ])("fails closed for %s", (_name, build) => {
    expect(validateReceiptLedger({ envelopes: build(), anchorVersion: 2, anchorCount: 2 }).valid).toBe(false);
  });
});
