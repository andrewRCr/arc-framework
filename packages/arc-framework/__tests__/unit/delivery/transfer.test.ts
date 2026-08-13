import { describe, expect, it } from "vitest";

import { deliveryPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";
import {
  buildDeliveryTransferBundle,
  classifyDeliveryTransferImport,
} from "../../../src/lib/delivery/transfer.js";

describe("delivery state transfer", () => {
  it("builds a validated bundle that preserves the exact state revision", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);

    const result = buildDeliveryTransferBundle({ plan, state: { revision: 69, value: state } });

    expect(result).toEqual({
      status: "ready",
      bundle: {
        schemaVersion: 1,
        semanticsVersion: "delivery-transfer/v1",
        plan,
        state: { revision: 69, value: state },
      },
    });
  });

  it("refuses a state record that is not coherent with the transferred plan", () => {
    const plan = deliveryPlanFixture();
    const foreignPlan = deliveryPlanFixture("223e4567-e89b-42d3-a456-426614174000");

    const result = buildDeliveryTransferBundle({
      plan,
      state: { revision: 4, value: deliveryStateFixture(foreignPlan) },
    });

    expect(result).toEqual({ status: "refused", reason: "plan-identity-mismatch" });
  });

  it("accepts only a fresh or exact-current destination", () => {
    const plan = deliveryPlanFixture();
    const state = { revision: 7, value: deliveryStateFixture(plan) };
    const built = buildDeliveryTransferBundle({ plan, state });
    if (built.status !== "ready") throw new Error("fixture bundle must build");

    expect(classifyDeliveryTransferImport({
      bundle: built.bundle,
      currentWorkUnitId: plan.workUnitId,
      currentPlan: null,
      currentState: null,
    })).toEqual({ status: "ready", writePlan: true, writeState: true });

    expect(classifyDeliveryTransferImport({
      bundle: built.bundle,
      currentWorkUnitId: plan.workUnitId,
      currentPlan: plan,
      currentState: state,
    })).toEqual({ status: "already-current", writePlan: false, writeState: false });

    expect(classifyDeliveryTransferImport({
      bundle: built.bundle,
      currentWorkUnitId: plan.workUnitId,
      currentPlan: plan,
      currentState: { revision: 6, value: state.value },
    })).toEqual({ status: "refused", reason: "destination-conflict" });
  });

  it("refuses import outside the bundle's active work unit", () => {
    const plan = deliveryPlanFixture();
    const built = buildDeliveryTransferBundle({
      plan,
      state: { revision: 1, value: deliveryStateFixture(plan) },
    });
    if (built.status !== "ready") throw new Error("fixture bundle must build");

    expect(classifyDeliveryTransferImport({
      bundle: built.bundle,
      currentWorkUnitId: "another-work-unit",
      currentPlan: null,
      currentState: null,
    })).toEqual({ status: "refused", reason: "subject-mismatch" });
  });
});
