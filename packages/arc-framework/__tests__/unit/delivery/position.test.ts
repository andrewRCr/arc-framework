import { describe, expect, it } from "vitest";

import {
  assessDeliveryMemberReadiness,
  deriveDeliveryPosition,
  recognizeDeliverySuffixRetarget,
  resolveDeliveryPredecessorHead,
  type DeliveryPositionFactsV1,
} from "../../../src/lib/delivery/position.js";
import { deriveDeliveryPlanDigest } from "../../../src/lib/delivery/plan.js";
import {
  DeliveryStateV1Schema,
  type DeliveryStateV1,
} from "../../../src/lib/delivery/schema.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import { deliveryPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

function positionFacts(
  state: DeliveryStateV1,
  landedDeliverableIds: DeliveryPositionFactsV1["landedDeliverableIds"] = [],
): DeliveryPositionFactsV1 {
  return {
    target: state.target,
    members: state.members.map((member) => ({
      deliverableId: member.deliverableId,
      ref: member.ref,
      changeRequest: member.changeRequest,
      coordinates: member.coordinates,
    })),
    landedDeliverableIds,
  };
}

describe("deriveDeliveryPosition", () => {
  it("uses the target only for a coordinate-free predecessor already known landed", () => {
    const state = deliveryStateFixture();
    const first = state.members[0]!;
    const facts = positionFacts(state);
    facts.members[0] = { ...facts.members[0]!, coordinates: null };

    expect(resolveDeliveryPredecessorHead(facts, 1)).toBeNull();
    expect(resolveDeliveryPredecessorHead({
      ...facts,
      landedDeliverableIds: [first.deliverableId],
    }, 1)).toBe(state.target!.coordinates!.head);
  });

  it("derives the landed prefix, first unlanded member, and bound suffix", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const [firstId, secondId] = plan.members.map((member) => member.deliverableId);

    expect(deriveDeliveryPosition(plan, state, positionFacts(state, [firstId!]))).toEqual({
      status: "derived",
      position: {
        landedPrefix: [firstId],
        firstUnlanded: secondId,
        boundSuffix: [secondId],
      },
    });
    expect(deriveDeliveryPosition(plan, state, positionFacts(state, [firstId!, secondId!]))).toEqual({
      status: "derived",
      position: {
        landedPrefix: [firstId, secondId],
        firstUnlanded: null,
        boundSuffix: [],
      },
    });
  });

  it("derives bound suffix membership from current state bindings", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const [first, second] = state.members;
    const changeRequestBound = {
      ...state,
      members: [first!, {
        ...second!,
        ref: null,
        coordinates: null,
        changeRequest: { providerId: "github", changeRequestId: "pull/402" },
      }],
    };
    expect(deriveDeliveryPosition(
      plan,
      changeRequestBound,
      positionFacts(changeRequestBound, [first!.deliverableId]),
    )).toMatchObject({ status: "derived", position: { boundSuffix: [second!.deliverableId] } });

    const unbound = {
      ...changeRequestBound,
      members: [first!, { ...changeRequestBound.members[1]!, changeRequest: null }],
    };
    expect(deriveDeliveryPosition(plan, unbound, positionFacts(unbound, [first!.deliverableId])))
      .toMatchObject({ status: "derived", position: { boundSuffix: [] } });
  });

  it("rejects missing, duplicate, reordered, or foreign member facts", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const facts = positionFacts(state);
    const foreign = {
      deliverableId: canonicalDigest({ member: "foreign" }),
      ref: null,
      changeRequest: null,
      coordinates: null,
    };

    expect(deriveDeliveryPosition(plan, state, { ...facts, members: facts.members.slice(0, 1) }))
      .toEqual({ status: "refused", reason: "member-sequence-invalid" });
    expect(deriveDeliveryPosition(plan, state, { ...facts, members: [facts.members[0], facts.members[0]] }))
      .toEqual({ status: "refused", reason: "facts-invalid" });
    expect(deriveDeliveryPosition(plan, state, { ...facts, members: [...facts.members].reverse() }))
      .toEqual({ status: "refused", reason: "member-sequence-invalid" });
    expect(deriveDeliveryPosition(plan, state, { ...facts, members: [facts.members[0], foreign] }))
      .toEqual({ status: "refused", reason: "member-sequence-invalid" });
  });

  it("rejects a landed sequence that is not an exact plan prefix", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const [firstId, secondId] = plan.members.map((member) => member.deliverableId);

    expect(deriveDeliveryPosition(plan, state, positionFacts(state, [secondId!])))
      .toEqual({ status: "refused", reason: "landed-sequence-invalid" });
    expect(deriveDeliveryPosition(plan, state, positionFacts(state, [secondId!, firstId!])))
      .toEqual({ status: "refused", reason: "landed-sequence-invalid" });
    expect(deriveDeliveryPosition(plan, state, {
      ...positionFacts(state),
      landedDeliverableIds: [firstId, firstId],
    })).toEqual({ status: "refused", reason: "facts-invalid" });
  });

  it("refuses exact member or target coordinate movement", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const facts = positionFacts(state);
    expect(deriveDeliveryPosition(plan, state, {
      ...facts,
      members: facts.members.map((member, index) => index === 0 ? {
        ...member,
        coordinates: { ...member.coordinates!, head: "e".repeat(40) },
      } : member),
    })).toEqual({ status: "refused", reason: "coordinates-moved" });
    expect(deriveDeliveryPosition(plan, state, {
      ...facts,
      target: {
        ...facts.target!,
        coordinates: { ...facts.target!.coordinates!, tree: "f".repeat(40) },
      },
    })).toEqual({ status: "refused", reason: "coordinates-moved" });
  });
});

