import { describe, expect, it } from "vitest";

import {
  acceptDeliveryOperationResult,
  checkDeliveryOperationPrecondition,
  reconcileDeliveryOperation,
  reserveDeliveryOperation,
  type DeliveryOperationReservationRequestV1,
} from "../../../src/lib/delivery/operation.js";
import {
  DeliveryStateV1Schema,
  type DeliveryOperationSnapshotV1,
  type DeliveryPlanV1,
  type DeliveryStateV1,
} from "../../../src/lib/delivery/schema.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import { deliveryPlanFixture } from "../../fixtures/delivery-plan.js";

const STATE_REVISION = 7;

function currentState(plan: DeliveryPlanV1 = deliveryPlanFixture()): DeliveryStateV1 {
  return DeliveryStateV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-state/v1",
    planId: plan.planId,
    workUnitId: plan.workUnitId,
    boundPlan: {
      planRevision: plan.planRevision,
      planDigest: plan.planDigest,
    },
    target: {
      ref: "refs/heads/delivery-target",
      coordinates: { head: "1".repeat(40), tree: "2".repeat(40) },
    },
    members: plan.members.map((member, index) => ({
      deliverableId: member.deliverableId,
      ref: `refs/heads/member-${index + 1}`,
      changeRequest: null,
      coordinates: {
        base: "3".repeat(40),
        head: String(index + 4).repeat(40),
        tree: String(index + 6).repeat(40),
      },
    })),
    activeOperation: null,
  });
}

function stateSnapshot(
  state: DeliveryStateV1,
  deliverableIds: readonly string[],
): DeliveryOperationSnapshotV1 {
  return {
    target: state.target,
    members: deliverableIds.map((deliverableId) => {
      const member = state.members.find((candidate) => candidate.deliverableId === deliverableId);
      return {
        deliverableId: deliverableId as DeliveryStateV1["members"][number]["deliverableId"],
        ref: member?.ref ?? null,
        coordinates: member?.coordinates ?? null,
      };
    }),
  };
}

function operationRequest(
  state: DeliveryStateV1,
  overrides: Partial<DeliveryOperationReservationRequestV1> = {},
): DeliveryOperationReservationRequestV1 {
  const affectedDeliverableIds = [state.members[0]!.deliverableId];
  const before = stateSnapshot(state, affectedDeliverableIds);
  return {
    operationId: "opaque-operation",
    kind: "rewrite",
    affectedDeliverableIds,
    expectedStateRevision: STATE_REVISION,
    before,
    requested: {
      target: {
        ref: "refs/heads/delivery-target",
        coordinates: { head: "8".repeat(40), tree: "9".repeat(40) },
      },
      members: before.members.map((member) => ({
        ...member,
        coordinates: { base: "3".repeat(40), head: "a".repeat(40), tree: "b".repeat(40) },
      })),
    },
    ...overrides,
  };
}

function reservedRecord() {
  const plan = deliveryPlanFixture();
  const state = currentState(plan);
  const request = operationRequest(state);
  const reserved = reserveDeliveryOperation(
    { revision: STATE_REVISION, value: state },
    plan,
    request,
  );
  if (reserved.status !== "reserved") throw new Error("fixture operation must reserve");
  return {
    plan,
    request,
    current: { revision: STATE_REVISION + 1, value: reserved.state },
  };
}

function reservedAllMembersRecord() {
  const plan = deliveryPlanFixture();
  const state = currentState(plan);
  const affectedDeliverableIds = state.members.map((member) => member.deliverableId);
  const before = stateSnapshot(state, affectedDeliverableIds);
  const request = operationRequest(state, {
    affectedDeliverableIds,
    before,
    requested: {
      target: before.target,
      members: before.members.map((member) => ({
        ...member,
        coordinates: { base: "3".repeat(40), head: "c".repeat(40), tree: "d".repeat(40) },
      })),
    },
  });
  const reserved = reserveDeliveryOperation(
    { revision: STATE_REVISION, value: state },
    plan,
    request,
  );
  if (reserved.status !== "reserved") throw new Error("fixture operation must reserve");
  return {
    request,
    current: { revision: STATE_REVISION + 1, value: reserved.state },
  };
}

