import { describe, expect, it, vi } from "vitest";

import {
  executeFreshDeliverySuffixRematerialization,
  prepareDeliverySuffixRematerialization,
  type DeliverySuffixRematerializationDependencies,
} from "../../../src/lib/delivery/suffix-rematerialization.js";
import type { DeliveryContributionEndpoints } from "../../../src/lib/delivery/contribution-proof.js";
import type { DeliveryEligibilitySnapshot } from "../../../src/lib/delivery/eligibility.js";
import {
  deliveryFourMemberStackPlanFixture,
  deliveryThreeMemberStackPlanFixture,
} from "../../fixtures/delivery-plan.js";
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

async function resolveCoordinate(head: string) {
  return { head, tree: "f".repeat(40) };
}

describe("delivery suffix rematerialization", () => {
  it("accepts a selected fix and requires every unselected suffix contribution to carry", async () => {
    const { plan, state, facts, snapshot, second } = fixture();
    const proveCarried = vi.fn(async () => ({ status: "accepted" as const, proof: "aggregate-patch" as const }));
    const result = await prepareDeliverySuffixRematerialization({
      plan, state, facts, eligibleSnapshot: snapshot,
      selectedDeliverableIds: [second.deliverableId], resolveCoordinate, proveCarried,
    });
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") return;
    expect(result.rewrites).toHaveLength(1);
    expect(result.rewrites[0]?.requested.members[0]?.changeRequest).toEqual(second.changeRequest);
    expect(proveCarried).toHaveBeenCalledOnce();
  });

  it("recloses and re-proves each rewrite against the preceding persisted result", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const initial = deliveryStateFixture(plan);
    let current = { revision: 7, value: initial };
    const first = initial.members[0]!;
    const suffix = plan.members.slice(1);
    const target = initial.target!;
    const snapshot: DeliveryEligibilitySnapshot = {
      planId: plan.planId,
      workUnitId: plan.workUnitId,
      planRevision: plan.planRevision,
      planDigest: plan.planDigest,
      protectedBase: { ref: target.ref, ...target.coordinates! },
      control: { ref: "refs/heads/control", head: "d".repeat(40), tree: "e".repeat(40) },
      members: suffix.map((member, index) => ({
        deliverableId: member.deliverableId,
        ref: `refs/heads/candidate-${index + 2}`,
        head: String(index + 7).repeat(40),
        tree: String(index + 4).repeat(40),
      })),
      lifecyclePaths: [],
    };
    const seenRevisions: number[] = [];
    const proveCarried = vi.fn(async () => ({ status: "accepted" as const, proof: "aggregate-patch" as const }));
    const result = await executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: [initial.members[1]!.deliverableId],
    }, {
      reobserve: async () => ({
        status: "observed",
        plan,
        current,
        facts: { target: current.value.target, members: current.value.members, landedDeliverableIds: [first.deliverableId] },
        snapshot,
      }),
      reobserveCandidate: async () => true,
      resolveCoordinate,
      proveCarried,
      apply: async ({ current: input, rewrite }) => {
        seenRevisions.push(input.revision);
        current = {
          revision: input.revision + 1,
          value: {
            ...input.value,
            members: input.value.members.map((member) => member.deliverableId === rewrite.deliverableId
              ? { ...member, ...rewrite.requested.members[0] }
              : member),
          },
        };
        return { status: "applied", state: current };
      },
    });
    expect(result.status).toBe("rematerialized");
    expect(seenRevisions).toEqual([7, 8]);
    expect(proveCarried).toHaveBeenCalledTimes(6);
  });

  it("resumes after a persisted predecessor rewrite without weakening carried contribution proof", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const initial = deliveryStateFixture(plan);
    let current = { revision: 7, value: initial };
    const first = initial.members[0]!;
    const selected = initial.members[1]!;
    const target = initial.target!;
    const suffix = plan.members.slice(1);
    const snapshot: DeliveryEligibilitySnapshot = {
      planId: plan.planId,
      workUnitId: plan.workUnitId,
      planRevision: plan.planRevision,
      planDigest: plan.planDigest,
      protectedBase: { ref: target.ref, ...target.coordinates! },
      control: { ref: "refs/heads/control", head: "d".repeat(40), tree: "e".repeat(40) },
      members: suffix.map((member, index) => ({
        deliverableId: member.deliverableId,
        ref: `refs/heads/candidate-${index + 2}`,
        head: String(index + 7).repeat(40),
        tree: String(index + 4).repeat(40),
      })),
      lifecyclePaths: [],
    };
    const originalBaseByMemberHead = new Map(initial.members.slice(2).map((member) => [
      member.coordinates!.head,
      member.coordinates!.base,
    ]));
    const resolveCoordinate = async (head: string) => ({ head, tree: "0".repeat(40) });
    const proveCarried = vi.fn(async (endpoints: DeliveryContributionEndpoints) =>
      (endpoints.before.predecessor.head === endpoints.after.predecessor.head
        && endpoints.before.member.head === endpoints.after.member.head)
      || originalBaseByMemberHead.get(endpoints.before.member.head) === endpoints.before.predecessor.head
      ? { status: "accepted" as const, proof: "aggregate-patch" as const }
      : { status: "refused" as const, reason: "contribution-mismatch" as const });
    let interruptSecondRewrite = true;
    let applyCount = 0;
    const dependencies: DeliverySuffixRematerializationDependencies = {
      reobserve: async () => ({
        status: "observed" as const,
        plan,
        current,
        facts: {
          target: current.value.target,
          members: current.value.members,
          landedDeliverableIds: [first.deliverableId],
        },
        snapshot,
      }),
      reobserveCandidate: async () => true,
      resolveCoordinate,
      proveCarried,
      apply: async ({ current: input, rewrite }) => {
        applyCount += 1;
        if (interruptSecondRewrite && applyCount === 2) return { status: "refused" as const };
        current = {
          revision: input.revision + 1,
          value: {
            ...input.value,
            members: input.value.members.map((member) => member.deliverableId === rewrite.deliverableId
              ? { ...member, ...rewrite.requested.members[0] }
              : member),
          },
        };
        return { status: "applied" as const, state: current };
      },
    };

    await expect(executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: [selected.deliverableId],
    }, dependencies)).resolves.toEqual({ status: "refused", reason: "rewrite-refused" });
    const interruptedRevision = current.revision;
    interruptSecondRewrite = false;
    applyCount = 0;
    const resumed = await executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: [selected.deliverableId],
    }, dependencies);
    expect(resumed).toMatchObject({ status: "rematerialized" });
    expect(current.revision).toBeGreaterThan(interruptedRevision);
  });

  it("refuses candidate movement and selection outside the exact suffix", async () => {
    const { plan, state, facts, snapshot, second } = fixture();
    const fresh = async () => ({ status: "observed" as const, plan, current: { revision: 7, value: state }, facts, snapshot });
    await expect(executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: [second.deliverableId],
    }, {
      reobserve: fresh,
      reobserveCandidate: async () => false,
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
      apply: async () => { throw new Error("must not apply"); },
    })).resolves.toEqual({ status: "refused", reason: "candidate-moved" });
    await expect(executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: [state.members[0]!.deliverableId],
    }, {
      reobserve: fresh,
      reobserveCandidate: async () => true,
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
      apply: async () => { throw new Error("must not apply"); },
    })).resolves.toEqual({ status: "refused", reason: "selected-member-invalid" });
  });

  it("refuses incomplete/direct-delivery candidates and accidental unselected changes", async () => {
    const { plan, state, facts, snapshot, second } = fixture();
    await expect(prepareDeliverySuffixRematerialization({
      plan, state, facts, eligibleSnapshot: { ...snapshot, members: snapshot.members.slice(0, 1) },
      selectedDeliverableIds: [second.deliverableId],
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
    })).resolves.toEqual({ status: "refused", reason: "suffix-incomplete" });
    await expect(prepareDeliverySuffixRematerialization({
      plan, state, facts,
      eligibleSnapshot: { ...snapshot, members: [{ ...snapshot.members[0]!, ref: "refs/heads/delivery/x/y" }, snapshot.members[1]!] },
      selectedDeliverableIds: [second.deliverableId],
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
    })).resolves.toEqual({ status: "refused", reason: "direct-delivery-ref" });
    await expect(prepareDeliverySuffixRematerialization({
      plan, state, facts, eligibleSnapshot: snapshot,
      selectedDeliverableIds: [second.deliverableId],
      resolveCoordinate,
      proveCarried: async () => ({ status: "refused", reason: "contribution-mismatch" }),
    })).resolves.toEqual({ status: "refused", reason: "unselected-contribution-changed" });
  });

  it("keeps the landed prefix exact and routes semantic changes through plan amendment", async () => {
    const { plan, state, facts, snapshot, first, second } = fixture();
    await expect(prepareDeliverySuffixRematerialization({
      plan, state, facts: { ...facts, members: [{ ...first, coordinates: { ...first.coordinates!, head: "f".repeat(40) } }, ...facts.members.slice(1)] },
      eligibleSnapshot: snapshot, selectedDeliverableIds: [second.deliverableId],
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
    })).resolves.toEqual({ status: "refused", reason: "position-mismatch" });
    await expect(prepareDeliverySuffixRematerialization({
      plan, proposedPlan: { ...plan, planRevision: plan.planRevision + 1 }, state, facts,
      eligibleSnapshot: snapshot, selectedDeliverableIds: [second.deliverableId],
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
    })).resolves.toMatchObject({ status: "plan-amendment" });
  });
});