describe("assessDeliveryMemberReadiness", () => {
  it("readies only the first unlanded bound member", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const [firstId, secondId] = plan.members.map((member) => member.deliverableId);
    const facts = positionFacts(state, [firstId!]);

    expect(assessDeliveryMemberReadiness(plan, state, facts, secondId!)).toMatchObject({
      status: "ready",
      position: { firstUnlanded: secondId },
    });
    expect(assessDeliveryMemberReadiness(plan, state, facts, firstId!)).toEqual({
      status: "blocked",
      reason: "member-out-of-position",
    });
    expect(assessDeliveryMemberReadiness(
      plan,
      state,
      facts,
      canonicalDigest({ member: "unknown" }),
    )).toEqual({ status: "blocked", reason: "unknown-deliverable" });
  });

  it("blocks an unbound selected member", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const [first, second] = state.members;
    const unbound = {
      ...state,
      members: [first!, { ...second!, ref: null, changeRequest: null, coordinates: null }],
    };
    expect(assessDeliveryMemberReadiness(
      plan,
      unbound,
      positionFacts(unbound, [first!.deliverableId]),
      second!.deliverableId,
    )).toEqual({ status: "blocked", reason: "member-unbound" });
  });

  it("blocks a stack member without the relevant landability assertion", () => {
    const plan = deliveryPlanFixture();
    const preimage = { ...plan, projection: { kind: "stack-to-main" as const } };
    const stackPlan = { ...preimage, planDigest: deriveDeliveryPlanDigest(preimage) };
    const state = deliveryStateFixture(stackPlan);
    expect(assessDeliveryMemberReadiness(
      stackPlan,
      state,
      positionFacts(state),
      stackPlan.members[0]!.deliverableId,
    )).toEqual({ status: "blocked", reason: "landability-mismatch" });
  });

  it("blocks stale plan binding, moved coordinates, or an unresolved operation", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const selectedId = plan.members[0]!.deliverableId;
    const facts = positionFacts(state);
    const stale = {
      ...state,
      boundPlan: { ...state.boundPlan, planDigest: canonicalDigest({ plan: "stale" }) },
    };
    expect(assessDeliveryMemberReadiness(plan, stale, positionFacts(stale), selectedId))
      .toEqual({ status: "blocked", reason: "stale-plan-binding" });

    const moved = {
      ...facts,
      members: facts.members.map((member, index) => index === 0 ? {
        ...member,
        coordinates: { ...member.coordinates!, head: "e".repeat(40) },
      } : member),
    };
    expect(assessDeliveryMemberReadiness(plan, state, moved, selectedId))
      .toEqual({ status: "blocked", reason: "coordinates-moved" });

    const before = {
      target: state.target,
      members: facts.members.slice(0, 1),
    };
    const active = DeliveryStateV1Schema.parse({
      ...state,
      activeOperation: {
        operationId: "opaque-operation",
        kind: "publish",
        affectedDeliverableIds: [selectedId],
        stateRevision: 1,
        boundPlanDigest: plan.planDigest,
        before,
        requested: before,
        effect: {
          providerId: "github",
          repository: "andrewRCr/arc-framework",
          headRef: "delivery/delivery-plan-record/first",
          headSha: "4".repeat(40),
          baseRef: "main",
          draft: true,
        },
      },
    });
    expect(assessDeliveryMemberReadiness(plan, active, positionFacts(active), selectedId))
      .toEqual({ status: "blocked", reason: "operation-active" });
  });
});

