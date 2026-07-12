import { describe, expect, it, vi } from "vitest";

import type {
  GateProjection,
  ReceiptEnvelope,
  ReviewRequest,
} from "../../../../../src/scripts/review-gate/core/execution.js";
import type {
  CanonicalReconcileState,
  ReconcileDecision,
  ReconcileRuntime,
} from "../../../../../src/scripts/review-gate/runtime/reconcile.js";
import { reconcile } from "../../../../../src/scripts/review-gate/runtime/reconcile.js";

const state = (headSha = "a".repeat(40), ledgerVersion: number | null = 0): CanonicalReconcileState => ({
  repositoryId: 42, pullRequestNumber: 7, headSha, policyVersion: "p1", permissionVersion: "m1", ledgerVersion,
});
const projection = (ledgerVersion: number | null = 0): GateProjection => ({
  schemaVersion: 1, conclusion: "pending", summary: "pending", blockers: [], requirementExecutions: [],
  receiptRefs: [], policyDecision: { lane: "reviewed", reviewRisk: "routine", disposition: "required", reasons: [], policyVersion: "b".repeat(64) },
  ciState: "pending", ledgerVersion, evidence: [],
});
const request = { changeRequestId: "change-7" } as ReviewRequest;
const reservation = { ledgerVersion: 1, receipt: { action: "reserved" } } as ReceiptEnvelope;

function runtime(overrides: Partial<ReconcileRuntime>): ReconcileRuntime {
  return {
    read: async () => state(),
    reduce: async () => ({ request: null, projection: projection() }),
    reserve: async () => null,
    confirmPending: async () => false,
    execute: async () => ({ status: "acknowledged", invoked: true }),
    publish: async () => undefined,
    ...overrides,
  };
}

