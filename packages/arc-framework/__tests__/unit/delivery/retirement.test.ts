import { describe, expect, it } from "vitest";

import type {
  DeliveryHostChangeRequest,
  DeliveryHostRequestObservation,
} from "../../../src/lib/delivery/host.js";
import { reserveDeliveryOperation } from "../../../src/lib/delivery/operation.js";
import type { AncestryAnswer } from "../../../src/lib/delivery/predecessor-relation.js";
import {
  retireCompletedDeliveryRecords,
  verifyDeliveryTerminalSettlement,
} from "../../../src/lib/delivery/retirement.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import { deliveryThreeMemberStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

function completedRecordsFixture() {
  const plan = deliveryThreeMemberStackPlanFixture();
  const orphan = deliveryThreeMemberStackPlanFixture("223e4567-e89b-42d3-a456-426614174000");
  const initial = deliveryStateFixture(plan);
  const state: DeliveryStateV1 = {
    ...initial,
    members: initial.members.map((member, index) => ({
      ...member,
      ref: index === initial.members.length - 1
        ? "refs/heads/feat/delivery-plan-record"
        : `refs/heads/delivery/${plan.workUnitId}/${plan.members[index]!.chunkKey}`,
      changeRequest: index === initial.members.length - 1
        ? { providerId: "github", changeRequestId: "401" }
        : member.changeRequest,
    })),
  };
  const plans = new Map<string, DeliveryPlanV1>([[plan.planId, plan], [orphan.planId, orphan]]);
  const states = new Map<string, { revision: number; value: DeliveryStateV1 }>([
    [plan.planId, { revision: 7, value: state }],
  ]);
  const terminal = state.members.at(-1)!;
  const request: DeliveryHostChangeRequest = {
    binding: terminal.changeRequest!,
    repository: "owner/repo",
    headRepository: "owner/repo",
    headRef: "feat/delivery-plan-record",
    headSha: terminal.coordinates!.head,
    baseRef: "delivery-target",
    state: "merged",
    draft: false,
  };
  return { plan, orphan, state, plans, states, request };
}

function retirementDependencies(fixture: ReturnType<typeof completedRecordsFixture>) {
  return {
    planStore: {
      removeCurrent: async (planId: string, expectedDigest: string) => {
        const current = fixture.plans.get(planId);
        if (current === undefined) return { status: "ok" as const, value: { removed: false } };
        if (current.planDigest !== expectedDigest) {
          return { status: "refused" as const, reason: "version-conflict" as const };
        }
        fixture.plans.delete(planId);
        return { status: "ok" as const, value: { removed: true } };
      },
    },
    stateStore: {
      read: async (planId: string) => ({ status: "ok" as const, value: fixture.states.get(planId) ?? null }),
      remove: async (planId: string, expectedRevision: number) => {
        const current = fixture.states.get(planId);
        if (current === undefined) return { status: "ok" as const, value: { removed: false } };
        if (current.revision !== expectedRevision) {
          return { status: "refused" as const, reason: "version-conflict" as const };
        }
        fixture.states.delete(planId);
        return { status: "ok" as const, value: { removed: true } };
      },
    },
    observeLocalRef: async () => ({ status: "absent" as const }),
    observeRemoteRef: async () => ({ status: "absent" as const }),
    // The fixture binds one exact head, so identity is the only relation it models; a distinct pair
    // is one this fixture establishes nothing about.
    readAncestry: async (ancestor: string, descendant: string) =>
      ancestor === descendant ? "ancestor" as const : "not-ancestor" as const,
    readTerminalRequest: async () => ({ status: "observed" as const, request: fixture.request }),
  };
}

function retirementInput(fixture: ReturnType<typeof completedRecordsFixture>) {
  return { plans: [...fixture.plans.values()], repository: "owner/repo" };
}

/** One deviation from the exactly-settled arrangement, applied to state, observation, or ancestry. */
interface SettlementDeviation {
  readonly state?: (state: DeliveryStateV1) => DeliveryStateV1;
  readonly request?: Partial<DeliveryHostChangeRequest>;
  readonly observation?: DeliveryHostRequestObservation;
  readonly ancestry?: AncestryAnswer;
}

function withTerminal(
  state: DeliveryStateV1,
  patch: Partial<DeliveryStateV1["members"][number]>,
): DeliveryStateV1 {
  return {
    ...state,
    members: state.members.map((member, index) =>
      index === state.members.length - 1 ? { ...member, ...patch } : member),
  };
}

/** Verify the settlement of a completed fixture carrying exactly one deviation. */
async function settle(deviation: SettlementDeviation = {}) {
  const fixture = completedRecordsFixture();
  return verifyDeliveryTerminalSettlement({
    state: deviation.state === undefined ? fixture.state : deviation.state(fixture.state),
    repository: "owner/repo",
  }, {
    readAncestry: async () => deviation.ancestry ?? "not-ancestor",
    readTerminalRequest: async () => deviation.observation
      ?? { status: "observed", request: { ...fixture.request, ...deviation.request } },
  });
}

