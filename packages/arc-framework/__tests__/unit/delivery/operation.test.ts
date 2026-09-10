import { describe, expect, it } from "vitest";

import {
  acceptDeliveryOperationResult,
  attachDeliveryOperationEffectIdentity,
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
import {
  deliveryPlanFixture,
  deliveryThreeMemberStackPlanFixture,
} from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

const STATE_REVISION = 7;

type SnapshotOperationRequest = Extract<DeliveryOperationReservationRequestV1, {
  kind: "materialize" | "rewrite" | "teardown";
}>;
type SnapshotOperationOverrides = {
  readonly operationId?: string;
  readonly kind?: SnapshotOperationRequest["kind"];
  readonly mode?: "review-fix" | "selected-change" | "provider-adoption" | "provider-refresh" | "member" | "closeout-residue";
  readonly affectedDeliverableIds?: string[];
  readonly expectedStateRevision?: number;
  readonly before?: DeliveryOperationSnapshotV1;
  readonly requested?: DeliveryOperationSnapshotV1;
  readonly reviewFixSelectedDeliverableId?: string;
  readonly reviewFixVerificationDeliverableIds?: string[];
};

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
  overrides: SnapshotOperationOverrides = {},
): SnapshotOperationRequest {
  const affectedDeliverableIds = overrides.affectedDeliverableIds
    ?? [state.members[0]!.deliverableId];
  const before = overrides.before ?? stateSnapshot(state, affectedDeliverableIds);
  const requested = overrides.requested ?? {
    target: {
      ref: "refs/heads/delivery-target",
      coordinates: { head: "8".repeat(40), tree: "9".repeat(40) },
    },
    members: before.members.map((member) => ({
      ...member,
      coordinates: { base: "3".repeat(40), head: "a".repeat(40), tree: "b".repeat(40) },
    })),
  };
  const common = {
    operationId: overrides.operationId ?? "opaque-operation",
    affectedDeliverableIds,
    expectedStateRevision: overrides.expectedStateRevision ?? STATE_REVISION,
    before,
    requested,
  };
  const kind = overrides.kind ?? "rewrite";
  if (kind === "rewrite") {
    const mode = overrides.mode;
    return {
      ...common,
      kind,
      mode: mode === "provider-adoption" || mode === "provider-refresh" || mode === "selected-change"
        ? mode
        : "review-fix",
      ...(overrides.reviewFixSelectedDeliverableId === undefined
        ? {}
        : { reviewFixSelectedDeliverableId: overrides.reviewFixSelectedDeliverableId }),
      ...(overrides.reviewFixVerificationDeliverableIds === undefined
        ? {}
        : { reviewFixVerificationDeliverableIds: overrides.reviewFixVerificationDeliverableIds }),
    };
  }
  return kind === "teardown"
    ? { ...common, kind, mode: "member", candidateHeads: [] }
    : { ...common, kind };
}

function operationRequestWithoutMode(
  state: DeliveryStateV1,
  overrides: Parameters<typeof operationRequest>[1] = {},
) {
  const request = operationRequest(state, overrides);
  if (request.kind !== "rewrite") return request;
  const { mode, ...withoutMode } = request;
  void mode;
  return withoutMode;
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
    changeRequestId: "401",
    headSha: "4".repeat(40),
    baseRef: "main",
    targetRef: "refs/heads/main",
    strategy: "merge",
    mergePolicy: {
      repository: "andrewRCr/arc-framework",
      stackPosition: "intermediate",
      method: "merge",
      allowedMethods: ["merge"] as Array<"merge" | "rebase" | "squash">,
      policyFingerprint: `sha256:${"a".repeat(64)}`,
    },
  } as const;
}

