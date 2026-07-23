import { describe, expect, it } from "vitest";

import {
  parseReviewReceipt,
  type ReviewReceipt,
  type ReviewRequest,
} from "../../../../../src/scripts/review-gate/core/execution.js";
import {
  planBeginFix,
  planHeadUpdateConsumption,
  queryHeadMutability,
  reduceRequestFlights,
} from "../../../../../src/scripts/review-gate/core/head-mutability.js";
import { validateReceiptLedger } from "../../../../../src/scripts/review-gate/core/receipt-ledger.js";
import { computeRequestKey, createReceipt } from "../../../../../src/scripts/review-gate/core/request-key.js";

const OLD_HEAD = "a".repeat(40);
const NEW_HEAD = "b".repeat(40);

function request(overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    schemaVersion: 1,
    repositoryId: "repo-1",
    changeRequestId: "change-7",
    changeSetId: "c".repeat(64),
    policyVersion: "d".repeat(64),
    semanticsVersion: "review-gate/v1",
    rubricVersion: "standard-review/v1",
    requirementId: "analysis",
    sourceIdentity: "provider-1",
    coverage: "full",
    coverageFromSha: "e".repeat(40),
    coverageThroughSha: OLD_HEAD,
    generation: 0,
    actorIdentity: "actor-1",
    requestMechanism: "automatic",
    requiredActorIdentity: "actor-1",
    requestCommand: null,
    ...overrides,
  };
}

function receipt(input: {
  action: ReviewReceipt["action"];
  previousLedgerVersion: number;
  request?: ReviewRequest;
  result?: ReviewReceipt["result"];
  findingIds?: string[];
  payload?: ReviewReceipt["payload"];
}): ReviewReceipt {
  const admitted = input.request ?? request();
  const findingIds = input.findingIds ?? [];
  const payload = input.payload ?? (input.action === "reserved"
    ? { kind: "reservation" as const, reservedAt: null, pendingProjectionRef: null }
    : input.action === "acknowledged"
      ? {
          kind: "acknowledgement" as const,
          acknowledgedAt: null,
          acknowledgementRef: "comment-1",
          trigger: {
            mechanism: admitted.requestMechanism,
            eventKind: "label",
            eventId: "trigger-1",
            actorIdentity: admitted.requiredActorIdentity,
            occurredAt: null,
            headSha: admitted.coverageThroughSha,
            contentDigest: "f".repeat(64),
          },
        }
      : input.action === "running" || input.action === "abandoned"
        ? { kind: "flight-state" as const, state: input.action, observedAt: null, evidenceRef: `${input.action}-1` }
        : {
            kind: "terminal-evidence" as const,
            terminalAt: null,
            evidenceRefs: ["review-1"],
            findingIds,
          });
  return createReceipt({
    eventId: `${input.action}-${input.previousLedgerVersion + 1}`,
    previousLedgerVersion: input.previousLedgerVersion,
    action: input.action,
    request: admitted,
    result: input.result ?? null,
    evidenceUrlOrId: input.result === "findings"
      ? "review-1"
      : input.action === "running" || input.action === "abandoned" ? `${input.action}-1` : null,
    findingIds,
    payload,
  });
}

function terminalFindings(): ReviewReceipt[] {
  return [
    receipt({ action: "reserved", previousLedgerVersion: 0 }),
    receipt({ action: "acknowledged", previousLedgerVersion: 1 }),
    receipt({ action: "attested", previousLedgerVersion: 2, result: "findings", findingIds: ["finding-1"] }),
  ];
}

