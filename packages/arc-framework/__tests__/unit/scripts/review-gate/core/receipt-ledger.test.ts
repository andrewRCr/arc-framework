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

  it("accepts a reserved request followed by its acknowledgement", () => {
    const admitted = request();
    const reserved = envelope(1, createReceipt({
      request: admitted, previousLedgerVersion: 0, action: "reserved", eventId: "reserve",
      result: null, evidenceUrlOrId: null, findingIds: [],
    }));
    const acknowledged = envelope(2, createReceipt({
      request: admitted, previousLedgerVersion: 1, action: "acknowledged", eventId: "ack",
      result: null, evidenceUrlOrId: "comment-1", findingIds: [],
    }));
    expect(validateReceiptLedger({
      envelopes: [acknowledged, reserved], anchorVersion: 2, anchorCount: 2,
    })).toMatchObject({ valid: true });
  });

  it("accepts distinct authorized command versions without collapsing their event identities", () => {
    const first = createReceipt({
      request: request({ sourceIdentity: "review-gate-command" }),
      previousLedgerVersion: 0,
      action: "required",
      eventId: "command:IC_1:version-1",
      result: null,
      reason: "request review",
      evidenceUrlOrId: "https://github.test/pull/7#issuecomment-1",
      findingIds: [],
    });
    const edited = createReceipt({
      request: request({ sourceIdentity: "review-gate-command" }),
      previousLedgerVersion: 1,
      action: "required",
      eventId: "command:IC_1:version-2",
      result: null,
      reason: "request amended review",
      evidenceUrlOrId: "https://github.test/pull/7#issuecomment-1",
      findingIds: [],
    });

    expect(first.idempotencyKey).not.toBe(edited.idempotencyKey);
    expect(validateReceiptLedger({
      envelopes: [envelope(1, first), envelope(2, edited)],
      anchorVersion: 2,
      anchorCount: 2,
    })).toMatchObject({ valid: true });
  });

  it("validates dismissals against the exact source-scoped finding history", () => {
    const finding = createReceipt({
      request: request({ sourceIdentity: "agent-1" }),
      previousLedgerVersion: 0,
      action: "attested",
      eventId: "evidence:agent-1",
      result: "findings",
      evidenceUrlOrId: "evidence:agent-1",
      findingIds: ["finding-1"],
    });
    const dismissal = (sourceIdentity: string) => createReceipt({
      request: request({ sourceIdentity }),
      previousLedgerVersion: 1,
      action: "dismissed",
      eventId: `command:${sourceIdentity}:dismiss`,
      result: null,
      reason: "not applicable",
      evidenceUrlOrId: "https://github.test/pull/7#issuecomment-3",
      findingIds: ["finding-1"],
    });

    expect(validateReceiptLedger({
      envelopes: [envelope(1, finding), envelope(2, dismissal("agent-1"))],
      anchorVersion: 2,
      anchorCount: 2,
    })).toMatchObject({ valid: true });
    expect(validateReceiptLedger({
      envelopes: [envelope(1, finding), envelope(2, dismissal("agent-2"))],
      anchorVersion: 2,
      anchorCount: 2,
    }).valid).toBe(false);
  });

  it.each([
    ["acknowledgement without reservation", "acknowledgement-without-reservation:1", () => [envelope(1, createReceipt({
      request: request(), previousLedgerVersion: 0, action: "acknowledged", eventId: "ack",
      result: null, evidenceUrlOrId: "comment-1", findingIds: [],
    }))]],
    ["clean result carrying findings", "non-findings-result-with-findings:1", () => [envelope(1, createReceipt({
      request: request(), previousLedgerVersion: 0, action: "attested", eventId: "result",
      result: "clean", evidenceUrlOrId: "evidence-1", findingIds: ["finding-1"],
    }))]],
    ["findings result without findings", "findings-result-without-findings:1", () => [envelope(1, createReceipt({
      request: request(), previousLedgerVersion: 0, action: "attested", eventId: "result",
      result: "findings", evidenceUrlOrId: "evidence-1", findingIds: [],
    }))]],
    ["dismissal of an unknown finding", "contradictory-dismissal:1", () => [envelope(1, createReceipt({
      request: request(), previousLedgerVersion: 0, action: "dismissed", eventId: "dismiss",
      result: null, evidenceUrlOrId: "reason", findingIds: ["unknown"],
    }))]],
  ])("rejects semantic contradiction: %s", (_name, expectedError, build) => {
    const result = validateReceiptLedger({ envelopes: build(), anchorVersion: 1, anchorCount: 1 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(expectedError);
  });
});
