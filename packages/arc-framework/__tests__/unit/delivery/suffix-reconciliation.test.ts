import { describe, expect, it, vi } from "vitest";

import {
  adoptExternalDeliverySuffixRefresh,
  executeDeliverySuffixRewrite,
  settleReservedDeliverySuffixRefresh,
  type DeliveryProviderRefreshMovement,
} from "../../../src/lib/delivery/suffix-reconciliation.js";
import { reserveDeliveryOperation } from "../../../src/lib/delivery/operation.js";
import type { DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import {
  deliveryFourMemberStackPlanFixture,
  deliveryPlanFixture,
} from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

const exactTargetAncestry = async (
  ancestor: string,
  descendant: string,
): Promise<"ancestor" | "not-ancestor"> => ancestor === descendant ? "ancestor" : "not-ancestor";

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
  const targetHead = fixture.target?.coordinates?.head;
  if (targetHead === undefined) throw new Error("fixture target must be bound");
  const state = {
    ...fixture,
    members: fixture.members.map((member, index, members) => index === 0
      ? { ...member, ref: null, changeRequest: null, coordinates: null }
      : {
          ...member,
          changeRequest: { providerId: "github", changeRequestId: String(500 + index) },
          coordinates: member.coordinates === null ? null : {
            ...member.coordinates,
            base: index === 1 ? targetHead : members[index - 1]!.coordinates!.head,
          },
        }),
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
        base: index === 0 ? targetHead : String(index + 7).repeat(40),
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
    requested: fixture.observed,
  });
  if (reserved.status !== "reserved") throw new Error("provider refresh fixture must reserve");
  return { ...fixture, reserved: { revision: 8, value: reserved.state } };
}

