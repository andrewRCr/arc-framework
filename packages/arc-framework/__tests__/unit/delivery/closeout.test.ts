import { describe, expect, it } from "vitest";

import {
  closeoutCompletedDelivery,
  type DeliveryCloseoutDependencies,
} from "../../../src/lib/delivery/closeout.js";
import { deriveDeliveryResidueLocators } from "../../../src/lib/delivery/residue-reaping.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import {
  deliveryThreeMemberStackPlanFixture,
  deliveryThreeMemberStackPlanForWorkUnitFixture,
} from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

function closeoutFixture(storedWorkUnitId?: string) {
  const plan = storedWorkUnitId === undefined
    ? deliveryThreeMemberStackPlanFixture()
    : deliveryThreeMemberStackPlanForWorkUnitFixture(storedWorkUnitId);
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
  const plans = new Map<string, DeliveryPlanV1>([[plan.planId, plan]]);
  let stateRecord: { revision: number; value: DeliveryStateV1 } | null = { revision: 7, value: state };
  const localMembers = new Set(state.members.slice(0, -1).map((member) => member.ref!));
  const remoteMembers = new Set(localMembers);
  const derived = deriveDeliveryResidueLocators(plan, "/repo/.git");
  if (derived.status !== "derived") throw new Error("fixture locators must derive");

  return {
    plan,
    state,
    plans,
    localMembers,
    remoteMembers,
    dependencies: {
      planStore: {
        enumerateCurrent: async () => ({ status: "ok" as const, value: [...plans.values()] }),
        removeCurrent: async (planId: string, expectedDigest: string) => {
          const current = plans.get(planId);
          if (current === undefined) return { status: "ok" as const, value: { removed: false } };
          if (current.planDigest !== expectedDigest) {
            return { status: "refused" as const, reason: "version-conflict" as const };
          }
          plans.delete(planId);
          return { status: "ok" as const, value: { removed: true } };
        },
      },
      stateStore: {
        read: async () => ({ status: "ok" as const, value: stateRecord }),
        publish: async (_planId: string, value: DeliveryStateV1, revision: number) => {
          if (stateRecord === null || stateRecord.revision !== revision) {
            return { status: "refused" as const, reason: "version-conflict" as const };
          }
          stateRecord = { revision: revision + 1, value };
          return { status: "ok" as const, value: stateRecord };
        },
        remove: async (_planId: string, revision: number) => {
          if (stateRecord === null) return { status: "ok" as const, value: { removed: false } };
          if (stateRecord.revision !== revision) {
            return { status: "refused" as const, reason: "version-conflict" as const };
          }
          stateRecord = null;
          return { status: "ok" as const, value: { removed: true } };
        },
      },
      gitCommonDir: "/repo/.git",
      renameAuthority: { status: "established" as const, ref: "refs/heads/main" },
      renameTransitionSource: { enumerate: async () => ({ status: "ok" as const, value: [] }) },
      residue: {
        observeRefreshCandidates: async () => ({ status: "observed" as const, candidates: [] }),
        observeCandidate: async () => ({ status: "absent" as const }),
        observeGate: async () => ({ status: "absent" as const }),
        deleteCandidate: async () => { throw new Error("absent candidates must not be deleted"); },
        deleteRefreshCandidate: async () => { throw new Error("absent refresh candidates must not be deleted"); },
        removeGate: async () => { throw new Error("absent gates must not be removed"); },
        deleteLocalMember: async ({ ref }: { ref: string }) => {
          localMembers.delete(ref);
          return { status: "deleted" as const };
        },
        deleteRemoteMember: async ({ ref }: { ref: string }) => {
          remoteMembers.delete(ref);
          return { status: "deleted" as const };
        },
      },
      retirement: {
        observeLocalRef: async (ref: string) => localMembers.has(ref)
          ? { status: "observed" as const, head: state.members.find((member) => member.ref === ref)!.coordinates!.head }
          : { status: "absent" as const },
        observeRemoteRef: async (ref: string) => remoteMembers.has(ref)
          ? { status: "observed" as const, head: state.members.find((member) => member.ref === ref)!.coordinates!.head }
          : { status: "absent" as const },
        // The fixtures bind one exact head, so identity is the only relation they model; a distinct
        // pair is one this fixture establishes nothing about.
        readAncestry: async (ancestor: string, descendant: string) =>
          ancestor === descendant ? "ancestor" as const : "not-ancestor" as const,
        readTerminalRequest: async () => ({
          status: "observed" as const,
          request: {
            binding: state.members.at(-1)!.changeRequest!,
            repository: "owner/repo",
            headRepository: "owner/repo",
            headRef: "feat/delivery-plan-record",
            headSha: state.members.at(-1)!.coordinates!.head,
            baseRef: "delivery-target",
            state: "merged" as const,
            draft: false,
          },
        }),
      },
    },
    currentState: () => stateRecord,
  };
}

