import { describe, expect, it, vi } from "vitest";

import type { ReceiptEnvelope, ReviewRequest } from "../../../../../src/scripts/review-gate/core/execution.js";
import { executeReservedRequest, evaluateRequestTiming } from "../../../../../src/scripts/review-gate/core/request-execution.js";
import { createReceipt } from "../../../../../src/scripts/review-gate/core/request-key.js";

function request(): ReviewRequest {
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
    }),
  };
}

describe("reserved request execution", () => {
  it("appends and confirms reservation before one provider invocation", async () => {
    const order: string[] = [];
    const invoke = vi.fn(async () => {
      order.push("invoke");
      return { requestIdentity: "request-1", acknowledgedAt: "2026-07-10T20:01:00.000Z" };
    });
    const result = await executeReservedRequest({
      request: request(),
      expectedLedgerVersion: 0,
      appendReservation: async () => { order.push("reserve"); return reservation(); },
      confirmReservation: async () => { order.push("confirm"); return { canonical: true, envelope: reservation() }; },
      invoke,
      appendAcknowledgement: async () => { order.push("ack"); },
      appendTerminalFailure: async () => { order.push("failure"); },
    });

    expect(result).toMatchObject({ status: "acknowledged", invoked: true });
    expect(order).toEqual(["reserve", "confirm", "invoke", "ack"]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("permits no invocation for stale, forked, or unconfirmed reservation", async () => {
    const invoke = vi.fn();
    const result = await executeReservedRequest({
      request: request(), expectedLedgerVersion: 0,
      appendReservation: async () => reservation(),
      confirmReservation: async () => ({ canonical: false, envelope: null }),
      invoke,
      appendAcknowledgement: async () => undefined,
      appendTerminalFailure: async () => undefined,
    });
    expect(result).toMatchObject({ status: "reservation-unconfirmed", invoked: false });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("records an ambiguous terminal failure without replaying a rejected invocation", async () => {
    const appendTerminalFailure = vi.fn(async () => undefined);
    const invoke = vi.fn(async () => { throw new Error("response lost"); });
    const result = await executeReservedRequest({
      request: request(), expectedLedgerVersion: 0,
      appendReservation: async () => reservation(),
      confirmReservation: async () => ({ canonical: true, envelope: reservation() }),
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
        }),
      }, terminalEvidence: false, now: new Date("2026-07-10T21:01:00.000Z"),
    })).toBe("acknowledged-timeout");
  });
});
