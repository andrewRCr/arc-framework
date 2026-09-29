import { describe, expect, it } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

import {
  DeliveryPlanV1Schema,
  DeliveryStateV1Schema,
} from "../../../src/lib/delivery/schema.js";
import {
  constructInitialDeliveryState,
  DeliveryStateV1Codec,
  rebindDeliveryStateToPlan,
  validateDeliveryStateAgainstPlan,
} from "../../../src/lib/delivery/state.js";
import { deriveDeliveryPlanDigest } from "../../../src/lib/delivery/plan.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import {
  deliveryPlanFixture,
  deliveryThreeMemberStackPlanFixture,
} from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

const planId = "123e4567-e89b-42d3-a456-426614174000";
const firstId = canonicalDigest({ member: "first" });
const head = "a".repeat(40);
const tree = "b".repeat(40);

function state(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    semanticsVersion: "delivery-state/v1",
    planId,
    workUnitId: "delivery-plan-record",
    boundPlan: {
      planRevision: 1,
      planDigest: canonicalDigest({ plan: 1 }),
    },
    target: {
      ref: "refs/heads/delivery-target",
      coordinates: { head, tree },
    },
    members: [{
      deliverableId: firstId,
      ref: "refs/heads/delivery-first",
      changeRequest: { providerId: "github", changeRequestId: "123" },
      coordinates: { base: head, head, tree },
    }],
    pendingReviewFixVerification: null,
    activeOperation: {
      operationId: "opaque-operation",
      kind: "publish",
      affectedDeliverableIds: [firstId],
      stateRevision: 1,
      boundPlanDigest: canonicalDigest({ plan: 1 }),
      before: {
        target: null,
        members: [{ deliverableId: firstId, ref: null, changeRequest: null, coordinates: null }],
      },
      requested: {
        target: null,
        members: [{
          deliverableId: firstId,
          ref: "refs/heads/delivery-first",
          changeRequest: null,
          coordinates: { base: head, head, tree },
        }],
      },
      effect: {
        providerId: "github",
        repository: "andrewRCr/arc-framework",
        headRef: "delivery/delivery-plan-record/first",
        headSha: head,
        baseRef: "main",
        draft: true,
      },
    },
  };
}

describe("DeliveryStateV1Schema", () => {
  it("accepts exact current coordinates and rejects copied authority or history fields", () => {
    assertSchemaAccepts(DeliveryStateV1Schema, state());
    for (const field of [
      "providerStatus",
      "providerCapability",
      "reviewVerdict",
      "authorization",
      "gateResult",
      "generation",
    ] as const) {
      assertSchemaRefuses(DeliveryStateV1Schema, { ...state(), [field]: "copied" });
    }
  });

  it("allows a later teardown state whose external bindings are all absent", () => {
    const tornDown = state();
    tornDown.target = null;
    tornDown.activeOperation = null;
    const [member] = tornDown.members as Array<Record<string, unknown>>;
    member!.ref = null;
    member!.changeRequest = null;
    member!.coordinates = null;
    assertSchemaAccepts(DeliveryStateV1Schema, tornDown);
  });

  it("requires a plan-ordered verification set that includes the selected member", () => {
    const current = deliveryStateFixture(deliveryThreeMemberStackPlanFixture());
    const [selected, dependent, terminal] = current.members.map(({ deliverableId }) => deliverableId);
    const pending = {
      selectedDeliverableId: selected!,
      memberDeliverableIds: [selected!, dependent!],
    };

    assertSchemaAccepts(DeliveryStateV1Schema, {
      ...current,
      pendingReviewFixVerification: pending,
    });
    assertSchemaAccepts(DeliveryStateV1Schema, {
      ...current,
      pendingReviewFixVerification: {
        selectedDeliverableId: terminal!,
        memberDeliverableIds: [terminal!],
      },
    });
    for (const memberDeliverableIds of [
      [dependent!, selected!],
      [selected!, selected!],
      [dependent!],
      [selected!, `sha256:${"f".repeat(64)}`],
    ]) {
      assertSchemaRefuses(DeliveryStateV1Schema, {
        ...current,
        pendingReviewFixVerification: { ...pending, memberDeliverableIds },
      });
    }
  });
});