describe("delivery suffix reconciliation", () => {
  it("reserves an observed refresh before settling the terminal top and one final state", async () => {
    const { plan, state, affected, before, observed } = providerRefreshFixture();
    const events: string[] = [];
    const localHeads = new Map(before.members.flatMap((member) => (
      member.ref === null || member.coordinates === null ? [] : [[member.ref, member.coordinates.head] as const]
    )));
    const absorbed = { head: "a".repeat(40), tree: "b".repeat(40) };
    const input = {
      plan,
      current: { revision: 7, value: state },
      affectedDeliverableIds: affected,
      observeResult: async () => {
        events.push(events.includes("reserve") ? "reobserve" : "observe");
        return {
          status: "observed" as const,
          observation: { snapshot: observed, targetMovement: "exact" as const },
        };
      },
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async ({ deliverableId }: DeliveryProviderRefreshMovement) => {
        events.push(`prove:${deliverableId}`);
        return { status: "accepted" as const, proof: "mechanical-reapply" as const };
      },
      absorbTop: async () => {
        events.push("absorb");
        return { status: "absorbed" as const, ...absorbed };
      },
      publishTop: async () => {
        events.push("publish");
        return { status: "published" as const };
      },
      rewriteLocalRef: async ({ ref, beforeHead, requestedHead }: {
        ref: string; beforeHead: string; requestedHead: string;
      }) => {
        const current = localHeads.get(ref);
        if (current === requestedHead) return { status: "adopted" as const };
        if (current !== beforeHead) return { status: "refused" as const };
        localHeads.set(ref, requestedHead);
        events.push(`local:${ref}`);
        return { status: "rewritten" as const };
      },
      stateStore: { publish: async (_planId: string, value: DeliveryStateV1, revision: number) => {
        events.push(value.activeOperation === null ? "final" : "reserve");
        return { status: "ok" as const, value: { revision: revision + 1, value } };
      } },
    };
    const result = await adoptExternalDeliverySuffixRefresh(input);

    expect(events).toEqual([
      "observe", ...affected.map((id) => `prove:${id}`), "reserve",
      "reobserve", ...affected.map((id) => `prove:${id}`),
      ...before.members.map((member) => `local:${member.ref}`), "absorb", "publish", "final",
    ]);
    expect(before.members.map((member) => member.ref === null ? null : localHeads.get(member.ref)))
      .toEqual(observed.members.map((member) => member.coordinates?.head));
    expect(result).toMatchObject({
      status: "applied",
      state: {
        revision: 9,
        value: {
          activeOperation: null,
          members: [
            {}, {}, {},
            { coordinates: { base: observed.members.at(-1)!.coordinates!.head, ...absorbed } },
          ],
        },
      },
    });
  });

  it("refuses dependent adoption when the provider also moved the selected member", async () => {
    const { plan, state, affected, observed } = providerRefreshFixture();
    const proveContribution = vi.fn();
    const publish = vi.fn();
    const result = await adoptExternalDeliverySuffixRefresh({
      plan,
      current: { revision: 7, value: state },
      affectedDeliverableIds: affected,
      selectedDeliverableId: affected[0]!,
      observeResult: async () => ({
        status: "observed",
        observation: { snapshot: observed, targetMovement: "exact" },
      }),
      readTargetAncestry: exactTargetAncestry,
      proveContribution,
      absorbTop: async () => { throw new Error("must not absorb"); },
      publishTop: async () => { throw new Error("must not publish"); },
      rewriteLocalRef: async () => { throw new Error("must not rewrite"); },
      stateStore: { publish },
    });

    expect(result).toEqual({ status: "refused", reason: "selected-member-moved" });
    expect(proveContribution).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("replays the exact reserved settlement after local merge or remote publication", async () => {
    const { plan, reserved, observed } = reservedProviderRefreshFixture();
    const absorbed = { head: "a".repeat(40), tree: "b".repeat(40) };
    for (const publication of ["published", "adopted"] as const) {
      const result = await settleReservedDeliverySuffixRefresh({
        plan,
        current: reserved,
        observeResult: async () => ({
          status: "observed",
          observation: { snapshot: observed, targetMovement: "exact" },
        }),
        readTargetAncestry: exactTargetAncestry,
        proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
        absorbTop: async () => ({ status: "absorbed", ...absorbed }),
        publishTop: async () => ({ status: publication }),
        rewriteLocalRef: async () => ({ status: "adopted" }),
        stateStore: { publish: async (_planId, value, revision) => ({
          status: "ok", value: { revision: revision + 1, value },
        }) },
      });
      expect(result).toMatchObject({
        status: "applied",
        state: {
          revision: 9,
          value: {
            activeOperation: null,
            members: [
              {}, {}, {},
              { coordinates: { base: observed.members.at(-1)!.coordinates!.head, ...absorbed } },
            ],
          },
        },
      });
    }
  });

  it("keeps a reserved settlement on changed observation or contribution refusal", async () => {
    const { plan, reserved, before, observed } = reservedProviderRefreshFixture();
    const finalStates: DeliveryStateV1[] = [];
    const topEffects: string[] = [];
    const dependencies = {
      readTargetAncestry: exactTargetAncestry,
      absorbTop: async () => {
        topEffects.push("absorb");
        return { status: "absorbed" as const, head: "a".repeat(40), tree: "b".repeat(40) };
      },
      publishTop: async () => {
        topEffects.push("publish");
        return { status: "published" as const };
      },
      rewriteLocalRef: async () => ({ status: "rewritten" as const }),
      stateStore: { publish: async (_planId: string, value: DeliveryStateV1) => {
        finalStates.push(value);
        return { status: "ok" as const, value: { revision: 9, value } };
      } },
    };
    await expect(settleReservedDeliverySuffixRefresh({
      plan,
      current: reserved,
      observeResult: async () => ({
        status: "observed",
        observation: { snapshot: before, targetMovement: "exact" },
      }),
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      ...dependencies,
    })).resolves.toEqual({ status: "blocked", reason: "ambiguous" });
    await expect(settleReservedDeliverySuffixRefresh({
      plan,
      current: reserved,
      observeResult: async () => ({
        status: "observed",
        observation: { snapshot: observed, targetMovement: "exact" },
      }),
      proveContribution: async () => ({
        status: "refused",
        reason: "contribution-diverged",
        paths: ["feature.txt"],
      }),
      ...dependencies,
    })).resolves.toEqual({
      status: "blocked",
      reason: "contribution-diverged",
      paths: ["feature.txt"],
    });
    expect(topEffects).toHaveLength(0);
    expect(finalStates).toHaveLength(0);
    expect(reserved.value.activeOperation).not.toBeNull();
  });

  it("keeps the reservation when top absorption, publication, or final state fails", async () => {
    const { plan, reserved, observed } = reservedProviderRefreshFixture();
    const common = {
      plan,
      current: reserved,
      observeResult: async () => ({
        status: "observed" as const,
        observation: { snapshot: observed, targetMovement: "exact" as const },
      }),
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async () => ({
        status: "accepted" as const, proof: "mechanical-reapply" as const,
      }),
      rewriteLocalRef: async () => ({ status: "rewritten" as const }),
    };
    await expect(settleReservedDeliverySuffixRefresh({
      ...common,
      absorbTop: async () => ({
        status: "refused", reason: "content-conflict", paths: ["top.txt"],
      }),
      publishTop: async () => { throw new Error("must not publish"); },
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
    })).resolves.toEqual({ status: "blocked", reason: "content-conflict", paths: ["top.txt"] });
    await expect(settleReservedDeliverySuffixRefresh({
      ...common,
      absorbTop: async () => ({ status: "absorbed", head: "a".repeat(40), tree: "b".repeat(40) }),
      publishTop: async () => ({ status: "refused", reason: "collision" }),
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
    })).resolves.toEqual({ status: "blocked", reason: "top-publish-collision" });
    await expect(settleReservedDeliverySuffixRefresh({
      ...common,
      absorbTop: async () => ({ status: "absorbed", head: "a".repeat(40), tree: "b".repeat(40) }),
      publishTop: async () => ({ status: "adopted" }),
      stateStore: { publish: async () => ({ status: "refused", reason: "version-conflict" }) },
    })).resolves.toEqual({ status: "blocked", reason: "state-conflict" });
    expect(reserved.value.activeOperation).not.toBeNull();
  });

  it("writes nothing before reservation when the observation, proof, or exact suffix refuses", async () => {
    const { plan, state, affected, observed } = providerRefreshFixture();
    const observedResult = vi.fn(async () => ({
      status: "observed" as const,
      observation: { snapshot: observed, targetMovement: "exact" as const },
    }));
    const topEffects = vi.fn();
    const stateWrites = vi.fn();
    const common = {
      plan,
      current: { revision: 7, value: state },
      observeResult: observedResult,
      readTargetAncestry: exactTargetAncestry,
      absorbTop: async () => {
        topEffects();
        return { status: "absorbed" as const, head: "a".repeat(40), tree: "b".repeat(40) };
      },
      publishTop: async () => {
        topEffects();
        return { status: "published" as const };
      },
      rewriteLocalRef: async () => { throw new Error("must not rewrite local refs"); },
      stateStore: { publish: stateWrites },
    };
    await expect(adoptExternalDeliverySuffixRefresh({
      ...common,
      affectedDeliverableIds: affected.slice(0, 1),
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
    })).resolves.toEqual({ status: "refused", reason: "position-mismatch" });
    await expect(adoptExternalDeliverySuffixRefresh({
      ...common,
      affectedDeliverableIds: affected,
      proveContribution: async () => ({
        status: "refused", reason: "contribution-diverged", paths: ["feature.txt"],
      }),
    })).resolves.toEqual({
      status: "refused", reason: "contribution-diverged", paths: ["feature.txt"],
    });
    expect(observedResult).toHaveBeenCalledOnce();
    expect(stateWrites).not.toHaveBeenCalled();
    expect(topEffects).not.toHaveBeenCalled();
  });

  it("adopts an observer-proven append-only target only with suffix and terminal coordinates", async () => {
    const { plan, state, affected, observed } = providerRefreshFixture();
    const advancedTarget = {
      ref: state.target!.ref,
      coordinates: { head: "d".repeat(40), tree: "e".repeat(40) },
    };
    const absorbed = { head: "a".repeat(40), tree: "b".repeat(40) };
    const result = await adoptExternalDeliverySuffixRefresh({
      plan,
      current: { revision: 7, value: state },
      affectedDeliverableIds: affected,
      observeResult: async () => ({
        status: "observed",
        observation: {
          snapshot: {
            ...observed,
            target: advancedTarget,
            members: observed.members.map((member, index) => ({
              ...member,
              coordinates: member.coordinates === null ? null : {
                ...member.coordinates,
                base: index === 0
                  ? advancedTarget.coordinates.head
                  : observed.members[index - 1]!.coordinates!.head,
              },
            })),
          },
          targetMovement: "append-only",
        },
      }),
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      absorbTop: async () => ({ status: "absorbed", ...absorbed }),
      publishTop: async () => ({ status: "published" }),
      rewriteLocalRef: async () => ({ status: "rewritten" }),
      stateStore: { publish: async (_planId, value, revision) => ({
        status: "ok", value: { revision: revision + 1, value },
      }) },
    });

    expect(result).toMatchObject({
      status: "applied",
      state: {
        revision: 9,
        value: {
          target: advancedTarget,
          activeOperation: null,
          members: [
            {}, {}, {},
            { coordinates: { base: observed.members.at(-1)!.coordinates!.head, ...absorbed } },
          ],
        },
      },
    });
  });

  it("settles external adoption across a second append-only target advance", async () => {
    const { plan, state, affected, observed } = providerRefreshFixture();
    const requestedTarget = {
      ref: state.target!.ref,
      coordinates: { head: "d".repeat(40), tree: "e".repeat(40) },
    };
    const liveTarget = {
      ref: requestedTarget.ref,
      coordinates: { head: "c".repeat(40), tree: "f".repeat(40) },
    };
    const snapshotAt = (target: typeof requestedTarget) => ({
      ...observed,
      target,
      members: observed.members.map((member, index) => ({
        ...member,
        coordinates: member.coordinates === null ? null : {
          ...member.coordinates,
          base: index === 0 ? target.coordinates.head : observed.members[index - 1]!.coordinates!.head,
        },
      })),
    });
    let observationCount = 0;

    const result = await adoptExternalDeliverySuffixRefresh({
      plan,
      current: { revision: 7, value: state },
      affectedDeliverableIds: affected,
      observeResult: async () => ({
        status: "observed",
        observation: {
          snapshot: snapshotAt(observationCount++ === 0 ? requestedTarget : liveTarget),
          targetMovement: "append-only",
        },
      }),
      readTargetAncestry: async (ancestor, descendant) => (
        ancestor === requestedTarget.coordinates.head && descendant === liveTarget.coordinates.head
          ? "ancestor"
          : "not-ancestor"
      ),
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      absorbTop: async () => ({ status: "absorbed", head: "a".repeat(40), tree: "b".repeat(40) }),
      publishTop: async () => ({ status: "published" }),
      rewriteLocalRef: async () => ({ status: "rewritten" }),
      stateStore: { publish: async (_planId, value, revision) => ({
        status: "ok", value: { revision: revision + 1, value },
      }) },
    });

    expect(result).toMatchObject({
      status: "applied",
      state: { value: { target: requestedTarget, activeOperation: null } },
    });
  });

  it("settles zero provider movement only when the terminal top still owes absorption", async () => {
    const { plan, state, affected, before } = providerRefreshFixture();
    const highest = before.members.at(-1)!;
    const staleTop = {
      ...state,
      members: state.members.map((member, index, members) => index === members.length - 1
        ? {
            ...member,
            coordinates: { ...member.coordinates!, base: "0".repeat(40) },
          }
        : member),
    };
    const absorbTop = vi.fn(async () => ({
      status: "absorbed" as const,
      head: "a".repeat(40),
      tree: "b".repeat(40),
    }));
    const result = await adoptExternalDeliverySuffixRefresh({
      plan,
      current: { revision: 7, value: staleTop },
      affectedDeliverableIds: affected,
      observeResult: async () => ({
        status: "observed",
        observation: { snapshot: before, targetMovement: "exact" },
      }),
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async () => { throw new Error("no provider movement to prove"); },
      absorbTop,
      publishTop: async () => ({ status: "published" }),
      rewriteLocalRef: async () => { throw new Error("no provider movement to rewrite"); },
      stateStore: { publish: async (_planId, value, revision) => ({
        status: "ok", value: { revision: revision + 1, value },
      }) },
    });
    expect(absorbTop).toHaveBeenCalledWith(expect.objectContaining({
      highestMember: { head: highest.coordinates!.head, tree: highest.coordinates!.tree },
    }));
    expect(result).toMatchObject({ status: "applied", state: { value: { activeOperation: null } } });

    const coherentTop = {
      ...state,
      members: state.members.map((member, index, members) => index === members.length - 1
        ? { ...member, coordinates: { ...member.coordinates!, base: highest.coordinates!.head } }
        : member),
    };
    await expect(adoptExternalDeliverySuffixRefresh({
      plan,
      current: { revision: 7, value: coherentTop },
      affectedDeliverableIds: affected,
      observeResult: async () => ({
        status: "observed",
        observation: { snapshot: before, targetMovement: "exact" },
      }),
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async () => { throw new Error("must not prove"); },
      absorbTop: async () => { throw new Error("must not absorb"); },
      publishTop: async () => { throw new Error("must not publish"); },
      rewriteLocalRef: async () => { throw new Error("must not rewrite"); },
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
    })).resolves.toEqual({ status: "refused", reason: "ambiguous-result" });
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