describe("recognizeDeliverySuffixRetarget", () => {
  it("tolerates only the moved first-unlanded member after a landed predecessor", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const targetHead = state.target?.coordinates?.head;
    if (targetHead === undefined) throw new Error("fixture target must be bound");
    const [landed, candidate] = state.members;
    const moved = positionFacts(state, [landed!.deliverableId]);
    moved.members[1] = {
      ...moved.members[1]!,
      coordinates: {
        base: targetHead,
        head: "e".repeat(40),
        tree: "f".repeat(40),
      },
    };

    expect(deriveDeliveryPosition(plan, state, moved)).toEqual({
      status: "refused",
      reason: "coordinates-moved",
    });
    expect(recognizeDeliverySuffixRetarget(plan, state, moved)).toMatchObject({
      status: "recognized",
      deliverableId: candidate!.deliverableId,
      before: { members: [{ coordinates: candidate!.coordinates }] },
      requested: { members: [{ coordinates: moved.members[1]!.coordinates }] },
    });
  });

  it("refuses target drift, a second moved member, no landed predecessor, or an active operation", () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const targetHead = state.target?.coordinates?.head;
    if (targetHead === undefined) throw new Error("fixture target must be bound");
    const facts = positionFacts(state, [state.members[0]!.deliverableId]);
    facts.members[1] = {
      ...facts.members[1]!,
      coordinates: { base: targetHead, head: "e".repeat(40), tree: "f".repeat(40) },
    };
    expect(recognizeDeliverySuffixRetarget(plan, state, {
      ...facts,
      target: { ...facts.target!, coordinates: { ...facts.target!.coordinates, tree: "9".repeat(40) } },
    })).toMatchObject({ status: "refused" });
    expect(recognizeDeliverySuffixRetarget(plan, state, {
      ...facts,
      members: facts.members.map((member, index) => index === 0 ? {
        ...member,
        coordinates: { ...member.coordinates!, tree: "8".repeat(40) },
      } : member),
    })).toMatchObject({ status: "refused" });
    expect(recognizeDeliverySuffixRetarget(plan, state, positionFacts(state))).toMatchObject({ status: "refused" });
    const before = { target: state.target, members: [facts.members[1]!] };
    const active = DeliveryStateV1Schema.parse({
      ...state,
      activeOperation: {
        operationId: "rewrite",
        kind: "rewrite",
        affectedDeliverableIds: [state.members[1]!.deliverableId],
        stateRevision: 1,
        boundPlanDigest: plan.planDigest,
        before,
        requested: before,
      },
    });
    expect(recognizeDeliverySuffixRetarget(plan, active, facts)).toMatchObject({ status: "refused" });
  });
});