describe("delivery state binding and plan coherence", () => {
  it("constructs the complete ordered state from a pushed ref or opened change request", () => {
    const current = deliveryPlanFixture();
    const firstMemberId = current.members[0]!.deliverableId;
    const secondMemberId = current.members[1]!.deliverableId;
    const pushed = constructInitialDeliveryState(current, {
      kind: "pushed-ref",
      deliverableId: firstMemberId,
      ref: "refs/heads/delivery-first",
      coordinates: { base: head, head, tree },
    });
    expect(pushed).toMatchObject({
      status: "constructed",
      state: {
        planId: current.planId,
        workUnitId: current.workUnitId,
        boundPlan: { planRevision: 1, planDigest: current.planDigest },
        members: [
          { deliverableId: firstMemberId, ref: "refs/heads/delivery-first" },
          { deliverableId: secondMemberId },
        ],
        activeOperation: null,
      },
    });
    if (pushed.status !== "constructed") return;
    expect(DeliveryStateV1Codec.decode(pushed.state)).toEqual({ status: "decoded", value: pushed.state });
    expect(validateDeliveryStateAgainstPlan(pushed.state, current)).toEqual({
      status: "valid",
      state: pushed.state,
    });

    const opened = constructInitialDeliveryState(current, {
      kind: "opened-change-request",
      deliverableId: secondMemberId,
      changeRequest: { providerId: "github", changeRequestId: "456" },
    });
    expect(opened).toMatchObject({
      status: "constructed",
      state: {
        members: [{ deliverableId: firstMemberId }, {
          deliverableId: secondMemberId,
          changeRequest: { providerId: "github", changeRequestId: "456" },
        }],
      },
    });
  });

  it("refuses missing or unknown initial binding evidence", () => {
    const current = deliveryPlanFixture();
    expect(constructInitialDeliveryState(current, null)).toEqual({
      status: "refused",
      reason: "binding-invalid",
    });
    expect(constructInitialDeliveryState(current, {
      kind: "pushed-ref",
      deliverableId: canonicalDigest({ member: "unknown" }),
      ref: "refs/heads/unknown",
      coordinates: { base: head, head, tree },
    })).toEqual({ status: "refused", reason: "unknown-deliverable" });
  });

  it("distinguishes subject, binding, and member-sequence incoherence", () => {
    const current = deliveryPlanFixture();
    const initial = constructInitialDeliveryState(current, {
      kind: "pushed-ref",
      deliverableId: current.members[0]!.deliverableId,
      ref: "refs/heads/delivery-first",
      coordinates: { base: head, head, tree },
    });
    if (initial.status !== "constructed") throw new Error("fixture state must construct");

    expect(validateDeliveryStateAgainstPlan({ ...initial.state, workUnitId: "another-unit" }, current))
      .toEqual({ status: "refused", reason: "subject-mismatch" });
    expect(validateDeliveryStateAgainstPlan({
      ...initial.state,
      boundPlan: { ...initial.state.boundPlan, planRevision: 2 },
    }, current)).toEqual({ status: "refused", reason: "bound-plan-mismatch" });
    expect(validateDeliveryStateAgainstPlan({
      ...initial.state,
      members: [...initial.state.members].reverse(),
    }, current)).toEqual({ status: "refused", reason: "member-sequence-mismatch" });
  });

  it("rebinds preserved member coordinates to an accepted successor revision", () => {
    const current = deliveryPlanFixture();
    const initial = constructInitialDeliveryState(current, {
      kind: "pushed-ref",
      deliverableId: current.members[0]!.deliverableId,
      ref: "refs/heads/delivery-first",
      coordinates: { base: head, head, tree },
    });
    if (initial.status !== "constructed") throw new Error("fixture state must construct");
    const preimage = {
      ...current,
      planRevision: 2,
      previousPlanDigest: current.planDigest,
    };
    const successor = DeliveryPlanV1Schema.parse({
      ...preimage,
      planDigest: deriveDeliveryPlanDigest(preimage),
    });

    const rebound = rebindDeliveryStateToPlan(initial.state, successor);
    expect(rebound).toMatchObject({
      status: "rebound",
      state: {
        boundPlan: { planRevision: 2, planDigest: successor.planDigest },
        members: [{
          deliverableId: current.members[0]!.deliverableId,
          ref: "refs/heads/delivery-first",
        }, { deliverableId: current.members[1]!.deliverableId, ref: null }],
      },
    });
    if (rebound.status !== "rebound") return;
    expect(validateDeliveryStateAgainstPlan(rebound.state, successor).status).toBe("valid");
  });

  it("refuses plan rebinding while selected-member verification is pending", () => {
    const current = deliveryPlanFixture();
    const initial = constructInitialDeliveryState(current, {
      kind: "pushed-ref",
      deliverableId: current.members[0]!.deliverableId,
      ref: "refs/heads/delivery-first",
      coordinates: { base: head, head, tree },
    });
    if (initial.status !== "constructed") throw new Error("fixture state must construct");
    const preimage = { ...current, planRevision: 2, previousPlanDigest: current.planDigest };
    const successor = DeliveryPlanV1Schema.parse({
      ...preimage,
      planDigest: deriveDeliveryPlanDigest(preimage),
    });

    expect(rebindDeliveryStateToPlan({
      ...initial.state,
      pendingReviewFixVerification: {
        selectedDeliverableId: current.members[0]!.deliverableId,
        memberDeliverableIds: [current.members[0]!.deliverableId],
      },
    }, successor)).toEqual({ status: "refused", reason: "pending-review-fix-verification" });
  });
});
