import { describe, expect, it, vi } from "vitest";

import type { ReceiptEnvelope, ReviewRequest } from "../../../../../src/scripts/review-gate/core/execution.js";
import {
  evaluateRequestTiming,
  executeConfirmedRequest,
  reserveRequest,
} from "../../../../../src/scripts/review-gate/core/request-execution.js";
import { createReceipt } from "../../../../../src/scripts/review-gate/core/request-key.js";

function request(): ReviewRequest {
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
  };
}

function reservation(): ReceiptEnvelope {
  return {
    schemaVersion: 1,
    durableRecordId: "record-1",
    recordedAt: "2026-07-10T20:00:00.000Z",
    lastModifiedAt: "2026-07-10T20:00:00.000Z",
    ledgerVersion: 1,
    receipt: createReceipt({
      request: request(), previousLedgerVersion: 0, action: "reserved", eventId: "event-1",
      result: null, evidenceUrlOrId: null, findingIds: [],
      payload: { kind: "reservation", reservedAt: null, pendingProjectionRef: null },
    }),
  };
}

describe("reserved request execution", () => {
  it("appends and confirms a reservation without performing the provider effect", async () => {
    const order: string[] = [];
    const result = await reserveRequest({
      request: request(),
      expectedLedgerVersion: 0,
      appendReservation: async () => {
        order.push("reserve");
        return { envelope: reservation(), created: true };
      },
      confirmReservation: async () => { order.push("confirm"); return { canonical: true, envelope: reservation() }; },
    });

    expect(result).toMatchObject({ created: true, envelope: { ledgerVersion: 1 } });
    expect(order).toEqual(["reserve", "confirm"]);
  });

  it("returns no executable reservation for stale, forked, or unconfirmed state", async () => {
    const result = await reserveRequest({
      request: request(), expectedLedgerVersion: 0,
      appendReservation: async () => ({ envelope: reservation(), created: true }),
      confirmReservation: async () => ({ canonical: false, envelope: null }),
    });
    expect(result).toBeNull();
  });

  it("invokes and acknowledges only an already confirmed reservation", async () => {
    const order: string[] = [];
    const result = await executeConfirmedRequest({
      request: request(),
      reservation: reservation(),
      invoke: async () => {
        order.push("invoke");
        return {
          requestIdentity: "request-1",
          acknowledgedAt: "2026-07-10T20:01:00.000Z",
          trigger: {
            eventKind: "label",
            eventId: "trigger-1",
            actorIdentity: "actor-1",
            contentDigest: "a".repeat(64),
            occurredAt: "2026-07-10T20:01:00.000Z",
            headSha: "d".repeat(40),
          },
        };
      },
      appendAcknowledgement: async () => { order.push("ack"); },
      appendTerminalFailure: async () => { order.push("failure"); },
    });
    expect(result).toEqual({ status: "acknowledged", invoked: true });
    expect(order).toEqual(["invoke", "ack"]);
  });

  it("records an ambiguous terminal failure without replaying a rejected invocation", async () => {
    const appendTerminalFailure = vi.fn(async () => undefined);
    const invoke = vi.fn(async () => { throw new Error("response lost"); });
    const result = await executeConfirmedRequest({
      request: request(),
      reservation: reservation(),
      invoke,
      appendAcknowledgement: async () => undefined,
      appendTerminalFailure,
    });
    expect(result).toEqual({ status: "invocation-ambiguous", invoked: true });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(appendTerminalFailure).toHaveBeenCalledTimes(1);
  });

  it("derives reservation and acknowledgement timeouts from authenticated record time", () => {
    expect(evaluateRequestTiming({
      reservation: reservation(), acknowledgement: null, terminalEvidence: false,
      now: new Date("2026-07-10T20:10:00.000Z"),
    })).toBe("ambiguous-reservation");
    expect(evaluateRequestTiming({
      reservation: reservation(), acknowledgement: {
        ...reservation(), ledgerVersion: 2, recordedAt: "2026-07-10T20:01:00.000Z",
        receipt: createReceipt({
          request: request(), previousLedgerVersion: 1, action: "acknowledged", eventId: "event-2",
          result: null, evidenceUrlOrId: null, findingIds: [],
          payload: {
            kind: "acknowledgement",
            acknowledgedAt: null,
            acknowledgementRef: "event-2",
            trigger: {
              mechanism: "automatic",
              eventKind: "label",
              eventId: "event-2",
              actorIdentity: "actor-1",
              occurredAt: null,
              headSha: "d".repeat(40),
              contentDigest: "f".repeat(64),
            },
          },
        }),
      }, terminalEvidence: false, now: new Date("2026-07-10T21:01:00.000Z"),
    })).toBe("acknowledged-timeout");
  });
});