describe("review-gate reconciliation", () => {
  it("publishes an unchanged state without duplicating spend", async () => {
    const publish = vi.fn(async () => undefined);
    const execute = vi.fn();
    const result = await reconcile(runtime({
      read: async () => state(), reduce: async (): Promise<ReconcileDecision> => ({ request: null, projection: projection() }),
      execute, publish,
    }), new Date("2026-07-11T12:00:00.000Z"));
    expect(result).toEqual({ status: "published", effect: null });
    expect(execute).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("publishes a degraded-ledger failure without attempting a receipt-writing effect", async () => {
    const publish = vi.fn(async () => undefined);
    const execute = vi.fn();
    const degradedProjection: GateProjection = {
      ...projection(null),
      conclusion: "failure",
      blockers: [{ code: "ledger-unavailable", detail: "receipt state could not be read" }],
    };
    const reads = [state(undefined, null), state(undefined, null)];

    const result = await reconcile(runtime({
      read: async () => reads.shift()!,
      reduce: async (): Promise<ReconcileDecision> => ({ request, projection: degradedProjection }),
      execute,
      publish,
    }), new Date("2026-07-11T12:00:00.000Z"));

    expect(result).toEqual({ status: "published", effect: null });
    expect(execute).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledWith(degradedProjection);
  });

  it("does not mask a check publication outage while the ledger is degraded", async () => {
    const reads = [state(undefined, null), state(undefined, null)];
    const checkOutage = new Error("check write outage");

    await expect(reconcile(runtime({
      read: async () => reads.shift()!,
      reduce: async (): Promise<ReconcileDecision> => ({
        request: null,
        projection: { ...projection(null), conclusion: "failure" },
      }),
      execute: async () => ({ status: "acknowledged", invoked: true }),
      publish: async () => { throw checkOutage; },
    }), new Date("2026-07-11T12:00:00.000Z"))).rejects.toThrow("check write outage");
  });

  it("aborts before an effect when canonical state changes", async () => {
    const reads = [state(), state("c".repeat(40))];
    const execute = vi.fn();
    const result = await reconcile(runtime({
      read: async () => reads.shift()!, reduce: async () => ({ request, projection: projection() }), execute,
      publish: async () => undefined,
    }), new Date("2026-07-11T12:00:00.000Z"));
    expect(result.status).toBe("stale-before-effect");
    expect(execute).not.toHaveBeenCalled();
  });

  it("allows an effect but blocks an older worker's projection after a head race", async () => {
    const reads = [state(), state(), state(undefined, 1), state(undefined, 1), state("d".repeat(40), 2)];
    const publish = vi.fn();
    const result = await reconcile(runtime({
      read: async () => reads.shift()!,
      reduce: async (current) => ({
        request: current.ledgerVersion === 0 ? request : null,
        projection: projection(current.ledgerVersion),
      }),
      reserve: async () => ({ envelope: reservation, created: true }),
      confirmPending: async () => true,
      execute: async () => ({ status: "acknowledged", invoked: true }),
      publish,
    }), new Date("2026-07-11T12:00:00.000Z"));
    expect(result.status).toBe("stale-after-effect");
    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ ledgerVersion: 1 }));
  });

  it("re-reduces the authenticated final ledger before publishing", async () => {
    const reads = [state(), state(), state(undefined, 1), state(undefined, 1), state(undefined, 2)];
    const publish = vi.fn(async () => undefined);
    await reconcile(runtime({
      read: async () => reads.shift()!, reduce: async (current) => ({ request: current.ledgerVersion === 0 ? request : null, projection: projection(current.ledgerVersion) }),
      reserve: async () => ({ envelope: reservation, created: true }),
      confirmPending: async () => true,
      execute: async () => ({ status: "acknowledged", invoked: true }), publish,
    }), new Date("2026-07-11T12:00:00.000Z"));
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ ledgerVersion: 2 }));
  });

  it("publishes and confirms reserved pending state before the provider effect", async () => {
    const reads = [state(), state(), state(undefined, 1), state(undefined, 1), state(undefined, 2)];
    const order: string[] = [];
    const result = await reconcile(runtime({
      read: async () => reads.shift()!,
      reduce: async (current) => ({
        request: current.ledgerVersion === 0 ? request : null,
        projection: projection(current.ledgerVersion),
      }),
      reserve: async () => { order.push("reserve"); return { envelope: reservation, created: true }; },
      publish: async (value) => { order.push(value.ledgerVersion === 1 ? "publish-pending" : "publish-final"); },
      confirmPending: async () => { order.push("confirm-pending"); return true; },
      execute: async () => { order.push("execute"); return { status: "acknowledged", invoked: true }; },
    }), new Date("2026-07-11T12:00:00.000Z"));

    expect(result.status).toBe("published");
    expect(order).toEqual(["reserve", "publish-pending", "confirm-pending", "execute", "publish-final"]);
  });

  it("performs no effect when pending confirmation is missing or ambiguous", async () => {
    const reads = [state(), state(), state(undefined, 1)];
    const execute = vi.fn();
    const result = await reconcile(runtime({
      read: async () => reads.shift()!,
      reduce: async (current) => ({ request, projection: projection(current.ledgerVersion) }),
      reserve: async () => ({ envelope: reservation, created: true }),
      confirmPending: async () => false,
      execute,
    }), new Date("2026-07-11T12:00:00.000Z"));

    expect(result).toEqual({ status: "pending-unconfirmed", effect: null });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(["publish", "confirm"] as const)(
    "performs no effect when pending %s fails",
    async (failurePoint) => {
      const reads = [state(), state(), state(undefined, 1)];
      const execute = vi.fn();
      const checkOutage = new Error("pending check outage");
      await expect(reconcile(runtime({
        read: async () => reads.shift()!,
        reduce: async (current) => ({ request, projection: projection(current.ledgerVersion) }),
        reserve: async () => ({ envelope: reservation, created: true }),
        publish: async () => { if (failurePoint === "publish") throw checkOutage; },
        confirmPending: async () => {
          if (failurePoint === "confirm") throw checkOutage;
          return true;
        },
        execute,
      }), new Date("2026-07-11T12:00:00.000Z"))).rejects.toThrow("pending check outage");
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it("adopts an existing reservation and pending projection without replaying the effect", async () => {
    const reads = [state(undefined, 1), state(undefined, 1), state(undefined, 1)];
    const execute = vi.fn();
    const result = await reconcile(runtime({
      read: async () => reads.shift()!,
      reduce: async (current) => ({ request, projection: projection(current.ledgerVersion) }),
      reserve: async () => ({ envelope: reservation, created: false }),
      confirmPending: async () => true,
      execute,
    }), new Date("2026-07-11T12:00:00.000Z"));

    expect(result).toEqual({ status: "reservation-adopted", effect: null });
    expect(execute).not.toHaveBeenCalled();
  });
});
