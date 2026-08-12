import { describe, expect, it, vi } from "vitest";

import { prepareDeliverySuffixRematerialization } from "../../../src/lib/delivery/suffix-rematerialization.js";
import type { DeliveryEligibilitySnapshot } from "../../../src/lib/delivery/eligibility.js";
import { deliveryThreeMemberStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

function fixture() {
  const plan = deliveryThreeMemberStackPlanFixture();
  const state = deliveryStateFixture(plan);
  const first = state.members[0]!;
  const second = state.members[1]!;
  const third = state.members[2]!;
  const facts = {
    target: state.target,
    members: state.members,
    landedDeliverableIds: [first.deliverableId],
  };
  const target = state.target!;
  const snapshot: DeliveryEligibilitySnapshot = {
    planId: plan.planId,
    workUnitId: plan.workUnitId,
    planRevision: plan.planRevision,
    planDigest: plan.planDigest,
    protectedBase: { ref: target.ref, ...target.coordinates! },
    control: { ref: "refs/heads/feat/control", head: "d".repeat(40), tree: "e".repeat(40) },
    members: [{ deliverableId: second.deliverableId, ref: "refs/heads/candidate/second", head: "a".repeat(40), tree: "b".repeat(40) }, {
      deliverableId: third.deliverableId, ref: "refs/heads/candidate/third", head: "c".repeat(40), tree: "d".repeat(40),
    }],
    lifecyclePaths: [".arc/active/meta-delivery-plan-record.md"],
  };
  return { plan, state, facts, snapshot, first, second, third };
}

describe("delivery suffix rematerialization", () => {
  it("accepts a selected fix and requires every unselected suffix contribution to carry", async () => {
    const { plan, state, facts, snapshot, second } = fixture();
    const proveCarried = vi.fn(async () => ({ status: "accepted" as const, proof: "aggregate-patch" as const }));
    const result = await prepareDeliverySuffixRematerialization({
      plan, state, facts, eligibleSnapshot: snapshot,
      selectedDeliverableIds: [second.deliverableId], proveCarried,
    });
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") return;
    expect(result.rewrites).toHaveLength(1);
    expect(result.rewrites[0]?.requested.members[0]?.changeRequest).toEqual(second.changeRequest);
    expect(proveCarried).toHaveBeenCalledOnce();
  });

  it("refuses incomplete/direct-delivery candidates and accidental unselected changes", async () => {
    const { plan, state, facts, snapshot, second } = fixture();
    await expect(prepareDeliverySuffixRematerialization({
      plan, state, facts, eligibleSnapshot: { ...snapshot, members: snapshot.members.slice(0, 1) },
      selectedDeliverableIds: [second.deliverableId],
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
    })).resolves.toEqual({ status: "refused", reason: "suffix-incomplete" });
    await expect(prepareDeliverySuffixRematerialization({
      plan, state, facts,
      eligibleSnapshot: { ...snapshot, members: [{ ...snapshot.members[0]!, ref: "refs/heads/delivery/x/y" }, snapshot.members[1]!] },
      selectedDeliverableIds: [second.deliverableId],
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
    })).resolves.toEqual({ status: "refused", reason: "direct-delivery-ref" });
    await expect(prepareDeliverySuffixRematerialization({
      plan, state, facts, eligibleSnapshot: snapshot,
      selectedDeliverableIds: [second.deliverableId],
      proveCarried: async () => ({ status: "refused", reason: "contribution-mismatch" }),
    })).resolves.toEqual({ status: "refused", reason: "unselected-contribution-changed" });
  });

  it("keeps the landed prefix exact and routes semantic changes through plan amendment", async () => {
    const { plan, state, facts, snapshot, first, second } = fixture();
    await expect(prepareDeliverySuffixRematerialization({
      plan, state, facts: { ...facts, members: [{ ...first, coordinates: { ...first.coordinates!, head: "f".repeat(40) } }, ...facts.members.slice(1)] },
      eligibleSnapshot: snapshot, selectedDeliverableIds: [second.deliverableId],
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
    })).resolves.toEqual({ status: "refused", reason: "position-mismatch" });
    await expect(prepareDeliverySuffixRematerialization({
      plan, proposedPlan: { ...plan, planRevision: plan.planRevision + 1 }, state, facts,
      eligibleSnapshot: snapshot, selectedDeliverableIds: [second.deliverableId],
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
    })).resolves.toMatchObject({ status: "plan-amendment" });
  });
});
