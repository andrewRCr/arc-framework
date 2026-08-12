import { describe, expect, it } from "vitest";

import {
  acceptDeliveryOperationResult,
  checkDeliveryOperationPrecondition,
  reconcileDeliveryOperation,
  reserveDeliveryOperation,
  type DeliveryOperationReservationRequestV1,
} from "../../../src/lib/delivery/operation.js";
import {
  type DeliveryOperationSnapshotV1,
  type DeliveryStateV1,
} from "../../../src/lib/delivery/schema.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import { deliveryPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

const STATE_REVISION = 7;

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
        changeRequest: member?.changeRequest ?? null,
        coordinates: member?.coordinates ?? null,
      };
    }),
  };
}

function operationRequest(
  state: DeliveryStateV1,
  overrides: Partial<Omit<Extract<DeliveryOperationReservationRequestV1, {
    kind: "materialize" | "rewrite" | "teardown";
  }>, "kind">> & { kind?: "materialize" | "rewrite" | "teardown" } = {},
): Extract<DeliveryOperationReservationRequestV1, {
  kind: "materialize" | "rewrite" | "teardown";
}> {
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

function publishEffect() {
  return {
    providerId: "github",
    repository: "andrewRCr/arc-framework",
    headRef: "delivery/delivery-plan-record/first",
    headSha: "4".repeat(40),
    baseRef: "main",
    draft: true,
  } as const;
}

function landEffect() {
  return {
    providerId: "github",
    repository: "andrewRCr/arc-framework",
    changeRequestId: "pull/401",
    headSha: "4".repeat(40),
    baseRef: "main",
    targetRef: "refs/heads/main",
    strategy: "merge",
  } as const;
}

function reservedRecord() {
  const plan = deliveryPlanFixture();
  const state = deliveryStateFixture(plan);
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
  const state = deliveryStateFixture(plan);
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
    const state = deliveryStateFixture(plan);

    for (const kind of ["materialize", "rewrite", "teardown"] as const) {
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

    for (const request of [
      { ...operationRequest(state), kind: "publish" as const, effect: publishEffect() },
      { ...operationRequest(state), kind: "land" as const, effect: landEffect() },
    ]) {
      const result = reserveDeliveryOperation({ revision: STATE_REVISION, value: state }, plan, request);
      expect(result.status).toBe("reserved");
      if (result.status === "reserved") {
        expect(result.state.activeOperation).toMatchObject({
          kind: request.kind,
          effect: request.effect,
          stateRevision: STATE_REVISION,
          boundPlanDigest: plan.planDigest,
        });
      }
    }
  });

  it("refuses a stale state revision or stale plan binding", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
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
    const state = deliveryStateFixture(plan);
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
    const state = deliveryStateFixture(plan);
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
    const state = deliveryStateFixture(plan);
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

  it("records one uniquely observed publish handle without relaxing exact coordinates", () => {
    const { plan, current, request } = reservedRecord();
    const publishRequest = {
      ...request,
      kind: "publish" as const,
      effect: publishEffect(),
      requested: {
        ...request.requested,
        members: request.requested.members.map((member) => ({ ...member, changeRequest: null })),
      },
    };
    const reserved = reserveDeliveryOperation(
      { revision: STATE_REVISION, value: deliveryStateFixture(plan) },
      plan,
      publishRequest,
    );
    expect(reserved.status).toBe("reserved");
    if (reserved.status !== "reserved") return;
    const published = { revision: STATE_REVISION + 1, value: reserved.state };
    const observed = {
      ...publishRequest.requested,
      members: publishRequest.requested.members.map((member) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: "pull/401" },
      })),
    };

    const applied = acceptDeliveryOperationResult(published, {
      kind: "publish",
      effect: publishRequest.effect,
      outcome: "applied",
      snapshot: observed,
    });
    expect(applied.status).toBe("applied");
    if (applied.status === "applied") {
      expect(applied.state.members[0]!.changeRequest).toEqual(observed.members[0]!.changeRequest);
    }
    expect(acceptDeliveryOperationResult(published, {
      kind: "publish",
      effect: publishRequest.effect,
      outcome: "applied",
      snapshot: {
        ...observed,
        members: observed.members.map((member) => ({
          ...member,
          coordinates: { ...member.coordinates!, head: "f".repeat(40) },
        })),
      },
    })).toEqual({ status: "blocked", reason: "requested-mismatch" });
    expect(current.value.activeOperation).not.toBeNull();
  });

  it("records host-assigned landed coordinates and teardown clears every member binding", () => {
    const { plan, request } = reservedRecord();
    const state = deliveryStateFixture(plan);
    const landRequest = {
      ...operationRequest(state, {
      requested: stateSnapshot(state, request.affectedDeliverableIds),
      }),
      kind: "land" as const,
      effect: landEffect(),
    };
    const reservedLand = reserveDeliveryOperation(
      { revision: STATE_REVISION, value: state },
      plan,
      landRequest,
    );
    expect(reservedLand.status).toBe("reserved");
    if (reservedLand.status !== "reserved") return;
    const landedObservation = {
      target: {
        ref: state.target!.ref,
        coordinates: { head: "d".repeat(40), tree: "e".repeat(40) },
      },
      members: landRequest.requested.members.map((member) => ({
        ...member,
        coordinates: { base: "1".repeat(40), head: "d".repeat(40), tree: "e".repeat(40) },
      })),
    };
    const landed = acceptDeliveryOperationResult(
      { revision: STATE_REVISION + 1, value: reservedLand.state },
      { kind: "land", effect: landRequest.effect, outcome: "applied", snapshot: landedObservation },
    );
    expect(landed.status).toBe("applied");
    if (landed.status !== "applied") return;
    expect(landed.state.target).toEqual(landedObservation.target);
    expect(landed.state.members[0]!.coordinates).toEqual(landedObservation.members[0]!.coordinates);

    const teardownBefore = stateSnapshot(landed.state, request.affectedDeliverableIds);
    const teardownRequest = operationRequest(landed.state, {
      kind: "teardown",
      expectedStateRevision: STATE_REVISION + 2,
      before: teardownBefore,
      requested: {
        target: teardownBefore.target,
        members: teardownBefore.members.map((member) => ({
          ...member,
          ref: null,
          changeRequest: null,
          coordinates: null,
        })),
      },
    });
    const reservedTeardown = reserveDeliveryOperation(
      { revision: STATE_REVISION + 2, value: landed.state },
      plan,
      teardownRequest,
    );
    expect(reservedTeardown.status).toBe("reserved");
    if (reservedTeardown.status !== "reserved") return;
    const tornDown = acceptDeliveryOperationResult(
      { revision: STATE_REVISION + 3, value: reservedTeardown.state },
      teardownRequest.requested,
    );
    expect(tornDown.status).toBe("applied");
    if (tornDown.status === "applied") {
      expect(tornDown.state.members[0]).toMatchObject({ ref: null, changeRequest: null, coordinates: null });
      expect(tornDown.state.members[1]).toEqual(landed.state.members[1]);
    }
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
  it.each(["rewrite", "teardown"] as const)(
    "%s operations adopt exact application, retry exact non-application, and retain ambiguity",
    (kind) => {
      const plan = deliveryPlanFixture();
      const state = deliveryStateFixture(plan);
      const request = operationRequest(state, {
        kind,
        ...(kind === "teardown" ? {
          requested: {
            target: state.target,
            members: [{
              deliverableId: state.members[0]!.deliverableId,
              ref: null,
              changeRequest: null,
              coordinates: null,
            }],
          },
        } : {}),
      });
      const reserved = reserveDeliveryOperation({ revision: STATE_REVISION, value: state }, plan, request);
      expect(reserved.status).toBe("reserved");
      if (reserved.status !== "reserved") return;
      const current = { revision: STATE_REVISION + 1, value: reserved.state };
      expect(reconcileDeliveryOperation(current, request.requested).status).toBe("adopt");
      expect(reconcileDeliveryOperation(current, request.before)).toEqual({
        status: "retry", operationId: request.operationId,
      });
      expect(reconcileDeliveryOperation(current, {
        ...request.requested,
        target: { ...request.requested.target!, ref: "refs/heads/unrelated" },
      })).toEqual({ status: "blocked", reason: "ambiguous-result" });
      expect(current.value.activeOperation?.kind).toBe(kind);
    },
  );

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
        { deliverableId: unknown, ref: null, changeRequest: null, coordinates: null },
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

  it("adopts only a matching host-assigned result and retains ambiguous publish or land reservations", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    for (const request of [
      { ...operationRequest(state), kind: "publish" as const, effect: publishEffect() },
      { ...operationRequest(state), kind: "land" as const, effect: landEffect() },
    ]) {
      const reserved = reserveDeliveryOperation({ revision: STATE_REVISION, value: state }, plan, request);
      expect(reserved.status).toBe("reserved");
      if (reserved.status !== "reserved") continue;
      const current = { revision: STATE_REVISION + 1, value: reserved.state };
      expect(reconcileDeliveryOperation(current, { outcome: "not-applied" })).toEqual({
        status: "retry",
        operationId: request.operationId,
      });
      expect(reconcileDeliveryOperation(current, { outcome: "ambiguous" })).toEqual({
        status: "blocked",
        reason: "ambiguous-result",
      });
      expect(current.value.activeOperation).not.toBeNull();
    }
  });
});