describe("delivery closeout", () => {
  it("verifies the exact terminal request before reaping residue", async () => {
    const fixture = closeoutFixture();
    const dependencies = {
      ...fixture.dependencies,
      retirement: {
        ...fixture.dependencies.retirement,
        readTerminalRequest: async () => ({
          status: "observed" as const,
          request: {
            binding: fixture.state.members.at(-1)!.changeRequest!,
            repository: "owner/repo",
            headRepository: "owner/repo",
            headRef: "feat/delivery-plan-record",
            headSha: fixture.state.members.at(-1)!.coordinates!.head,
            baseRef: "delivery-target",
            state: "open" as const,
            draft: false,
          },
        }),
      },
    };

    await expect(closeoutCompletedDelivery({
      workUnitId: fixture.plan.workUnitId,
      repository: "owner/repo",
      remote: "origin",
    }, dependencies)).resolves.toMatchObject({
      status: "blocked",
      reason: "terminal-not-merged",
    });
    expect({
      plans: fixture.plans.size,
      state: fixture.currentState(),
      localMembers: [...fixture.localMembers],
      remoteMembers: [...fixture.remoteMembers],
    }).toEqual({
      plans: 1,
      state: { revision: 7, value: fixture.state },
      localMembers: fixture.state.members.slice(0, -1).map((member) => member.ref),
      remoteMembers: fixture.state.members.slice(0, -1).map((member) => member.ref),
    });
  });

  it("names the act that clears a terminal condition instead of directing a blind rerun", async () => {
    const moved = closeoutFixture();
    const retargeted = closeoutFixture();
    const request = (overrides: Record<string, unknown>) => async () => ({
      status: "observed" as const,
      request: {
        binding: moved.state.members.at(-1)!.changeRequest!,
        repository: "owner/repo",
        headRepository: "owner/repo",
        headRef: "feat/delivery-plan-record",
        headSha: moved.state.members.at(-1)!.coordinates!.head,
        baseRef: "delivery-target",
        state: "merged" as const,
        draft: false,
        ...overrides,
      },
    });

    const headMoved = await closeoutCompletedDelivery(
      { workUnitId: moved.plan.workUnitId, repository: "owner/repo", remote: "origin" },
      {
        ...moved.dependencies,
        retirement: { ...moved.dependencies.retirement, readTerminalRequest: request({ headSha: "a".repeat(40) }) },
      },
    );
    const baseWrong = await closeoutCompletedDelivery(
      { workUnitId: retargeted.plan.workUnitId, repository: "owner/repo", remote: "origin" },
      {
        ...retargeted.dependencies,
        retirement: {
          ...retargeted.dependencies.retirement,
          readTerminalRequest: request({ baseRef: "some-other-target" }),
        },
      },
    );

    expect(headMoved).toMatchObject({
      status: "blocked",
      reason: "terminal-head-moved",
      remedy: { kind: "delivery-member-rebind-required", automatedCommand: null },
    });
    // The pair D13 names reaches the caller as two acts, not one sentence sending both at the same rerun.
    expect(baseWrong).toMatchObject({
      status: "blocked",
      reason: "terminal-base-ref-mismatch",
      remedy: { kind: "delivery-request-retarget-required", automatedCommand: null },
    });
    for (const result of [headMoved, baseWrong]) {
      if (result.status !== "blocked") throw new Error("both arrangements must block");
      expect(result.recommendedActionText).not.toContain("with the same work-unit, repository, and remote");
    }
  });

  it("resolves the same act whether the condition arrives bare or under retirement's prefix", async () => {
    const fixture = closeoutFixture();
    let observations = 0;
    const raced = await closeoutCompletedDelivery(
      { workUnitId: fixture.plan.workUnitId, repository: "owner/repo", remote: "origin" },
      {
        ...fixture.dependencies,
        retirement: {
          ...fixture.dependencies.retirement,
          // The host's answer changes between closeout's own verification and the one retirement re-runs,
          // which is the only way the prefixed spelling is reached at all.
          readTerminalRequest: async () => {
            observations += 1;
            return {
              status: "observed" as const,
              request: {
                binding: fixture.state.members.at(-1)!.changeRequest!,
                repository: "owner/repo",
                headRepository: "owner/repo",
                headRef: "feat/delivery-plan-record",
                headSha: fixture.state.members.at(-1)!.coordinates!.head,
                baseRef: "delivery-target",
                state: observations === 1 ? ("merged" as const) : ("open" as const),
                draft: false,
              },
            };
          },
        },
      },
    );

    expect(raced).toMatchObject({
      status: "blocked",
      reason: "retire-terminal-not-merged",
      remedy: { kind: "delivery-terminal-landing-required", automatedCommand: null },
    });
  });

  it("offers no act for a reason retirement raised on its own behalf", async () => {
    const fixture = closeoutFixture();

    const result = await closeoutCompletedDelivery(
      { workUnitId: fixture.plan.workUnitId, repository: "owner/repo", remote: "origin" },
      {
        ...fixture.dependencies,
        retirement: {
          ...fixture.dependencies.retirement,
          observeLocalRef: async () => ({ status: "refused" as const }),
        },
      },
    );

    // Both spellings share the `retire-` prefix, so stripping it is not on its own a licence to answer.
    expect(result).toEqual({
      status: "blocked",
      reason: "retire-member-ref-observation-refused",
      planId: fixture.plan.planId,
      deliverableId: fixture.state.members[0]!.deliverableId,
      recommendedActionText: expect.stringContaining("with the same work-unit, repository, and remote"),
    });
  });

  it("leaves the terminal prefix to the terminal conditions alone", async () => {
    const blockedReason = async (
      workUnitId: string,
      dependencies: DeliveryCloseoutDependencies,
    ): Promise<string> => {
      const result = await closeoutCompletedDelivery(
        { workUnitId, repository: "owner/repo", remote: "origin" },
        dependencies,
      );
      if (result.status !== "blocked") throw new Error(`expected a blocked closeout, got ${result.status}`);
      return result.reason;
    };
    const identity = closeoutFixture();
    const planRefused = closeoutFixture();
    const stateRefused = closeoutFixture();
    const retireRefused = closeoutFixture();
    const terminal = closeoutFixture();

    const own = [
      await blockedReason("Not A Slug", identity.dependencies),
      await blockedReason(planRefused.plan.workUnitId, {
        ...planRefused.dependencies,
        planStore: {
          ...planRefused.dependencies.planStore,
          enumerateCurrent: async () => ({ status: "refused" as const, reason: "namespace-corrupt" as const }),
        },
      }),
      await blockedReason(stateRefused.plan.workUnitId, {
        ...stateRefused.dependencies,
        stateStore: {
          ...stateRefused.dependencies.stateStore,
          read: async () => ({ status: "refused" as const, reason: "record-malformed" as const }),
        },
      }),
      await blockedReason(retireRefused.plan.workUnitId, {
        ...retireRefused.dependencies,
        retirement: {
          ...retireRefused.dependencies.retirement,
          observeLocalRef: async () => ({ status: "refused" as const }),
        },
      }),
    ];

    // Closeout prefixes the reasons it raises itself and passes a terminal reason through bare, so the
    // prefix is the whole of what tells a caller which of the two readers spoke.
    expect(own.filter((reason) => reason.startsWith("terminal-"))).toEqual([]);
    expect(await blockedReason(terminal.plan.workUnitId, {
      ...terminal.dependencies,
      retirement: {
        ...terminal.dependencies.retirement,
        readTerminalRequest: async () => ({ status: "absent" as const }),
      },
    })).toBe("terminal-request-unobserved");
  });

  it("reaps exact residue before retiring the state and plan", async () => {
    const fixture = closeoutFixture();
    await expect(closeoutCompletedDelivery({
      workUnitId: fixture.plan.workUnitId,
      repository: "owner/repo",
      remote: "origin",
    }, fixture.dependencies)).resolves.toMatchObject({
      status: "closed-out",
      workUnitId: fixture.plan.workUnitId,
      planIds: [fixture.plan.planId],
    });
    expect({
      plans: fixture.plans.size,
      state: fixture.currentState(),
      localMembers: [...fixture.localMembers],
      remoteMembers: [...fixture.remoteMembers],
    }).toEqual({ plans: 0, state: null, localMembers: [], remoteMembers: [] });
  });

  it("closes a bound plan through authenticated rename history", async () => {
    const fixture = closeoutFixture("original-delivery-unit");
    const dependencies = {
      ...fixture.dependencies,
      renameTransitionSource: { enumerate: async () => ({
        status: "ok" as const,
        value: [{
          subject: "original-delivery-unit",
          outcome: { kind: "rename" as const, targetSlug: "renamed-delivery-unit" },
        }],
      }) },
    };
    await expect(closeoutCompletedDelivery({
      workUnitId: "renamed-delivery-unit",
      repository: "owner/repo",
      remote: "origin",
    }, dependencies)).resolves.toMatchObject({
      status: "closed-out",
      workUnitId: "renamed-delivery-unit",
      planIds: [fixture.plan.planId],
    });
    expect({ plans: fixture.plans.size, state: fixture.currentState() }).toEqual({ plans: 0, state: null });
  });

  it("does not mutate when rename authority is indeterminate", async () => {
    const fixture = closeoutFixture("original-delivery-unit");
    const dependencies = {
      ...fixture.dependencies,
      renameTransitionSource: { enumerate: async () => ({
        status: "refused" as const,
        reason: "substrate-unreachable" as const,
      }) },
    };
    await expect(closeoutCompletedDelivery({
      workUnitId: "renamed-delivery-unit",
      repository: "owner/repo",
      remote: "origin",
    }, dependencies)).resolves.toMatchObject({
      status: "blocked",
      reason: "plan-substrate-unreachable",
    });
    expect({ plans: fixture.plans.size, state: fixture.currentState() }).toEqual({
      plans: 1,
      state: { revision: 7, value: fixture.state },
    });
  });
});
