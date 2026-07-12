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
    rubricVersion: "independent-analysis/v1",
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
            eventId: "trigger-1",
            actorIdentity: admitted.requiredActorIdentity,
            occurredAt: null,
            headSha: admitted.coverageThroughSha,
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
        "4a1233fecadaf9c3fb669e6088db9e965138b7ad41f995a961020390eafd5645",
        "e2d6962d2291e03afd5dd39725bd16d74d52464d7f81fafd73daa5f27bff61ff",
      ],
      [
        "e29880de30b30b65cff8958a287553cc549e938c2e6e4b46ec475b7442e715fc",
        "ee814aac512dea09e5c3532a2b238d71fed69bfa744f9f66e1feb980d52f1e1c",
      ],
      [
        "0dc1828e4be80424490b0ca4f843c57e720bcc7553715c63939f492e1935ba67",
        "8baac677c5a4ac001f74737a65b8ba3845a8757be35a16adc485e96b13e9cde4",
      ],
      [
        "4a401d409dbc34bfec3fd0c2dbfab3acd60285d02200de6f1cb3fbc81615585c",
        "72cd0d51dbfe6f8272097ffb8f7d72407804cf931ef182c3b0cc69adb3f3a877",
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