describe("terminal settlement conditions", () => {
  it("settles the terminal its record exactly binds", async () => {
    await expect(settle()).resolves.toEqual({ status: "settled" });
  });

  it.each<[string, SettlementDeviation]>([
    ["terminal-member-absent", { state: (state) => ({ ...state, members: [] }) }],
    ["terminal-ref-unbound", { state: (state) => withTerminal(state, { ref: null }) }],
    ["terminal-request-unbound", { state: (state) => withTerminal(state, { changeRequest: null }) }],
    ["terminal-coordinates-unbound", { state: (state) => withTerminal(state, { coordinates: null }) }],
    ["terminal-target-unbound", { state: (state) => ({ ...state, target: null }) }],
    ["terminal-request-unobserved", { observation: { status: "absent" } }],
    ["terminal-provider-mismatch", { request: { binding: { providerId: "gitlab", changeRequestId: "401" } } }],
    ["terminal-request-mismatch", { request: { binding: { providerId: "github", changeRequestId: "402" } } }],
    ["terminal-repository-mismatch", { request: { repository: "other/repo" } }],
    ["terminal-head-repository-mismatch", { request: { headRepository: "fork/repo" } }],
    ["terminal-head-ref-mismatch", { request: { headRef: "feat/some-other-record" } }],
    ["terminal-head-moved", { request: { headSha: "a".repeat(40) }, ancestry: "not-ancestor" }],
    ["terminal-base-ref-mismatch", { request: { baseRef: "some-other-target" } }],
    ["terminal-not-merged", { request: { state: "open" } }],
  ])("reports %s rather than the condition beside it", async (reason, deviation) => {
    await expect(settle(deviation)).resolves.toEqual({ status: "blocked", reason });
  });

  it("reports an unobserved request the same way however the host withheld it", async () => {
    const refusals = ["multiple", "foreign", "queued", "malformed", "unavailable"] as const;

    for (const reason of refusals) {
      await expect(settle({ observation: { status: "refused", reason } }))
        .resolves.toEqual({ status: "blocked", reason: "terminal-request-unobserved" });
    }
  });

  it("separates a head that moved from a base ref that is wrong", async () => {
    // The two refusals stay distinct because a caller acts on them differently — one
    // re-reads the landed head, the other retargets the request.
    const moved = await settle({ request: { headSha: "a".repeat(40) } });
    const rebased = await settle({ request: { baseRef: "some-other-target" } });

    expect(moved).not.toEqual(rebased);
  });
});

