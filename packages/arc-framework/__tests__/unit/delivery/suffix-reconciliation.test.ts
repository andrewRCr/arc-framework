import { describe, expect, it, vi } from "vitest";

import {
  adoptExternalDeliverySuffixRefresh,
  executeDeliveryProviderRefresh,
  executeDeliverySuffixRewrite,
  reconcileReservedSuffixRetarget,
} from "../../../src/lib/delivery/suffix-reconciliation.js";
import { reserveDeliveryOperation } from "../../../src/lib/delivery/operation.js";
import type { DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import {
  deliveryFourMemberStackPlanFixture,
  deliveryPlanFixture,
} from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

function movedFixture() {
  const plan = deliveryPlanFixture();
  const state = deliveryStateFixture(plan);
  const targetHead = state.target?.coordinates?.head;
  if (targetHead === undefined) throw new Error("fixture target must be bound");
  const first = state.members[0]!;
  const second = {
    ...state.members[1]!,
    changeRequest: { providerId: "github", changeRequestId: "402" },
  };
  const bound = { ...state, members: [first, second] };
  return { plan, state: bound };
}

function providerRefreshFixture() {
  const plan = deliveryFourMemberStackPlanFixture();
  const fixture = deliveryStateFixture(plan);
  const state = {
    ...fixture,
    members: fixture.members.map((member, index) => ({
      ...member,
      changeRequest: { providerId: "github", changeRequestId: String(500 + index) },
    })),
  };
  const affected = plan.members.slice(1, -1).map(({ deliverableId }) => deliverableId);
  const before = {
    target: state.target,
    members: state.members.slice(1, -1).map((member) => ({ ...member })),
  };
  const observed = {
    ...before,
    members: before.members.map((member, index) => ({
      ...member,
      coordinates: {
        ...member.coordinates!,
        head: String(index + 8).repeat(40),
        tree: String(index + 6).repeat(40),
      },
    })),
  };
  return { plan, state, affected, before, observed };
}

function reservedProviderRefreshFixture() {
  const fixture = providerRefreshFixture();
  const reserved = reserveDeliveryOperation({ revision: 7, value: fixture.state }, fixture.plan, {
    operationId: "refresh-operation",
    kind: "rewrite",
    mode: "provider-adoption",
    affectedDeliverableIds: fixture.affected,
    expectedStateRevision: 7,
    before: fixture.before,
    requested: fixture.before,
  });
  if (reserved.status !== "reserved") throw new Error("provider refresh fixture must reserve");
  return { ...fixture, reserved: { revision: 8, value: reserved.state } };
}

describe("delivery suffix reconciliation", () => {
  it("persists the rewrite reservation before invoking an ARC-issued provider refresh", async () => {
    const { plan, state, affected, before, observed } = providerRefreshFixture();
    const writes: DeliveryStateV1[] = [];
    const proved: string[] = [];
    let mutationSawReservation = false;
    const result = await executeDeliveryProviderRefresh({
      plan,
      current: { revision: 7, value: state },
      affectedDeliverableIds: affected,
      observeBefore: async () => ({ snapshot: before, targetMovement: "exact" }),
      refreshProvider: async () => {
        const operation = writes.at(-1)?.activeOperation;
        mutationSawReservation = operation?.kind === "rewrite" && operation.mode === "provider-adoption";
        return { status: "accepted" };
      },
      observeResult: async () => ({ snapshot: observed, targetMovement: "exact" }),
      proveContribution: async ({ deliverableId }) => {
        proved.push(deliverableId);
        return { status: "accepted", proof: "mechanical-reapply" };
      },
      stateStore: { publish: async (_planId, value, revision) => {
        writes.push(value);
        return { status: "ok", value: { revision: revision + 1, value } };
      } },
    });

    expect(result).toMatchObject({ status: "applied", state: { value: { activeOperation: null } } });
    expect(mutationSawReservation).toBe(true);
    expect(proved).toEqual(affected);
  });

  it("resumes an interrupted provider refresh by adopting its exact partial result", async () => {
    const { plan, state, affected, before, observed } = providerRefreshFixture();
    const writes: Array<{ revision: number; value: DeliveryStateV1 }> = [];
    await expect(executeDeliveryProviderRefresh({
      plan,
      current: { revision: 7, value: state },
      affectedDeliverableIds: affected,
      observeBefore: async () => ({ snapshot: before, targetMovement: "exact" }),
      refreshProvider: async () => ({ status: "accepted" }),
      observeResult: async () => { throw new Error("session interrupted"); },
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      stateStore: { publish: async (_planId, value, revision) => {
        const record = { revision: revision + 1, value };
        writes.push(record);
        return { status: "ok", value: record };
      } },
    })).rejects.toThrow("session interrupted");
    const reserved = writes[0];
    if (reserved === undefined) throw new Error("reservation must persist before interruption");
    const partial = {
      ...before,
      members: [observed.members[0]!, before.members[1]!],
    };

    const result = await reconcileReservedSuffixRetarget({
      planId: plan.planId,
      current: reserved,
      observed: { snapshot: partial, targetMovement: "exact" },
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      stateStore: { publish: async (_planId, value, revision) => ({
        status: "ok", value: { revision: revision + 1, value },
      }) },
    });

    expect(result).toMatchObject({ status: "applied", state: { value: { activeOperation: null } } });
    if (result.status !== "applied") return;
    expect(result.state.value.members[1]?.coordinates).toEqual(partial.members[0]!.coordinates);
    expect(result.state.value.members[2]?.coordinates).toEqual(partial.members[1]!.coordinates);
  });

  it("observes and proves external refresh results member by member before one direct CAS adoption", async () => {
    const { plan, state, affected, observed } = providerRefreshFixture();
    const proved: string[] = [];
    let observedResult = false;
    let prematureWrite = false;
    const result = await adoptExternalDeliverySuffixRefresh({
      plan,
      current: { revision: 7, value: state },
      affectedDeliverableIds: affected,
      observeResult: async () => {
        observedResult = true;
        return { snapshot: observed, targetMovement: "exact" };
      },
      proveContribution: async ({ deliverableId }) => {
        proved.push(deliverableId);
        return { status: "accepted", proof: "mechanical-reapply" };
      },
      stateStore: { publish: async (_planId, value, revision) => {
        prematureWrite = !observedResult || proved.length !== affected.length
          || value.activeOperation !== null;
        return { status: "ok", value: { revision: revision + 1, value } };
      } },
    });

    expect(result).toMatchObject({ status: "applied", state: { revision: 8 } });
    expect(proved).toEqual(affected);
    expect(prematureWrite).toBe(false);
    if (result.status !== "applied") return;
    expect(result.state.value.members.slice(1, -1).map(({ coordinates }) => coordinates))
      .toEqual(observed.members.map(({ coordinates }) => coordinates));
    expect(Object.keys(result.state.value).sort()).toEqual([
      "activeOperation", "boundPlan", "members", "planId", "schemaVersion", "semanticsVersion", "target",
      "workUnitId",
    ]);
  });

  it("adopts an observer-proven append-only target with the refreshed suffix", async () => {
    const { plan, state, affected, observed } = providerRefreshFixture();
    const advancedTarget = {
      ref: state.target!.ref,
      coordinates: { head: "d".repeat(40), tree: "e".repeat(40) },
    };
    const result = await adoptExternalDeliverySuffixRefresh({
      plan,
      current: { revision: 7, value: state },
      affectedDeliverableIds: affected,
      observeResult: async () => ({
        snapshot: { ...observed, target: advancedTarget },
        targetMovement: "append-only",
      }),
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      stateStore: { publish: async (_planId, value, revision) => ({
        status: "ok", value: { revision: revision + 1, value },
      }) },
    });

    expect(result).toMatchObject({
      status: "applied",
      state: { value: { target: advancedTarget, activeOperation: null } },
    });
  });

  it("keeps a provider reservation retryable and blocks ambiguous or unproved recovery", async () => {
    const { plan, reserved, before, observed } = reservedProviderRefreshFixture();
    const wrongMode = {
      ...reserved,
      value: {
        ...reserved.value,
        activeOperation: {
          ...reserved.value.activeOperation!,
          kind: "rewrite" as const,
          mode: "review-fix" as const,
        },
      },
    };
    await expect(reconcileReservedSuffixRetarget({
      planId: plan.planId,
      current: wrongMode,
      observed: { snapshot: before, targetMovement: "exact" },
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      stateStore: { publish: async (_id, value) => ({ status: "ok", value: { revision: 9, value } }) },
    })).resolves.toEqual({ status: "blocked", reason: "ambiguous" });
    await expect(reconcileReservedSuffixRetarget({
      planId: plan.planId,
      current: reserved,
      observed: { snapshot: observed, targetMovement: "exact" },
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      stateStore: { publish: async () => ({ status: "refused", reason: "version-conflict" }) },
    })).resolves.toEqual({ status: "blocked", reason: "state-conflict" });
    await expect(reconcileReservedSuffixRetarget({
      planId: plan.planId,
      current: reserved,
      observed: { snapshot: observed, targetMovement: "exact" },
      proveContribution: async () => ({
        status: "refused",
        reason: "contribution-diverged",
        paths: ["feature.txt"],
      }),
      stateStore: { publish: vi.fn() },
    })).resolves.toEqual({
      status: "blocked",
      reason: "contribution-diverged",
      paths: ["feature.txt"],
    });
    const proveRetry = vi.fn(async () => ({
      status: "refused" as const, reason: "git-failure" as const,
    }));
    await expect(reconcileReservedSuffixRetarget({
      planId: plan.planId,
      current: reserved,
      observed: { snapshot: reserved.value.activeOperation!.before, targetMovement: "exact" },
      proveContribution: proveRetry,
      stateStore: { publish: vi.fn() },
    })).resolves.toEqual({ status: "retryable" });
    expect(proveRetry).not.toHaveBeenCalled();
  });

  it("refuses a second ARC-issued refresh while the provider reservation is active", async () => {
    const { plan, reserved, affected, before, observed } = reservedProviderRefreshFixture();
    const refreshProvider = vi.fn(async () => ({ status: "accepted" as const }));
    await expect(executeDeliveryProviderRefresh({
      plan,
      current: reserved,
      affectedDeliverableIds: affected,
      observeBefore: async () => ({ snapshot: before, targetMovement: "exact" }),
      refreshProvider,
      observeResult: async () => ({ snapshot: observed, targetMovement: "exact" }),
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      stateStore: { publish: vi.fn() },
    })).resolves.toEqual({ status: "refused", reason: "reservation-refused" });
    expect(refreshProvider).not.toHaveBeenCalled();
  });

  it("revalidates lifecycle paths before reserving and rewriting an explicit suffix head", async () => {
    const { plan, state } = movedFixture();
    const targetHead = state.target?.coordinates?.head;
    if (targetHead === undefined) throw new Error("fixture target must be bound");
    const member = state.members[1]!;
    const requested = {
      target: state.target,
      members: [{
        deliverableId: member.deliverableId,
        ref: member.ref,
        changeRequest: member.changeRequest,
        coordinates: { base: targetHead, head: "e".repeat(40), tree: "f".repeat(40) },
      }],
    };
    const writes: DeliveryStateV1[] = [];
    const rewriteRef = vi.fn(async () => ({ status: "rewritten" as const }));
    const result = await executeDeliverySuffixRewrite({
      plan,
      current: { revision: 7, value: state },
      deliverableId: member.deliverableId,
      requested,
      revalidateLifecycle: async () => ({ status: "ok" }),
      rewriteRef,
      observeResult: async () => requested,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      stateStore: { publish: async (_id, value, revision) => {
        writes.push(value);
        return { status: "ok", value: { revision: revision + 1, value } };
      } },
    });
    expect(result).toMatchObject({ status: "applied", state: { value: { activeOperation: null } } });
    expect(writes).toHaveLength(2);
    expect(rewriteRef).toHaveBeenCalledOnce();

    await expect(executeDeliverySuffixRewrite({
      plan,
      current: { revision: 7, value: state },
      deliverableId: member.deliverableId,
      requested,
      revalidateLifecycle: async () => ({ status: "ok" }),
      rewriteRef: async () => ({ status: "rewritten" }),
      observeResult: async () => requested,
      proveContribution: async () => ({
        status: "refused",
        reason: "contribution-conflicted",
        paths: ["shared.txt"],
      }),
      stateStore: { publish: async (_id, value, revision) => ({
        status: "ok", value: { revision: revision + 1, value },
      }) },
    })).resolves.toEqual({
      status: "refused",
      reason: "contribution-conflicted",
      paths: ["shared.txt"],
    });
  });

  it("stops an explicit rewrite before reservation or ref mutation when lifecycle contribution appears", async () => {
    const { plan, state } = movedFixture();
    const member = state.members[1]!;
    const publish = vi.fn();
    const rewriteRef = vi.fn();
    await expect(executeDeliverySuffixRewrite({
      plan,
      current: { revision: 7, value: state },
      deliverableId: member.deliverableId,
      requested: { target: state.target, members: [{ ...member }] },
      revalidateLifecycle: async () => ({ status: "refused" }),
      rewriteRef,
      observeResult: async () => { throw new Error("must not observe"); },
      proveContribution: async () => ({ status: "accepted", proof: "tree-equality" }),
      stateStore: { publish },
    })).resolves.toEqual({ status: "refused", reason: "lifecycle-contribution" });
    expect(publish).not.toHaveBeenCalled();
    expect(rewriteRef).not.toHaveBeenCalled();
  });

  it("refuses a foreign requested target before lifecycle checks, reservation, or ref mutation", async () => {
    const { plan, state } = movedFixture();
    const member = state.members[1]!;
    const revalidateLifecycle = vi.fn(async () => ({ status: "ok" as const }));
    const publish = vi.fn();
    const rewriteRef = vi.fn();
    await expect(executeDeliverySuffixRewrite({
      plan,
      current: { revision: 7, value: state },
      deliverableId: member.deliverableId,
      requested: {
        target: {
          ref: state.target!.ref,
          coordinates: { head: "9".repeat(40), tree: state.target!.coordinates!.tree },
        },
        members: [{ ...member }],
      },
      revalidateLifecycle,
      rewriteRef,
      observeResult: async () => { throw new Error("must not observe"); },
      proveContribution: async () => ({ status: "accepted", proof: "tree-equality" }),
      stateStore: { publish },
    })).resolves.toEqual({ status: "refused", reason: "position-mismatch" });
    expect(revalidateLifecycle).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(rewriteRef).not.toHaveBeenCalled();
  });

  it("admits an explicitly selected review fix without claiming contribution equivalence", async () => {
    const { plan, state } = movedFixture();
    const member = state.members[1]!;
    const requested = {
      target: state.target,
      members: [{
        ...member,
        coordinates: { base: state.target!.coordinates!.head, head: "e".repeat(40), tree: "f".repeat(40) },
      }],
    };
    const proveContribution = vi.fn(async () => ({
      status: "refused" as const, reason: "git-failure" as const,
    }));
    const result = await executeDeliverySuffixRewrite({
      plan, current: { revision: 7, value: state }, deliverableId: member.deliverableId, requested,
      contributionMode: "selected-change",
      revalidateLifecycle: async () => ({ status: "ok" }),
      rewriteRef: async () => ({ status: "rewritten" }), observeResult: async () => requested,
      proveContribution,
      stateStore: { publish: async (_id, value, revision) => ({
        status: "ok", value: { revision: revision + 1, value },
      }) },
    });
    expect(result.status).toBe("applied");
    expect(proveContribution).not.toHaveBeenCalled();
  });
});
