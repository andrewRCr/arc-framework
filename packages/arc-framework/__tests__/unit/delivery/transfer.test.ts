import { describe, expect, it } from "vitest";

import { deliveryPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";
import { reserveDeliveryOperation } from "../../../src/lib/delivery/operation.js";
import type { DeliveryOperationSnapshotV1 } from "../../../src/lib/delivery/schema.js";
import {
  buildDeliveryTransferBundle,
  classifyDeliveryTransferImport,
} from "../../../src/lib/delivery/transfer.js";

const OPERATION_BASE_REVISION = 7;

function activeOperationRecord() {
  const plan = deliveryPlanFixture();
  const state = deliveryStateFixture(plan);
  const affectedDeliverableIds = [state.members[0]!.deliverableId];
  const before: DeliveryOperationSnapshotV1 = {
    target: state.target,
    members: state.members.slice(0, 1).map((member) => ({
      deliverableId: member.deliverableId,
      ref: member.ref,
      changeRequest: member.changeRequest,
      coordinates: member.coordinates,
    })),
  };
  const reserved = reserveDeliveryOperation(
    { revision: OPERATION_BASE_REVISION, value: state },
    plan,
    {
      operationId: "transfer-active-operation",
      kind: "rewrite",
      affectedDeliverableIds,
      expectedStateRevision: OPERATION_BASE_REVISION,
      before,
      requested: before,
    },
  );
  if (reserved.status !== "reserved") throw new Error("fixture operation must reserve");
  return {
    plan,
    state: { revision: OPERATION_BASE_REVISION + 1, value: reserved.state },
  };
}

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

  it("preserves a semantically valid active operation", () => {
    const active = activeOperationRecord();

    expect(buildDeliveryTransferBundle(active)).toMatchObject({
      status: "ready",
      bundle: { state: active.state },
    });
  });

  it("refuses an active operation whose reservation revision does not bind the outer state", () => {
    const active = activeOperationRecord();
    const operation = active.state.value.activeOperation;
    if (operation === null) throw new Error("fixture must carry an active operation");

    expect(buildDeliveryTransferBundle({
      plan: active.plan,
      state: {
        ...active.state,
        value: {
          ...active.state.value,
          activeOperation: { ...operation, stateRevision: operation.stateRevision - 1 },
        },
      },
    })).toEqual({ status: "refused", reason: "active-operation-invalid" });
  });

  it("refuses an active operation bound to a different plan digest", () => {
    const active = activeOperationRecord();
    const operation = active.state.value.activeOperation;
    if (operation === null) throw new Error("fixture must carry an active operation");

    expect(buildDeliveryTransferBundle({
      plan: active.plan,
      state: {
        ...active.state,
        value: {
          ...active.state.value,
          activeOperation: { ...operation, boundPlanDigest: `sha256:${"0".repeat(64)}` },
        },
      },
    })).toEqual({ status: "refused", reason: "active-operation-invalid" });
  });

  it("refuses an active operation whose snapshots do not name the affected members", () => {
    const active = activeOperationRecord();
    const operation = active.state.value.activeOperation;
    if (operation === null) throw new Error("fixture must carry an active operation");

    expect(buildDeliveryTransferBundle({
      plan: active.plan,
      state: {
        ...active.state,
        value: {
          ...active.state.value,
          activeOperation: {
            ...operation,
            requested: { ...operation.requested, members: [] },
          },
        },
      },
    })).toEqual({ status: "refused", reason: "active-operation-invalid" });
  });

  it("refuses an active operation whose affected members do not follow plan order", () => {
    const active = activeOperationRecord();
    const operation = active.state.value.activeOperation;
    if (operation === null) throw new Error("fixture must carry an active operation");
    const reversedMembers = [...active.state.value.members].reverse().map((member) => ({
      deliverableId: member.deliverableId,
      ref: member.ref,
      changeRequest: member.changeRequest,
      coordinates: member.coordinates,
    }));

    expect(buildDeliveryTransferBundle({
      plan: active.plan,
      state: {
        ...active.state,
        value: {
          ...active.state.value,
          activeOperation: {
            ...operation,
            affectedDeliverableIds: reversedMembers.map((member) => member.deliverableId),
            before: { ...operation.before, members: reversedMembers },
            requested: { ...operation.requested, members: reversedMembers },
          },
        },
      },
    })).toEqual({ status: "refused", reason: "active-operation-invalid" });
  });

  it("refuses an active operation whose before snapshot differs from current state", () => {
    const active = activeOperationRecord();
    const operation = active.state.value.activeOperation;
    if (operation === null) throw new Error("fixture must carry an active operation");
    const beforeMember = operation.before.members[0];
    if (beforeMember?.coordinates === null || beforeMember === undefined) {
      throw new Error("fixture operation member must carry coordinates");
    }

    expect(buildDeliveryTransferBundle({
      plan: active.plan,
      state: {
        ...active.state,
        value: {
          ...active.state.value,
          activeOperation: {
            ...operation,
            before: {
              ...operation.before,
              members: [{
                ...beforeMember,
                coordinates: { ...beforeMember.coordinates, head: "8".repeat(40) },
              }],
            },
          },
        },
      },
    })).toEqual({ status: "refused", reason: "active-operation-invalid" });
  });

  it("accepts only a fresh or exact-current destination", () => {
    const plan = deliveryPlanFixture();
    const state = { revision: 7, value: deliveryStateFixture(plan) };
    const built = buildDeliveryTransferBundle({ plan, state });
    if (built.status !== "ready") throw new Error("fixture bundle must build");

    expect(classifyDeliveryTransferImport({
      bundle: built.bundle,
      subjectMatches: true,
      currentPlan: null,
      currentState: null,
    })).toEqual({ status: "ready", writePlan: true, writeState: true });

    expect(classifyDeliveryTransferImport({
      bundle: built.bundle,
      subjectMatches: true,
      currentPlan: plan,
      currentState: state,
    })).toEqual({ status: "already-current", writePlan: false, writeState: false });

    expect(classifyDeliveryTransferImport({
      bundle: built.bundle,
      subjectMatches: true,
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
      subjectMatches: false,
      currentPlan: null,
      currentState: null,
    })).toEqual({ status: "refused", reason: "subject-mismatch" });
  });
});