describe("delivery record retirement", () => {
  it("removes the completed bound pair and same-work-unit orphan plans", async () => {
    const fixture = completedRecordsFixture();

    await expect(retireCompletedDeliveryRecords(
      retirementInput(fixture), retirementDependencies(fixture),
    )).resolves.toEqual({
      status: "retired",
      planIds: [fixture.plan.planId, fixture.orphan.planId],
    });
    expect({ plans: [...fixture.plans], states: [...fixture.states] }).toEqual({ plans: [], states: [] });
  });

  it("refuses while a delivery operation remains active", async () => {
    const fixture = completedRecordsFixture();
    const affected = fixture.state.members[0]!;
    const snapshot = {
      target: fixture.state.target,
      members: [{
        deliverableId: affected.deliverableId,
        ref: affected.ref,
        changeRequest: affected.changeRequest,
        coordinates: affected.coordinates,
      }],
    };
    const reserved = reserveDeliveryOperation({ revision: 7, value: fixture.state }, fixture.plan, {
      operationId: "retirement-blocker",
      kind: "teardown",
      mode: "member",
      candidateHeads: [],
      affectedDeliverableIds: [affected.deliverableId],
      expectedStateRevision: 7,
      before: snapshot,
      requested: snapshot,
    });
    if (reserved.status !== "reserved") throw new Error("fixture operation must reserve");
    fixture.states.set(fixture.plan.planId, { revision: 7, value: reserved.state });

    await expect(retireCompletedDeliveryRecords(
      retirementInput(fixture), retirementDependencies(fixture),
    )).resolves.toMatchObject({
      status: "blocked",
      reason: "operation-active",
    });
    expect({ plans: fixture.plans.size, states: fixture.states.size }).toEqual({ plans: 2, states: 1 });
  });

  it("refuses record retirement while selected-member verification is pending", async () => {
    const fixture = completedRecordsFixture();
    fixture.states.set(fixture.plan.planId, {
      revision: 7,
      value: {
        ...fixture.state,
        pendingReviewFixVerification: {
          selectedDeliverableId: fixture.state.members[0]!.deliverableId,
          memberDeliverableIds: [fixture.state.members[0]!.deliverableId],
        },
      },
    });

    await expect(retireCompletedDeliveryRecords(
      retirementInput(fixture), retirementDependencies(fixture),
    )).resolves.toMatchObject({
      status: "blocked",
      reason: "pending-review-fix-verification",
    });
    expect({ plans: fixture.plans.size, states: fixture.states.size }).toEqual({ plans: 2, states: 1 });
  });

  it("refuses while either side of a nonterminal member ref remains", async () => {
    for (const side of ["local", "remote"] as const) {
      const fixture = completedRecordsFixture();
      const dependencies = retirementDependencies(fixture);
      const observed = async () => ({ status: "observed" as const, head: fixture.state.members[0]!.coordinates!.head });
      const withResidue = {
        ...dependencies,
        observeLocalRef: side === "local" ? observed : dependencies.observeLocalRef,
        observeRemoteRef: side === "remote" ? observed : dependencies.observeRemoteRef,
      };

      await expect(retireCompletedDeliveryRecords(
        retirementInput(fixture), withResidue,
      )).resolves.toMatchObject({ status: "blocked", reason: "member-ref-present" });
      expect({ plans: fixture.plans.size, states: fixture.states.size }).toEqual({ plans: 2, states: 1 });
    }
  });

  it("refuses an unmerged or mismatched terminal request, carrying the condition out", async () => {
    for (const [request, reason] of [
      [{ state: "open" as const }, "terminal-not-merged"],
      [{ state: "closed" as const }, "terminal-not-merged"],
      [{ headSha: "f".repeat(40) }, "terminal-head-moved"],
    ] as const) {
      const fixture = completedRecordsFixture();
      fixture.request = { ...fixture.request, ...request };

      await expect(retireCompletedDeliveryRecords(
        retirementInput(fixture), retirementDependencies(fixture),
      )).resolves.toMatchObject({ status: "blocked", reason });
      expect({ plans: fixture.plans.size, states: fixture.states.size }).toEqual({ plans: 2, states: 1 });
    }
  });

  it("retires a terminal the host merged at a descendant of the head it binds", async () => {
    const fixture = completedRecordsFixture();
    const bound = fixture.state.members.at(-1)!.coordinates!.head;
    const merged = "a".repeat(40);
    fixture.request = { ...fixture.request, headSha: merged };

    await expect(retireCompletedDeliveryRecords(retirementInput(fixture), {
      ...retirementDependencies(fixture),
      // Answers the one ordered pair the settlement is entitled to ask about, so a read taken in the
      // other direction — or of another pair — reaches the refusal rather than this admission.
      readAncestry: async (ancestor: string, descendant: string) =>
        ancestor === bound && descendant === merged ? "ancestor" as const : "not-ancestor" as const,
    })).resolves.toEqual({
      status: "retired",
      planIds: [fixture.plan.planId, fixture.orphan.planId],
    });
  });

  it("refuses a moved terminal head no ancestry read places", async () => {
    const fixture = completedRecordsFixture();
    fixture.request = { ...fixture.request, headSha: "a".repeat(40) };

    await expect(retireCompletedDeliveryRecords(retirementInput(fixture), {
      ...retirementDependencies(fixture),
      readAncestry: async () => "unresolvable" as const,
    })).resolves.toMatchObject({ status: "blocked", reason: "terminal-head-moved" });
    expect({ plans: fixture.plans.size, states: fixture.states.size }).toEqual({ plans: 2, states: 1 });
  });

  it("retries through orphan plans after exact state removal", async () => {
    const fixture = completedRecordsFixture();
    const dependencies = retirementDependencies(fixture);
    let refusePlanOnce = true;
    const interruptedDependencies = {
      ...dependencies,
      planStore: {
        ...dependencies.planStore,
        removeCurrent: async (planId: string, expectedDigest: string) => {
          if (refusePlanOnce) {
            refusePlanOnce = false;
            return { status: "refused" as const, reason: "version-conflict" as const };
          }
          return dependencies.planStore.removeCurrent(planId, expectedDigest as DeliveryPlanV1["planDigest"]);
        },
      },
    };

    await expect(retireCompletedDeliveryRecords(
      retirementInput(fixture), interruptedDependencies,
    )).resolves.toMatchObject({
      status: "blocked",
      reason: "plan-version-conflict",
    });
    expect({ plans: fixture.plans.size, states: fixture.states.size }).toEqual({ plans: 2, states: 0 });

    await expect(retireCompletedDeliveryRecords(
      retirementInput(fixture), dependencies,
    )).resolves.toMatchObject({ status: "retired" });
    expect({ plans: fixture.plans.size, states: fixture.states.size }).toEqual({ plans: 0, states: 0 });
  });

  it("treats a repeated retirement as an idempotent success", async () => {
    const fixture = completedRecordsFixture();
    const dependencies = retirementDependencies(fixture);
    await expect(retireCompletedDeliveryRecords(
      retirementInput(fixture), dependencies,
    )).resolves.toMatchObject({ status: "retired" });
    await expect(retireCompletedDeliveryRecords(
      retirementInput(fixture), dependencies,
    )).resolves.toEqual({
      status: "retired",
      planIds: [],
    });
  });
});
