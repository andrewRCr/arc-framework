import { describe, expect, it } from "vitest";

import type {
  ReviewReceipt,
  ReviewReceiptPayload,
  ReviewRequest,
} from "../../../../../src/scripts/review-gate/core/execution.js";
import {
  computeRequestKey,
  createReceipt as createReceiptCore,
  type ReceiptCreationInput,
} from "../../../../../src/scripts/review-gate/core/request-key.js";
import { canonicalizePlainJson } from "../../../../../src/scripts/review-gate/core/identity.js";
import { validateReceiptLedger } from "../../../../../src/scripts/review-gate/core/receipt-ledger.js";

function request(overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    schemaVersion: 1,
    repositoryId: "repo-1",
    changeRequestId: "change-7",
    changeSetId: "a".repeat(64),
    policyVersion: "b".repeat(64),
    semanticsVersion: "review-gate/v1",
    rubricVersion: "independent-analysis/v1",
    requirementId: "analysis",
    sourceIdentity: "agent-1",
    coverage: "full",
    coverageFromSha: "c".repeat(40),
    coverageThroughSha: "d".repeat(40),
    generation: 0,
    actorIdentity: "actor-1",
    requestMechanism: "automatic",
    requiredActorIdentity: "actor-1",
    requestCommand: null,
    ...overrides,
  };
}

type TestReceiptInput = Omit<ReceiptCreationInput, "payload"> & { payload?: ReviewReceiptPayload };

function createReceipt(input: TestReceiptInput): ReviewReceipt {
  let payload = input.payload;
  if (payload === undefined && input.action === "reserved") {
    payload = { kind: "reservation", reservedAt: null, pendingProjectionRef: input.evidenceUrlOrId };
  } else if (payload === undefined && input.action === "acknowledged") {
    const acknowledgementRef = input.evidenceUrlOrId ?? input.eventId;
    payload = {
      kind: "acknowledgement",
      acknowledgedAt: null,
      acknowledgementRef,
      trigger: {
        mechanism: input.request.requestMechanism,
        eventId: input.eventId,
        actorIdentity: input.request.requiredActorIdentity,
        occurredAt: null,
        headSha: input.request.coverageThroughSha,
        contentDigest: "f".repeat(64),
      },
    };
  } else if (payload === undefined && ["attested", "unadmitted", "terminal-failure"].includes(input.action)) {
    payload = {
      kind: "terminal-evidence",
      terminalAt: null,
      evidenceRefs: input.evidenceUrlOrId === null ? [] : [input.evidenceUrlOrId],
      findingIds: input.findingIds,
    };
  } else if (payload === undefined) {
    payload = { kind: "decision", decidedAt: null };
  }
  return createReceiptCore({ ...input, payload });
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
  it("matches the definitive literal identity and serialization fixtures", () => {
    const created = createReceiptCore({
      request: request(),
      previousLedgerVersion: 0,
      action: "reserved",
      eventId: "event-1",
      result: null,
      evidenceUrlOrId: null,
      findingIds: [],
      payload: { kind: "reservation", reservedAt: null, pendingProjectionRef: null },
    });
    const { receiptHash, ...withoutHash } = created;

    expect(computeRequestKey(request())).toBe(
      "f4a456df216594dcba2267fc2c05f18966b3d9b3c8d38a3f8e06f6a088006fcc",
    );
    expect(created.idempotencyKey).toBe(
      "7f3be3f4cdbe0ce8ce039bb4487ae099ff35e0fb447c1d4b8a33d2b8999ffc77",
    );
    expect(receiptHash).toBe("1b54d946d91b1329b9e3108b0114518ff5a5d5374c08ac764b0ba2af77a0bff0");
    expect(canonicalizePlainJson(withoutHash)).toBe(
      '{"action":"reserved","eventId":"event-1","evidenceUrlOrId":null,"findingIds":[],'
      + '"idempotencyKey":"7f3be3f4cdbe0ce8ce039bb4487ae099ff35e0fb447c1d4b8a33d2b8999ffc77",'
      + '"payload":{"kind":"reservation","pendingProjectionRef":null,"reservedAt":null},'
      + '"previousLedgerVersion":0,"reason":null,"request":{"actorIdentity":"actor-1",'
      + '"changeRequestId":"change-7","changeSetId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",'
      + '"coverage":"full","coverageFromSha":"cccccccccccccccccccccccccccccccccccccccc",'
      + '"coverageThroughSha":"dddddddddddddddddddddddddddddddddddddddd","generation":0,'
      + '"policyVersion":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",'
      + '"repositoryId":"repo-1","requestCommand":null,"requestMechanism":"automatic",'
      + '"requiredActorIdentity":"actor-1",'
      + '"requirementId":"analysis","rubricVersion":"independent-analysis/v1","schemaVersion":1,'
      + '"semanticsVersion":"review-gate/v1","sourceIdentity":"agent-1"},"result":null,"schemaVersion":1}',
    );
  });

  it("changes request identity for source, coverage, or generation", () => {
    const baseline = computeRequestKey(request());
    expect(computeRequestKey(request({ sourceIdentity: "agent-2" }))).not.toBe(baseline);
    expect(computeRequestKey(request({ coverageFromSha: "e".repeat(40) }))).not.toBe(baseline);
    expect(computeRequestKey(request({ generation: 1 }))).not.toBe(baseline);
    expect(computeRequestKey(request({ semanticsVersion: "review-gate/v2" }))).not.toBe(baseline);
    expect(computeRequestKey(request({ requestMechanism: "user-trigger" }))).not.toBe(baseline);
    expect(computeRequestKey(request({ requiredActorIdentity: "actor-2" }))).not.toBe(baseline);
    expect(computeRequestKey(request({
      requestMechanism: "user-trigger",
      requestCommand: "@codex review the exact head",
    }))).not.toBe(baseline);
  });

  it("binds lifecycle payload and predecessor version into receipt identity", () => {
    const input = {
      request: request(),
      action: "reserved" as const,
      eventId: "event-1",
      result: null,
      evidenceUrlOrId: null,
      findingIds: [],
      payload: { kind: "reservation" as const, reservedAt: null, pendingProjectionRef: null },
    };
    const baseline = createReceiptCore({ ...input, previousLedgerVersion: 0 });
    const changedPayload = createReceiptCore({
      ...input,
      previousLedgerVersion: 0,
      payload: { ...input.payload, pendingProjectionRef: "check-run:41" },
    });
    const changedPredecessor = createReceiptCore({ ...input, previousLedgerVersion: 1 });

    expect(changedPayload.idempotencyKey).not.toBe(baseline.idempotencyKey);
    expect(changedPayload.receiptHash).not.toBe(baseline.receiptHash);
    expect(changedPredecessor.receiptHash).not.toBe(baseline.receiptHash);
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

  it("rejects whitespace-only command provenance", () => {
    const command = createReceipt({
      request: request({ sourceIdentity: "review-gate-command" }),
      previousLedgerVersion: 0,
      action: "required",
      eventId: "command:IC_1:version-1",
      result: null,
      reason: "   ",
      evidenceUrlOrId: "https://github.test/pull/7#issuecomment-1",
      findingIds: [],
    });
    expect(validateReceiptLedger({
      envelopes: [envelope(1, command)], anchorVersion: 1, anchorCount: 1,
    })).toMatchObject({ valid: false, errors: ["contradictory-required:1"] });
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