describe("reserveDeliveryOperation", () => {
  it("records exact snapshots for every supported operation kind", () => {
    const plan = deliveryPlanFixture();
    const state = currentState(plan);

    for (const kind of ["materialize", "publish", "rewrite", "land", "teardown"] as const) {
      const request = operationRequest(state, { kind });
      expect(reserveDeliveryOperation({ revision: STATE_REVISION, value: state }, plan, request)).toEqual({
        status: "reserved",
        state: {
          ...state,
          activeOperation: {
            operationId: request.operationId,
            kind,
            affectedDeliverableIds: request.affectedDeliverableIds,
            stateRevision: STATE_REVISION,
            boundPlanDigest: plan.planDigest,
            before: request.before,
            requested: request.requested,
          },
        },
      });
    }
  });

  it("refuses a stale state revision or stale plan binding", () => {
    const plan = deliveryPlanFixture();
    const state = currentState(plan);
    expect(reserveDeliveryOperation(
      { revision: STATE_REVISION, value: state },
      plan,
      operationRequest(state, { expectedStateRevision: STATE_REVISION - 1 }),
    )).toEqual({ status: "refused", reason: "stale-state" });

    const staleState = {
      ...state,
      boundPlan: { ...state.boundPlan, planDigest: canonicalDigest({ plan: "old" }) },
    };
    expect(reserveDeliveryOperation(
      { revision: STATE_REVISION, value: staleState },
      plan,
      operationRequest(staleState),
    )).toEqual({ status: "refused", reason: "stale-plan-binding" });
  });

  it("refuses a second active operation", () => {
    const plan = deliveryPlanFixture();
    const state = currentState(plan);
    const first = reserveDeliveryOperation(
      { revision: STATE_REVISION, value: state },
      plan,
      operationRequest(state),
    );
    expect(first.status).toBe("reserved");
    if (first.status !== "reserved") return;

    expect(reserveDeliveryOperation(
      { revision: STATE_REVISION + 1, value: first.state },
      plan,
      operationRequest(first.state, { expectedStateRevision: STATE_REVISION + 1 }),
    )).toEqual({ status: "refused", reason: "operation-active" });
  });

  it("refuses unknown, duplicate, or non-plan-ordered affected members", () => {
    const plan = deliveryPlanFixture();
    const state = currentState(plan);
    const unknown = canonicalDigest({ member: "unknown" });
    expect(reserveDeliveryOperation(
      { revision: STATE_REVISION, value: state },
      plan,
      operationRequest(state, {
        affectedDeliverableIds: [unknown],
        before: stateSnapshot(state, [unknown]),
        requested: stateSnapshot(state, [unknown]),
      }),
    )).toEqual({ status: "refused", reason: "unknown-deliverable" });

    const firstId = state.members[0]!.deliverableId;
    expect(reserveDeliveryOperation(
      { revision: STATE_REVISION, value: state },
      plan,
      operationRequest(state, { affectedDeliverableIds: [firstId, firstId] }),
    )).toEqual({ status: "refused", reason: "operation-invalid" });

    const reversed = state.members.map((member) => member.deliverableId).reverse();
    expect(reserveDeliveryOperation(
      { revision: STATE_REVISION, value: state },
      plan,
      operationRequest(state, {
        affectedDeliverableIds: reversed,
        before: stateSnapshot(state, reversed),
        requested: stateSnapshot(state, reversed),
      }),
    )).toEqual({ status: "refused", reason: "member-sequence-invalid" });
  });

  it("refuses snapshots that omit affected members or disagree with stored source coordinates", () => {
    const plan = deliveryPlanFixture();
    const state = currentState(plan);
    const request = operationRequest(state);
    expect(reserveDeliveryOperation(
      { revision: STATE_REVISION, value: state },
      plan,
      { ...request, before: { ...request.before, members: [] } },
    )).toEqual({ status: "refused", reason: "member-sequence-invalid" });

    const mismatchedBefore = {
      ...request.before,
      members: request.before.members.map((member) => ({
        ...member,
        coordinates: { base: "3".repeat(40), head: "f".repeat(40), tree: "7".repeat(40) },
      })),
    };
    expect(reserveDeliveryOperation(
      { revision: STATE_REVISION, value: state },
      plan,
      { ...request, before: mismatchedBefore },
    )).toEqual({ status: "refused", reason: "before-state-mismatch" });
  });
});

