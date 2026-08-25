import { describe, expect, it, vi } from "vitest";

import {
  executeDeliverySuffixRewrite,
  reconcileReservedSuffixRetarget,
  reserveObservedSuffixRetarget,
} from "../../../src/lib/delivery/suffix-reconciliation.js";
import type { DeliveryPositionFactsV1 } from "../../../src/lib/delivery/position.js";
import type { DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import { deliveryPlanFixture } from "../../fixtures/delivery-plan.js";
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
  const moved = {
    ...second,
    coordinates: { base: targetHead, head: "e".repeat(40), tree: "f".repeat(40) },
  };
  const facts: DeliveryPositionFactsV1 = {
    target: bound.target,
    members: [first, moved].map((member) => ({
      deliverableId: member.deliverableId,
      ref: member.ref,
      changeRequest: member.changeRequest,
      coordinates: member.coordinates,
    })),
    landedDeliverableIds: [first.deliverableId],
  };
  return { plan, state: bound, moved, facts };
}

describe("delivery suffix reconciliation", () => {
  it("post-reserves one uniquely observed equivalent retarget and preserves its request handle", async () => {
    const { plan, state, moved, facts } = movedFixture();
    const result = await reserveObservedSuffixRetarget({
      plan,
      current: { revision: 7, value: state },
      facts,
      repository: "andrewRCr/arc-framework",
      protectedTargetRef: "refs/heads/main",
      host: { readRequest: async () => ({
        status: "observed",
        request: {
          binding: moved.changeRequest!, repository: "andrewRCr/arc-framework",
          headRepository: "andrewRCr/arc-framework", headRef: moved.ref!.replace("refs/heads/", ""),
          headSha: moved.coordinates!.head, baseRef: "main", state: "open", draft: true,
        },
      }) },
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      stateStore: { publish: async (_planId, value) => {
        return { status: "ok", value: { revision: 8, value } };
      } },
    });
    if (result.status !== "reserved") throw new Error("fixture must reserve");
    expect(result.state.value.activeOperation?.kind).toBe("rewrite");
    expect(result.state.value.activeOperation?.requested.members[0]?.changeRequest).toEqual(moved.changeRequest);
  });

  it("refuses request/base disagreement or failed contribution proof before persistence", async () => {
    const { plan, state, moved, facts } = movedFixture();
    const publish = vi.fn();
    const common = {
      plan,
      current: { revision: 7, value: state },
      facts,
      repository: "andrewRCr/arc-framework",
      protectedTargetRef: "refs/heads/main",
      stateStore: { publish },
    };
    await expect(reserveObservedSuffixRetarget({
      ...common,
      host: { readRequest: async () => ({
        status: "observed" as const,
        request: {
          binding: moved.changeRequest!, repository: "andrewRCr/arc-framework",
          headRepository: "andrewRCr/arc-framework", headRef: moved.ref!.replace("refs/heads/", ""),
          headSha: moved.coordinates!.head, baseRef: "wrong", state: "open" as const, draft: true,
        },
      }) },
      proveContribution: async () => ({ status: "accepted" as const, proof: "tree-equality" as const }),
    })).resolves.toEqual({ status: "refused", reason: "request-mismatch" });
    await expect(reserveObservedSuffixRetarget({
      ...common,
      host: { readRequest: async () => ({
        status: "observed" as const,
        request: {
          binding: moved.changeRequest!, repository: "andrewRCr/arc-framework",
          headRepository: "andrewRCr/arc-framework", headRef: moved.ref!.replace("refs/heads/", ""),
          headSha: moved.coordinates!.head, baseRef: "main", state: "open" as const, draft: true,
        },
      }) },
      proveContribution: async () => ({
        status: "refused" as const,
        reason: "contribution-conflicted" as const,
        paths: ["shared.txt"],
      }),
    })).resolves.toEqual({
      status: "refused",
      reason: "contribution-conflicted",
      paths: ["shared.txt"],
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it("adopts one exact reobservation with CAS and leaves a reservation on conflict or ambiguity", async () => {
    const { plan, state, moved, facts } = movedFixture();
    const reservation = await reserveObservedSuffixRetarget({
      plan, current: { revision: 7, value: state }, facts,
      repository: "andrewRCr/arc-framework", protectedTargetRef: "refs/heads/main",
      host: { readRequest: async () => ({ status: "observed", request: {
        binding: moved.changeRequest!, repository: "andrewRCr/arc-framework",
        headRepository: "andrewRCr/arc-framework", headRef: moved.ref!.replace("refs/heads/", ""),
        headSha: moved.coordinates!.head, baseRef: "main", state: "open", draft: false,
      } }) },
      proveContribution: async () => ({ status: "accepted", proof: "tree-equality" }),
      stateStore: { publish: async (_id, value) => {
        return { status: "ok", value: { revision: 8, value } };
      } },
    });
    if (reservation.status !== "reserved") throw new Error("fixture must reserve");
    const reserved = reservation.state;
    const observed = reserved.value.activeOperation!.requested;
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
      observed,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      stateStore: { publish: async (_id, value) => ({ status: "ok", value: { revision: 9, value } }) },
    })).resolves.toEqual({ status: "blocked", reason: "ambiguous" });
    const applied = await reconcileReservedSuffixRetarget({
      planId: plan.planId,
      current: reserved,
      observed,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      stateStore: { publish: async (_id, value) => ({ status: "ok", value: { revision: 9, value } }) },
    });
    expect(applied).toMatchObject({ status: "applied", state: { value: { activeOperation: null } } });
    await expect(reconcileReservedSuffixRetarget({
      planId: plan.planId,
      current: reserved,
      observed,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      stateStore: { publish: async () => ({ status: "refused", reason: "version-conflict" }) },
    })).resolves.toEqual({ status: "blocked", reason: "state-conflict" });
    await expect(reconcileReservedSuffixRetarget({
      planId: plan.planId,
      current: reserved,
      observed,
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
    expect(reserved.value.activeOperation).not.toBeNull();

    const proveRetry = vi.fn(async () => ({
      status: "refused" as const, reason: "git-failure" as const,
    }));
    await expect(reconcileReservedSuffixRetarget({
      planId: plan.planId,
      current: reserved,
      observed: reserved.value.activeOperation!.before,
      proveContribution: proveRetry,
      stateStore: { publish: vi.fn() },
    })).resolves.toEqual({ status: "retryable" });
    expect(proveRetry).not.toHaveBeenCalled();
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