function topRemedyEffect() {
  return {
    providerId: "github",
    repository: "andrewRCr/arc-framework",
    changeRequestId: "402",
    headRef: "member-2",
    headSha: "5".repeat(40),
    triggerRef: "refs/heads/member-1",
    triggerHeadSha: "4".repeat(40),
    fromBaseRef: "member-1",
    protectedBaseRef: "main",
    action: "retarget",
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
            ...(request.kind === "rewrite" || request.kind === "teardown"
              ? { mode: request.mode }
              : {}),
            ...(request.kind === "teardown" ? { candidateHeads: request.candidateHeads } : {}),
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
      { ...operationRequestWithoutMode(state), kind: "publish" as const, effect: publishEffect() },
      {
        ...operationRequestWithoutMode(state),
        kind: "land" as const,
        mode: "sequential" as const,
        nativeArm: null,
        effect: landEffect(),
      },
      { ...operationRequestWithoutMode(state), kind: "top-remedy" as const, effect: topRemedyEffect() },
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

  it("requires the matching host effect for host-bearing reservations", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const publish = {
      ...operationRequestWithoutMode(state), kind: "publish" as const, effect: publishEffect(),
    };
    const land = {
      ...operationRequestWithoutMode(state),
      kind: "land" as const,
      mode: "sequential" as const,
      nativeArm: null,
      effect: landEffect(),
    };
    const topRemedy = {
      ...operationRequestWithoutMode(state), kind: "top-remedy" as const, effect: topRemedyEffect(),
    };
    const publishWithoutEffect = { ...publish, effect: undefined };
    const landWithoutEffect = { ...land, effect: undefined };
    for (const invalid of [
      publishWithoutEffect,
      landWithoutEffect,
      { ...topRemedy, effect: undefined },
      { ...publish, effect: landEffect() },
      { ...land, effect: publishEffect() },
      { ...topRemedy, effect: landEffect() },
    ]) {
      expect(reserveDeliveryOperation({ revision: STATE_REVISION, value: state }, plan, invalid))
        .toEqual({ status: "refused", reason: "operation-invalid" });
    }
  });

  it("requires and persists the narrow mode for overloaded operation kinds", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const rewrite = operationRequestWithoutMode(state);
    const land = {
      ...operationRequestWithoutMode(state),
      kind: "land" as const,
      effect: landEffect(),
    };

    expect(reserveDeliveryOperation(
      { revision: STATE_REVISION, value: state },
      plan,
      { ...rewrite, mode: "review-fix" },
    )).toMatchObject({
      status: "reserved",
      state: { activeOperation: { kind: "rewrite", mode: "review-fix" } },
    });
    expect(reserveDeliveryOperation(
      { revision: STATE_REVISION, value: state },
      plan,
      { ...land, mode: "sequential", nativeArm: null },
    )).toMatchObject({
      status: "reserved",
      state: { activeOperation: { kind: "land", mode: "sequential" } },
    });
    expect(reserveDeliveryOperation(
      { revision: STATE_REVISION, value: state },
      plan,
      rewrite,
    )).toEqual({ status: "refused", reason: "operation-invalid" });
    expect(reserveDeliveryOperation(
      { revision: STATE_REVISION, value: state },
      plan,
      land,
    )).toEqual({ status: "refused", reason: "operation-invalid" });

    const teardown = operationRequest(state, { kind: "teardown" });
    if (teardown.kind !== "teardown") throw new Error("fixture must create teardown");
    const { mode: teardownMode, candidateHeads, ...teardownWithoutMode } = teardown;
    void teardownMode;
    void candidateHeads;
    expect(reserveDeliveryOperation(
      { revision: STATE_REVISION, value: state },
      plan,
      teardown,
    )).toMatchObject({
      status: "reserved",
      state: { activeOperation: { kind: "teardown", mode: "member", candidateHeads: [] } },
    });
    expect(reserveDeliveryOperation(
      { revision: STATE_REVISION, value: state },
      plan,
      teardownWithoutMode,
    )).toEqual({ status: "refused", reason: "operation-invalid" });

    const allIds = state.members.map((member) => member.deliverableId);
    const allMembers = stateSnapshot(state, allIds);
    const closeout = {
      ...teardown,
      mode: "closeout-residue" as const,
      affectedDeliverableIds: allIds,
      before: allMembers,
      requested: allMembers,
      candidateHeads: allIds.map((deliverableId, index) => ({
        deliverableId,
        head: index === 0 ? "d".repeat(40) : null,
      })),
    };
    expect(reserveDeliveryOperation(
      { revision: STATE_REVISION, value: state },
      plan,
      closeout,
    )).toMatchObject({
      status: "reserved",
      state: { activeOperation: { kind: "teardown", mode: "closeout-residue" } },
    });
    expect(reserveDeliveryOperation(
      { revision: STATE_REVISION, value: state },
      plan,
      { ...closeout, candidateHeads: closeout.candidateHeads.slice(0, -1) },
    )).toEqual({ status: "refused", reason: "operation-invalid" });
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

  it("refuses an unrelated operation while selected-member verification is pending", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const pending = {
      ...state,
      pendingReviewFixVerification: {
        selectedDeliverableId: state.members[0]!.deliverableId,
        memberDeliverableIds: [state.members[0]!.deliverableId],
      },
    };

    expect(reserveDeliveryOperation(
      { revision: STATE_REVISION, value: pending },
      plan,
      operationRequest(pending),
    )).toEqual({ status: "refused", reason: "pending-review-fix-verification" });
  });

  it("atomically supersedes exact pending verification with another selected-member correction", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const selectedDeliverableId = state.members[0]!.deliverableId;
    const pending = {
      ...state,
      pendingReviewFixVerification: {
        selectedDeliverableId,
        memberDeliverableIds: [selectedDeliverableId],
      },
    };

    const result = reserveDeliveryOperation(
      { revision: STATE_REVISION, value: pending },
      plan,
      operationRequest(pending, { mode: "selected-change" }),
    );

    expect(result).toMatchObject({
      status: "reserved",
      state: {
        pendingReviewFixVerification: null,
        activeOperation: {
          kind: "rewrite",
          mode: "selected-change",
          affectedDeliverableIds: [selectedDeliverableId],
        },
      },
    });
  });

  it("supersedes exact pending verification for rematerialization without changing its recovery mode", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const selectedDeliverableId = state.members[0]!.deliverableId;
    const pending = {
      ...state,
      pendingReviewFixVerification: {
        selectedDeliverableId,
        memberDeliverableIds: [selectedDeliverableId],
      },
    };

    const result = reserveDeliveryOperation(
      { revision: STATE_REVISION, value: pending },
      plan,
      {
        ...operationRequest(pending),
        supersedePendingReviewFixVerification: true,
      },
    );

    expect(result).toMatchObject({
      status: "reserved",
      state: {
        pendingReviewFixVerification: null,
        activeOperation: {
          kind: "rewrite",
          mode: "review-fix",
          affectedDeliverableIds: [selectedDeliverableId],
        },
      },
    });
  });

  it("reserves only a paired plan-ordered review-fix verification set inside the affected suffix", () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const affectedDeliverableIds = state.members.slice(0, -1).map(({ deliverableId }) => deliverableId);
    const [selectedDeliverableId, dependentDeliverableId] = affectedDeliverableIds;
    const common = {
      mode: "provider-adoption" as const,
      affectedDeliverableIds,
      before: stateSnapshot(state, affectedDeliverableIds),
      reviewFixSelectedDeliverableId: selectedDeliverableId,
      reviewFixVerificationDeliverableIds: [selectedDeliverableId!, dependentDeliverableId!],
    };

    expect(reserveDeliveryOperation(
      { revision: STATE_REVISION, value: state },
      plan,
      operationRequest(state, common),
    )).toMatchObject({
      status: "reserved",
      state: {
        activeOperation: {
          reviewFixSelectedDeliverableId: selectedDeliverableId,
          reviewFixVerificationDeliverableIds: [selectedDeliverableId, dependentDeliverableId],
        },
      },
    });

    for (const overrides of [
      { reviewFixVerificationDeliverableIds: undefined },
      { reviewFixSelectedDeliverableId: undefined },
      { reviewFixVerificationDeliverableIds: [dependentDeliverableId!, selectedDeliverableId!] },
      { reviewFixVerificationDeliverableIds: [dependentDeliverableId!] },
      { reviewFixVerificationDeliverableIds: [selectedDeliverableId!, state.members.at(-1)!.deliverableId] },
    ]) {
      expect(reserveDeliveryOperation(
        { revision: STATE_REVISION, value: state },
        plan,
        operationRequest(state, { ...common, ...overrides }),
      )).toEqual({ status: "refused", reason: "operation-invalid" });
    }
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
  it("attaches one async host identity idempotently and advances the operation revision guard", () => {
    const { current, request } = reservedRecord();
    const land = {
      ...current.value.activeOperation!,
      kind: "land" as const,
      mode: "native" as const,
      native: { arm: "linked-single" as const, phase: "submitting" as const },
      effect: landEffect(),
      effectIdentity: null,
    };
    const record = { ...current, value: { ...current.value, activeOperation: land } };
    const identity = { providerId: "github", effectId: "merge-request-uuid" };
    expect(attachDeliveryOperationEffectIdentity({
      ...record,
      value: {
        ...record.value,
        activeOperation: { ...land, mode: "sequential", native: null },
      },
    }, request.operationId, identity)).toEqual({ status: "refused", reason: "wrong-operation" });
    const attached = attachDeliveryOperationEffectIdentity(record, request.operationId, identity);
    expect(attached.status).toBe("attached");
    if (attached.status !== "attached") return;
    expect(attached.state.activeOperation).toMatchObject({ effectIdentity: identity, stateRevision: current.revision });
    const published = { revision: current.revision + 1, value: attached.state };
    expect(attachDeliveryOperationEffectIdentity(published, request.operationId, identity))
      .toEqual({ status: "already-attached", state: attached.state });
    expect(attachDeliveryOperationEffectIdentity(published, request.operationId, {
      providerId: "github", effectId: "different",
    })).toEqual({ status: "refused", reason: "identity-conflict" });
    expect(checkDeliveryOperationPrecondition(published, request.before)).toMatchObject({ status: "ready" });
  });

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
    const { plan, request } = reservedRecord();
    const state = deliveryStateFixture(plan);
    const requestWithoutMode = operationRequestWithoutMode(state);
    const publishRequest = {
      ...requestWithoutMode,
      kind: "publish" as const,
      effect: publishEffect(),
      requested: {
        ...request.requested,
        members: request.requested.members.map((member) => ({ ...member, changeRequest: null })),
      },
    };
    const reserved = reserveDeliveryOperation(
      { revision: STATE_REVISION, value: state },
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
        changeRequest: { providerId: "github", changeRequestId: "401" },
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
    expect(published.value.activeOperation).not.toBeNull();
  });

  it("records host-assigned landed coordinates and teardown clears every member binding", () => {
    const { plan, request } = reservedRecord();
    const state = deliveryStateFixture(plan);
    const landRequest = {
      ...operationRequestWithoutMode(state, {
      requested: stateSnapshot(state, request.affectedDeliverableIds),
      }),
      kind: "land" as const,
      mode: "sequential" as const,
      nativeArm: null,
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
      mode: "member",
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

  it("does not accept provider-assigned target coordinates when no target was requested", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const before = stateSnapshot(state, [state.members[0]!.deliverableId]);
    const request = {
      ...operationRequestWithoutMode(state),
      kind: "land" as const,
      mode: "sequential" as const,
      nativeArm: null,
      before,
      requested: { ...before, target: null },
      effect: landEffect(),
    };
    const reserved = reserveDeliveryOperation({ revision: STATE_REVISION, value: state }, plan, request);
    expect(reserved.status).toBe("reserved");
    if (reserved.status !== "reserved") return;
    expect(acceptDeliveryOperationResult(
      { revision: STATE_REVISION + 1, value: reserved.state },
      {
        kind: "land",
        effect: request.effect,
        outcome: "applied",
        snapshot: {
          ...request.requested,
          target: {
            ref: "refs/heads/main",
            coordinates: { head: "d".repeat(40), tree: "e".repeat(40) },
          },
        },
      },
    )).toEqual({ status: "blocked", reason: "requested-mismatch" });
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
  it("reconciles an ordinary snapshot operation from exact coordinates", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const request = operationRequest(state, { kind: "rewrite" });
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
  });

  it("requires an explicit physical outcome when teardown retains identical bindings", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const before = stateSnapshot(state, [state.members[0]!.deliverableId]);
    const request = operationRequest(state, {
      kind: "teardown",
      mode: "member",
      before,
      requested: before,
    });
    const reserved = reserveDeliveryOperation({ revision: STATE_REVISION, value: state }, plan, request);
    expect(reserved.status).toBe("reserved");
    if (reserved.status !== "reserved") return;
    const current = { revision: STATE_REVISION + 1, value: reserved.state };

    expect(reconcileDeliveryOperation(current, {
      outcome: "applied",
      snapshot: request.requested,
    }).status).toBe("adopt");
    expect(reconcileDeliveryOperation(current, { outcome: "not-applied" })).toEqual({
      status: "retry", operationId: request.operationId,
    });
    expect(reconcileDeliveryOperation(current, { outcome: "ambiguous" })).toEqual({
      status: "blocked", reason: "ambiguous-result",
    });
    expect(reconcileDeliveryOperation(current, request.requested)).toEqual({
      status: "blocked", reason: "observed-facts-invalid",
    });
  });

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

  it("adopts only a matching host-assigned result and retains ambiguous host reservations", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    for (const request of [
      { ...operationRequestWithoutMode(state), kind: "publish" as const, effect: publishEffect() },
      {
        ...operationRequestWithoutMode(state),
        kind: "land" as const,
        mode: "sequential" as const,
        nativeArm: null,
        effect: landEffect(),
      },
      { ...operationRequestWithoutMode(state), kind: "top-remedy" as const, effect: topRemedyEffect() },
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

  it("accepts only a typed matching top-remedy effect observation", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const before = stateSnapshot(state, [state.members[0]!.deliverableId]);
    const request = {
      ...operationRequestWithoutMode(state, { before, requested: before }),
      kind: "top-remedy" as const,
      effect: topRemedyEffect(),
    };
    const reserved = reserveDeliveryOperation({ revision: STATE_REVISION, value: state }, plan, request);
    expect(reserved.status).toBe("reserved");
    if (reserved.status !== "reserved") return;
    const current = { revision: STATE_REVISION + 1, value: reserved.state };
    const applied = {
      kind: "top-remedy" as const, effect: request.effect, outcome: "applied" as const, snapshot: before,
    };
    expect(acceptDeliveryOperationResult(current, applied)).toMatchObject({
      status: "applied", state: { activeOperation: null },
    });
    expect(reconcileDeliveryOperation(current, { outcome: "applied", observation: applied }))
      .toMatchObject({ status: "adopt", state: { activeOperation: null } });
    expect(acceptDeliveryOperationResult(current, {
      ...applied, effect: { ...request.effect, protectedBaseRef: "release" },
    })).toEqual({ status: "blocked", reason: "requested-mismatch" });
  });
});