describe("delivery operation pre- and post-mutation comparison", () => {
  it("is ready only when fresh pre-mutation facts equal the exact source snapshot", () => {
    const { current, request } = reservedRecord();
    expect(checkDeliveryOperationPrecondition(current, request.before)).toEqual({
      status: "ready",
      operationId: request.operationId,
    });
    expect(checkDeliveryOperationPrecondition(current, {
      ...request.before,
      target: {
        ...request.before.target,
        coordinates: { head: "c".repeat(40), tree: "2".repeat(40) },
      },
    })).toEqual({ status: "blocked", reason: "before-mismatch" });
    expect(checkDeliveryOperationPrecondition(current, {
      ...request.before,
      members: [],
    })).toEqual({ status: "blocked", reason: "before-mismatch" });
    expect(checkDeliveryOperationPrecondition(current, null)).toEqual({
      status: "blocked",
      reason: "observed-facts-invalid",
    });
  });

  it("accepts only the exact requested result and clears the reservation", () => {
    const { current, request } = reservedRecord();
    const applied = acceptDeliveryOperationResult(current, request.requested);
    expect(applied.status).toBe("applied");
    if (applied.status !== "applied") return;
    expect(applied.state.target).toEqual(request.requested.target);
    expect(applied.state.activeOperation).toBeNull();
    expect(applied.state.members[0]).toMatchObject({
      deliverableId: request.affectedDeliverableIds[0],
      ref: request.requested.members[0]!.ref,
      coordinates: request.requested.members[0]!.coordinates,
    });
    expect(applied.state.members[0]!.changeRequest).toBe(current.value.members[0]!.changeRequest);
    expect(applied.state.members[1]).toEqual(current.value.members[1]);

    expect(acceptDeliveryOperationResult(current, {
      ...request.requested,
      members: [],
    })).toEqual({ status: "blocked", reason: "requested-mismatch" });
    expect(acceptDeliveryOperationResult(current, {
      ...request.requested,
      members: [
        ...request.requested.members,
        stateSnapshot(current.value, [current.value.members[1]!.deliverableId]).members[0]!,
      ],
    })).toEqual({ status: "blocked", reason: "requested-mismatch" });
  });

  it("blocks a missing or stale reservation before comparing observations", () => {
    const { current, request } = reservedRecord();
    expect(checkDeliveryOperationPrecondition(
      { ...current, revision: current.revision + 1 },
      request.before,
    )).toEqual({ status: "blocked", reason: "operation-stale" });
    expect(checkDeliveryOperationPrecondition({
      revision: current.revision,
      value: { ...current.value, activeOperation: null },
    }, request.before)).toEqual({ status: "blocked", reason: "no-active-operation" });

    const activeOperation = current.value.activeOperation;
    if (activeOperation === null) throw new Error("fixture operation must remain active");
    expect(acceptDeliveryOperationResult({
      revision: current.revision,
      value: {
        ...current.value,
        activeOperation: {
          ...activeOperation,
          boundPlanDigest: canonicalDigest({ plan: "stale" }),
        },
      },
    }, request.requested)).toEqual({ status: "blocked", reason: "operation-stale" });
  });
});

describe("reconcileDeliveryOperation", () => {
  it("adopts an exact requested result and permits retry after exact non-application", () => {
    const { current, request } = reservedRecord();
    const adopted = reconcileDeliveryOperation(current, request.requested);
    expect(adopted.status).toBe("adopt");
    if (adopted.status === "adopt") {
      expect(adopted.state.activeOperation).toBeNull();
      expect(adopted.state.target).toEqual(request.requested.target);
      expect(adopted.state.members[0]).toMatchObject(request.requested.members[0]!);
    }
    expect(reconcileDeliveryOperation(current, request.before)).toEqual({
      status: "retry",
      operationId: request.operationId,
    });
  });

  it("blocks partial, extra, reordered, or otherwise changed observations", () => {
    const { current, request } = reservedAllMembersRecord();
    const unknown = canonicalDigest({ member: "extra" });
    const partial = { ...request.requested, members: request.requested.members.slice(0, 1) };
    const extra = {
      ...request.requested,
      members: [
        ...request.requested.members,
        { deliverableId: unknown, ref: null, coordinates: null },
      ],
    };
    const reordered = { ...request.requested, members: [...request.requested.members].reverse() };
    const changed = {
      ...request.requested,
      target: {
        ref: "refs/heads/delivery-target",
        coordinates: { head: "e".repeat(40), tree: "2".repeat(40) },
      },
    };

    for (const observed of [partial, extra, reordered, changed]) {
      expect(reconcileDeliveryOperation(current, observed)).toEqual({
        status: "blocked",
        reason: "ambiguous-result",
      });
    }
  });
});