describe("request flights and exact-head mutability", () => {
  it("reduces pending trigger, queued, acknowledged, running, and terminal states", () => {
    const userRequest = request({
      requestMechanism: "user-trigger",
      requestCommand: "@provider review",
    });
    expect(reduceRequestFlights([receipt({ action: "reserved", previousLedgerVersion: 0, request: userRequest })]))
      .toMatchObject({ ambiguous: false, flights: [{ state: "pending-trigger" }] });
    expect(reduceRequestFlights([receipt({ action: "reserved", previousLedgerVersion: 0 })]))
      .toMatchObject({ flights: [{ state: "queued" }] });
    expect(reduceRequestFlights([
      receipt({ action: "reserved", previousLedgerVersion: 0 }),
      receipt({ action: "acknowledged", previousLedgerVersion: 1 }),
    ])).toMatchObject({ flights: [{ state: "acknowledged" }] });
    expect(reduceRequestFlights([
      receipt({ action: "reserved", previousLedgerVersion: 0 }),
      receipt({ action: "running", previousLedgerVersion: 1 }),
    ])).toMatchObject({ flights: [{ state: "running" }] });
    const queued = receipt({ action: "reserved", previousLedgerVersion: 0 });
    expect(reduceRequestFlights([queued], [{
      requestKey: computeRequestKey(queued.request), headSha: OLD_HEAD, state: "running",
    }])).toMatchObject({ ambiguous: false, flights: [{ state: "running" }] });
    expect(reduceRequestFlights([queued], [{
      requestKey: computeRequestKey(queued.request), headSha: NEW_HEAD, state: "running",
    }]).ambiguous).toBe(true);
    expect(reduceRequestFlights(terminalFindings())).toMatchObject({ flights: [{ state: "terminal" }] });
    expect(reduceRequestFlights([
      receipt({ action: "reserved", previousLedgerVersion: 0 }),
      receipt({ action: "abandoned", previousLedgerVersion: 1 }),
    ])).toMatchObject({ flights: [{ state: "abandoned" }] });
    expect(reduceRequestFlights([
      receipt({ action: "reserved", previousLedgerVersion: 0 }),
      receipt({
        action: "superseded",
        previousLedgerVersion: 1,
        payload: { kind: "supersession", supersededAt: null, successorRequestKey: null, reason: "retired" },
      }),
    ])).toMatchObject({ flights: [{ state: "superseded" }] });
    expect(reduceRequestFlights([
      receipt({ action: "reserved", previousLedgerVersion: 0 }),
      receipt({
        action: "contaminated",
        previousLedgerVersion: 1,
        payload: { kind: "contamination", detectedAt: null, eventRef: "event-2", reason: "unowned trigger" },
      }),
    ])).toMatchObject({ flights: [{ state: "contaminated" }] });
    expect(queryHeadMutability({
      receipts: terminalFindings(), currentHeadSha: OLD_HEAD, proposedHeadSha: OLD_HEAD,
    })).toEqual({ kind: "allow", reason: "unchanged-head" });
  });

  it("freezes an active flight and fails closed for simultaneous active generations", () => {
    const active = receipt({ action: "reserved", previousLedgerVersion: 0 });
    expect(queryHeadMutability({
      receipts: [active], currentHeadSha: OLD_HEAD, proposedHeadSha: NEW_HEAD,
    })).toEqual({ kind: "refuse", reason: "active-flight" });

    const second = receipt({
      action: "reserved",
      previousLedgerVersion: 1,
      request: request({ generation: 1 }),
    });
    expect(reduceRequestFlights([active, second]).ambiguous).toBe(true);
    expect(queryHeadMutability({
      receipts: [active, second], currentHeadSha: OLD_HEAD, proposedHeadSha: NEW_HEAD,
    })).toEqual({ kind: "refuse", reason: "ambiguous-flight" });
  });

  it("permits settled head updates while requiring authorization for terminal findings", () => {
    expect(queryHeadMutability({
      receipts: [], currentHeadSha: OLD_HEAD, proposedHeadSha: NEW_HEAD,
    })).toEqual({ kind: "allow", reason: "settled-head-update" });

    const clean = [
      receipt({ action: "reserved", previousLedgerVersion: 0 }),
      receipt({ action: "acknowledged", previousLedgerVersion: 1 }),
      receipt({ action: "attested", previousLedgerVersion: 2, result: "clean" }),
    ];
    expect(queryHeadMutability({
      receipts: clean, currentHeadSha: OLD_HEAD, proposedHeadSha: NEW_HEAD,
    })).toEqual({ kind: "allow", reason: "settled-head-update" });
    expect(queryHeadMutability({
      receipts: terminalFindings(), currentHeadSha: OLD_HEAD, proposedHeadSha: NEW_HEAD,
    })).toEqual({ kind: "refuse", reason: "missing-authorization" });
  });

  it("authorizes begin-fix only for exact terminal findings and an authorized actor", () => {
    const receipts = terminalFindings();
    const planned = planBeginFix({
      receipts,
      terminalRequestKey: computeRequestKey(receipts[2]!.request),
      actorIdentity: "actor-1",
      authorizedActorIdentities: ["actor-1"],
      targetHeadSha: NEW_HEAD,
      carriedFindingIds: ["finding-1"],
      expectedLedgerVersion: 3,
      authorizedAt: new Date("2026-07-12T20:00:00.000Z"),
    });
    expect(planned).toMatchObject({ ok: true, receipt: { action: "begin-fix", findingIds: ["finding-1"] } });
    expect(planBeginFix({
      receipts: receipts.slice(0, 2),
      terminalRequestKey: computeRequestKey(receipts[1]!.request),
      actorIdentity: "actor-1",
      authorizedActorIdentities: ["actor-1"],
      targetHeadSha: NEW_HEAD,
      carriedFindingIds: ["finding-1"],
      expectedLedgerVersion: 2,
      authorizedAt: new Date("2026-07-12T20:00:00.000Z"),
    })).toEqual({ ok: false, reason: "terminal-findings-required" });
    expect(planBeginFix({
      receipts,
      terminalRequestKey: computeRequestKey(receipts[2]!.request),
      actorIdentity: "actor-2",
      authorizedActorIdentities: ["actor-1"],
      targetHeadSha: NEW_HEAD,
      carriedFindingIds: ["finding-1"],
      expectedLedgerVersion: 3,
      authorizedAt: new Date("2026-07-12T20:00:00.000Z"),
    })).toEqual({ ok: false, reason: "actor-not-authorized" });
  });

  it("consumes one exact target authorization, supersedes the old generation, and carries its finding tail", () => {
    const receipts = terminalFindings();
    const begin = planBeginFix({
      receipts,
      terminalRequestKey: computeRequestKey(receipts[2]!.request),
      actorIdentity: "actor-1",
      authorizedActorIdentities: ["actor-1"],
      targetHeadSha: NEW_HEAD,
      carriedFindingIds: ["finding-1"],
      expectedLedgerVersion: 3,
      authorizedAt: new Date("2026-07-12T20:00:00.000Z"),
    });
    if (!begin.ok) throw new Error(begin.reason);
    const withAuthorization = [...receipts, begin.receipt];
    expect(queryHeadMutability({
      receipts: withAuthorization, currentHeadSha: OLD_HEAD, proposedHeadSha: NEW_HEAD,
    })).toMatchObject({ kind: "allow", reason: "authorized-head-update" });

    const consumption = planHeadUpdateConsumption({
      receipts: withAuthorization,
      currentHeadSha: NEW_HEAD,
      expectedLedgerVersion: 4,
      consumedAt: new Date("2026-07-12T20:05:00.000Z"),
    });
    expect(consumption).toMatchObject({
      kind: "consume",
      receipts: [
        { action: "head-update-consumed" },
        { action: "superseded" },
        { action: "finding-opened", findingIds: ["finding-1"] },
      ],
    });
    if (consumption.kind !== "consume") throw new Error(consumption.reason);
    expect(queryHeadMutability({
      receipts: [...withAuthorization, ...consumption.receipts],
      currentHeadSha: OLD_HEAD,
      proposedHeadSha: NEW_HEAD,
    })).toEqual({ kind: "refuse", reason: "reused-authorization" });

    const otherRequest = request({ generation: 1 });
    const secondAuthorization = createReceipt({
      eventId: "begin-fix:second", previousLedgerVersion: 4, action: "begin-fix", request: otherRequest,
      result: null, reason: "second authorization", evidenceUrlOrId: null, findingIds: ["finding-2"],
      payload: {
        kind: "head-update-authorization", authorizedAt: "2026-07-12T20:00:00.000Z",
        terminalRequestKey: computeRequestKey(otherRequest), oldHeadSha: OLD_HEAD, targetHeadSha: NEW_HEAD,
        actorIdentity: "actor-1", findingIds: ["finding-2"],
      },
    });
    expect(queryHeadMutability({
      receipts: [...withAuthorization, secondAuthorization], currentHeadSha: OLD_HEAD, proposedHeadSha: NEW_HEAD,
    })).toEqual({ kind: "refuse", reason: "ambiguous-authorization" });
  });

  it("refuses stale targets, unrelated findings, and replayed begin-fix transitions", () => {
    const receipts = terminalFindings();
    const begin = planBeginFix({
      receipts,
      terminalRequestKey: computeRequestKey(receipts[2]!.request),
      actorIdentity: "actor-1",
      authorizedActorIdentities: ["actor-1"],
      targetHeadSha: NEW_HEAD,
      carriedFindingIds: ["finding-1"],
      expectedLedgerVersion: 3,
      authorizedAt: new Date("2026-07-12T20:00:00.000Z"),
    });
    if (!begin.ok) throw new Error(begin.reason);
    expect(queryHeadMutability({
      receipts: [...receipts, begin.receipt], currentHeadSha: OLD_HEAD, proposedHeadSha: "f".repeat(40),
    })).toEqual({ kind: "refuse", reason: "unexpected-head" });
    expect(planBeginFix({
      receipts,
      terminalRequestKey: computeRequestKey(receipts[2]!.request),
      actorIdentity: "actor-1",
      authorizedActorIdentities: ["actor-1"],
      targetHeadSha: NEW_HEAD,
      carriedFindingIds: ["unrelated"],
      expectedLedgerVersion: 3,
      authorizedAt: new Date("2026-07-12T20:00:00.000Z"),
    })).toEqual({ ok: false, reason: "carried-findings-mismatch" });
    expect(planBeginFix({
      receipts: [...receipts, begin.receipt],
      terminalRequestKey: computeRequestKey(receipts[2]!.request),
      actorIdentity: "actor-1",
      authorizedActorIdentities: ["actor-1"],
      targetHeadSha: NEW_HEAD,
      carriedFindingIds: ["finding-1"],
      expectedLedgerVersion: 4,
      authorizedAt: new Date("2026-07-12T20:00:00.000Z"),
    })).toEqual({ ok: false, reason: "authorization-exists" });
  });

  it("keeps every new initial-schema receipt variant strict and identity-stable", () => {
    const terminal = terminalFindings();
    const begin = planBeginFix({
      receipts: terminal,
      terminalRequestKey: computeRequestKey(terminal[2]!.request),
      actorIdentity: "actor-1",
      authorizedActorIdentities: ["actor-1"],
      targetHeadSha: NEW_HEAD,
      carriedFindingIds: ["finding-1"],
      expectedLedgerVersion: 3,
      authorizedAt: new Date("2026-07-12T20:00:00.000Z"),
    });
    if (!begin.ok) throw new Error(begin.reason);
    const consumption = planHeadUpdateConsumption({
      receipts: [...terminal, begin.receipt],
      currentHeadSha: NEW_HEAD,
      expectedLedgerVersion: 4,
      consumedAt: new Date("2026-07-12T20:05:00.000Z"),
    });
    if (consumption.kind !== "consume") throw new Error(consumption.reason);
    const variants = [
      receipt({ action: "running", previousLedgerVersion: 1 }),
      receipt({ action: "abandoned", previousLedgerVersion: 1 }),
      begin.receipt,
      consumption.receipts[0]!,
    ];

    expect(variants.map((candidate) => parseReviewReceipt(candidate))).toEqual(variants);
    expect(variants.map(({ idempotencyKey, receiptHash }) => [idempotencyKey, receiptHash])).toEqual([
      [
        "23e69dfc33e1b151465cf0d7e0903616e50e3c3c2941d8a22bacc9e9c54fedcf",
        "d374cf5339247a49ee045abe0039cb0c7612813b46f64f39d1d3c0159e083ab0",
      ],
      [
        "73f74c0052bffa49a3f2fb830dc83e8688575d81dfc847023abb0bcc288298e6",
        "f8bf592a1bc22d05f8dee8297e112babece831512ce0161a89d792db459baf3a",
      ],
      [
        "1deb3e056065594becdc7081da49f68850984ccc9a26f8a01683dbdbd167a4aa",
        "cb293fecc382488a1b797795902a8c38626a90a4f879a5b4479284aa4d178098",
      ],
      [
        "6e27a71a899cbf6b2b9081f8883a21ea261941d860b63fb59fa72df8f830b5a0",
        "a82c51e1d5ee448239ae12b7545ecabf8c13f728cd8a6ae6bc76d5a7b5f665e0",
      ],
    ]);
    expect(() => parseReviewReceipt({
      ...begin.receipt,
      payload: { ...begin.receipt.payload, targetHeadSha: "c".repeat(39) },
    })).toThrow();
  });

  it("accepts one linear repair transition and rejects replayed consumption", () => {
    const terminal = terminalFindings();
    const begin = planBeginFix({
      receipts: terminal,
      terminalRequestKey: computeRequestKey(terminal[2]!.request),
      actorIdentity: "actor-1",
      authorizedActorIdentities: ["actor-1"],
      targetHeadSha: NEW_HEAD,
      carriedFindingIds: ["finding-1"],
      expectedLedgerVersion: 3,
      authorizedAt: new Date("2026-07-12T20:00:00.000Z"),
    });
    if (!begin.ok) throw new Error(begin.reason);
    const consumption = planHeadUpdateConsumption({
      receipts: [...terminal, begin.receipt],
      currentHeadSha: NEW_HEAD,
      expectedLedgerVersion: 4,
      consumedAt: new Date("2026-07-12T20:05:00.000Z"),
    });
    if (consumption.kind !== "consume") throw new Error(consumption.reason);
    const receipts = [...terminal, begin.receipt, ...consumption.receipts];
    const envelopes = receipts.map((item, index) => ({
      schemaVersion: 1 as const,
      durableRecordId: `record-${index + 1}`,
      recordedAt: "2026-07-12T20:00:00.000Z",
      lastModifiedAt: "2026-07-12T20:00:00.000Z",
      ledgerVersion: index + 1,
      receipt: item,
    }));
    expect(validateReceiptLedger({
      envelopes, anchorVersion: envelopes.length, anchorCount: envelopes.length,
    })).toMatchObject({ valid: true });

    const replay = createReceipt({
      ...consumption.receipts[0]!,
      previousLedgerVersion: receipts.length,
    });
    const replayEnvelope = {
      ...envelopes[0]!,
      durableRecordId: "record-replay",
      ledgerVersion: envelopes.length + 1,
      receipt: replay,
    };
    expect(validateReceiptLedger({
      envelopes: [...envelopes, replayEnvelope],
      anchorVersion: envelopes.length + 1,
      anchorCount: envelopes.length + 1,
    }).valid).toBe(false);
  });
});
