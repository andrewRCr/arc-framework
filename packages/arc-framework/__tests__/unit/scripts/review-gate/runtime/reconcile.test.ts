import { describe, expect, it, vi } from "vitest";

import type { GateProjection, ReviewRequest } from "../../../../../src/scripts/review-gate/core/execution.js";
import type { CanonicalReconcileState, ReconcileDecision } from "../../../../../src/scripts/review-gate/runtime/reconcile.js";
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

describe("review-gate reconciliation", () => {
  it("publishes an unchanged state without duplicating spend", async () => {
    const publish = vi.fn(async () => undefined);
    const execute = vi.fn();
    const result = await reconcile({
      read: async () => state(), reduce: async (): Promise<ReconcileDecision> => ({ request: null, projection: projection() }),
      execute, publish,
    }, new Date("2026-07-11T12:00:00.000Z"));
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

    const result = await reconcile({
      read: async () => reads.shift()!,
      reduce: async (): Promise<ReconcileDecision> => ({ request, projection: degradedProjection }),
      execute,
      publish,
    }, new Date("2026-07-11T12:00:00.000Z"));

    expect(result).toEqual({ status: "published", effect: null });
    expect(execute).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledWith(degradedProjection);
  });

  it("does not mask a check publication outage while the ledger is degraded", async () => {
    const reads = [state(undefined, null), state(undefined, null)];
    const checkOutage = new Error("check write outage");

    await expect(reconcile({
      read: async () => reads.shift()!,
      reduce: async (): Promise<ReconcileDecision> => ({
        request: null,
        projection: { ...projection(null), conclusion: "failure" },
      }),
      execute: async () => ({ status: "acknowledged", invoked: true }),
      publish: async () => { throw checkOutage; },
    }, new Date("2026-07-11T12:00:00.000Z"))).rejects.toThrow("check write outage");
  });

  it("aborts before an effect when canonical state changes", async () => {
    const reads = [state(), state("c".repeat(40))];
    const execute = vi.fn();
    const result = await reconcile({
      read: async () => reads.shift()!, reduce: async () => ({ request, projection: projection() }), execute,
      publish: async () => undefined,
    }, new Date("2026-07-11T12:00:00.000Z"));
    expect(result.status).toBe("stale-before-effect");
    expect(execute).not.toHaveBeenCalled();
  });

  it("allows an effect but blocks an older worker's projection after a head race", async () => {
    const reads = [state(), state(), state("d".repeat(40), 1)];
    const publish = vi.fn();
    const result = await reconcile({
      read: async () => reads.shift()!, reduce: async () => ({ request, projection: projection() }),
      execute: async () => ({ status: "acknowledged", invoked: true }), publish,
    }, new Date("2026-07-11T12:00:00.000Z"));
    expect(result.status).toBe("stale-after-effect");
    expect(publish).not.toHaveBeenCalled();
  });

  it("re-reduces the authenticated final ledger before publishing", async () => {
    const reads = [state(), state(), state(undefined, 1)];
    const publish = vi.fn(async () => undefined);
    await reconcile({
      read: async () => reads.shift()!, reduce: async (current) => ({ request: current.ledgerVersion === 0 ? request : null, projection: projection(current.ledgerVersion) }),
      execute: async () => ({ status: "acknowledged", invoked: true }), publish,
    }, new Date("2026-07-11T12:00:00.000Z"));
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ ledgerVersion: 1 }));
  });
});
