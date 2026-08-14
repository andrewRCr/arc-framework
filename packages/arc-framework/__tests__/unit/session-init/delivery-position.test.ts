import { describe, expect, it, vi } from "vitest";

import { readDeliveryPositionView } from "../../../src/lib/session-init/delivery-position.js";
import { deliveryStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

describe("session-init delivery position", () => {
  it("is silent for authoritative absence and refuses ambiguous plans", async () => {
    const observe = vi.fn();
    await expect(readDeliveryPositionView("delivery-plan-record", {
      plans: { enumerateCurrentReadOnly: vi.fn().mockResolvedValue({ status: "ok", value: [] }) },
      states: { read: vi.fn() },
      observe,
    })).resolves.toEqual({ status: "ok", value: null });
    expect(observe).not.toHaveBeenCalled();

    const plan = deliveryStackPlanFixture();
    await expect(readDeliveryPositionView(plan.workUnitId, {
      plans: {
        enumerateCurrentReadOnly: vi.fn().mockResolvedValue({ status: "ok", value: [plan, plan] }),
      },
      states: { read: vi.fn() },
      observe,
    })).resolves.toEqual({ status: "refused", reason: "plan-ambiguous" });
  });

  it("precomposes a clean bound position without writing state", async () => {
    const plan = deliveryStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const facts = {
      target: state.target,
      members: state.members,
      landedDeliverableIds: [plan.members[0]?.deliverableId],
    };
    const result = await readDeliveryPositionView(plan.workUnitId, {
      plans: { enumerateCurrentReadOnly: vi.fn().mockResolvedValue({ status: "ok", value: [plan] }) },
      states: { read: vi.fn().mockResolvedValue({ status: "ok", value: { revision: 3, value: state } }) },
      observe: vi.fn().mockResolvedValue({ status: "observed", facts, operationObservation: null }),
    });
    expect(result).toEqual({
      status: "ok",
      value: {
        planId: plan.planId,
        workUnitId: plan.workUnitId,
        landedCount: 1,
        totalCount: 2,
        activeOperation: null,
        line: "Delivery position: 1/2 landed; active operation: none.",
      },
    });
  });

  it("projects an exact retryable active operation while strict readiness stays unchanged", async () => {
    const plan = deliveryStackPlanFixture();
    const clean = deliveryStateFixture(plan);
    const member = clean.members[0];
    if (member === undefined) throw new Error("fixture member missing");
    const operation = {
      operationId: "op-1",
      kind: "rewrite" as const,
      affectedDeliverableIds: [member.deliverableId],
      stateRevision: 3,
      boundPlanDigest: plan.planDigest,
      before: { target: clean.target, members: [member] },
      requested: { target: clean.target, members: [member] },
    };
    const active = { ...clean, activeOperation: operation };
    const facts = { target: clean.target, members: clean.members, landedDeliverableIds: [] };
    const result = await readDeliveryPositionView(plan.workUnitId, {
      plans: { enumerateCurrentReadOnly: vi.fn().mockResolvedValue({ status: "ok", value: [plan] }) },
      states: { read: vi.fn().mockResolvedValue({ status: "ok", value: { revision: 4, value: active } }) },
      observe: vi.fn().mockResolvedValue({
        status: "observed", facts, operationObservation: operation.before,
      }),
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok" || result.value === null) throw new Error("expected position");
    expect(result.value.activeOperation).toEqual({ kind: "rewrite", operationId: "op-1" });
    expect(result.value.line).toBe("Delivery position: 0/2 landed; active operation: rewrite op-1.");
  });
});
