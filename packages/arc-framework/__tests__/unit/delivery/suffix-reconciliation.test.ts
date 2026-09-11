import { describe, expect, it, vi } from "vitest";

import {
  adoptExternalDeliverySuffixRefresh as adoptExternalDeliverySuffixRefreshCore,
  executeDeliverySuffixRewrite,
  findExactPendingSelectedRefresh,
  settleReservedDeliverySuffixRefresh,
  type DeliveryProviderRefreshMovement,
} from "../../../src/lib/delivery/suffix-reconciliation.js";
import { reserveDeliveryOperation } from "../../../src/lib/delivery/operation.js";
import type { DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import {
  deliveryFourMemberStackPlanFixture,
  deliveryPlanFixture,
  deliveryStackPlanWithMemberTitlesFixture,
} from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

const exactTargetAncestry = async (
  ancestor: string,
  descendant: string,
): Promise<"ancestor" | "not-ancestor"> => ancestor === descendant ? "ancestor" : "not-ancestor";

type ExternalAdoptionInput = Parameters<typeof adoptExternalDeliverySuffixRefreshCore>[0];

function adoptExternalDeliverySuffixRefresh(
  input: Omit<ExternalAdoptionInput, "preflightTop"> & {
    readonly preflightTop?: ExternalAdoptionInput["preflightTop"];
  },
) {
  return adoptExternalDeliverySuffixRefreshCore({
    ...input,
    preflightTop: input.preflightTop ?? (async () => ({ status: "ready" as const })),
  });
}

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

function providerRefreshFixture(
  plan = deliveryFourMemberStackPlanFixture(),
  pendingSelectedRefresh = false,
) {
  const fixture = deliveryStateFixture(plan);
  const targetHead = fixture.target?.coordinates?.head;
  if (targetHead === undefined) throw new Error("fixture target must be bound");
  const chainState = {
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
  const state = pendingSelectedRefresh
    ? {
        ...chainState,
        members: chainState.members.map((member, index) => index === 1 && member.coordinates !== null
          ? {
              ...member,
              coordinates: { ...member.coordinates, head: "f".repeat(40) },
            }
          : member),
      }
    : chainState;
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
        base: index === 0 ? targetHead : (index + 7).toString(16).repeat(40),
        head: (index + 8).toString(16).repeat(40),
        tree: (index + 6).toString(16).repeat(40),
      },
    })),
  };
  return { plan, state, affected, before, observed };
}

function dependentConflictFixture() {
  const fixture = providerRefreshFixture(deliveryStackPlanWithMemberTitlesFixture([
    "Landed", "Selected", "First dependent", "Second dependent", "Terminal",
  ]), true);
  const { affected, before, observed: refreshed } = fixture;
  const selectedDeliverableId = affected[0]!;
  const observed = {
    ...refreshed,
    members: refreshed.members.map((member, index) => index === 0
      ? before.members[0]!
      : {
          ...member,
          coordinates: member.coordinates === null ? null : {
            ...member.coordinates,
            base: index === 1
              ? before.members[0]!.coordinates!.head
              : refreshed.members[index - 1]!.coordinates!.head,
          },
        }),
  };
  const conflicts = affected.slice(1).map((deliverableId) => ({
    deliverableId,
    paths: [`${deliverableId}.txt`],
  }));
  return { ...fixture, observed, selectedDeliverableId, conflicts };
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
  it("selects the earliest pending refresh when later publication creates a second chain break", () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const targetHead = fixture.target?.coordinates?.head;
    if (targetHead === undefined) throw new Error("fixture target must be bound");
    const current = {
      ...fixture,
      members: fixture.members.map((member, index, members) => {
        if (member.coordinates === null) throw new Error("fixture member must be bound");
        const base = index === 0 ? targetHead : members[index - 1]!.coordinates!.head;
        return { ...member, coordinates: { ...member.coordinates, base } };
      }),
    };
    const broken = {
      ...current,
      members: current.members.map((member, index) => index === 0 || index === 2
        ? { ...member, coordinates: { ...member.coordinates, head: String(index + 8).repeat(40) } }
        : member),
    };

    expect(findExactPendingSelectedRefresh(broken)).toBe(plan.members[0]!.deliverableId);
  });

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
          pendingReviewFixVerification: null,
          members: [
            {}, {}, {},
            { coordinates: { base: observed.members.at(-1)!.coordinates!.head, ...absorbed } },
          ],
        },
      },
    });
    expect(result).not.toHaveProperty("nextAction");
  });

  it("refuses dependent adoption when the provider also moved the selected member", async () => {
    const { plan, state, affected, observed } = providerRefreshFixture(
      deliveryFourMemberStackPlanFixture(),
      true,
    );
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

  it("refuses dependent adoption when the selected member has not published a correction", async () => {
    const { plan, state, affected } = providerRefreshFixture();
    const result = await adoptExternalDeliverySuffixRefresh({
      plan,
      current: { revision: 7, value: state },
      affectedDeliverableIds: affected,
      selectedDeliverableId: affected[0]!,
      observeResult: async () => { throw new Error("must not observe"); },
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async () => { throw new Error("must not prove"); },
      absorbTop: async () => { throw new Error("must not absorb"); },
      publishTop: async () => { throw new Error("must not publish"); },
      rewriteLocalRef: async () => { throw new Error("must not rewrite"); },
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
    });

    expect(result).toEqual({ status: "refused", reason: "selected-member-invalid" });
  });

  it("refuses ordinary adoption while a selected correction awaits dependent refresh", async () => {
    const { plan, state, affected } = providerRefreshFixture(
      deliveryFourMemberStackPlanFixture(),
      true,
    );
    const result = await adoptExternalDeliverySuffixRefresh({
      plan,
      current: { revision: 7, value: state },
      affectedDeliverableIds: affected,
      observeResult: async () => { throw new Error("must not observe"); },
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async () => { throw new Error("must not prove"); },
      absorbTop: async () => { throw new Error("must not absorb"); },
      publishTop: async () => { throw new Error("must not publish"); },
      rewriteLocalRef: async () => { throw new Error("must not rewrite"); },
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
    });

    expect(result).toEqual({ status: "refused", reason: "selected-member-invalid" });
  });

  it("carries dependent review-fix selection into the final adoption settlement", async () => {
    const { plan, state, affected, before, observed: refreshed } = providerRefreshFixture(
      deliveryFourMemberStackPlanFixture(),
      true,
    );
    const selectedDeliverableId = affected[0]!;
    const advancedTarget = {
      ref: state.target!.ref,
      coordinates: { head: "d".repeat(40), tree: "e".repeat(40) },
    };
    const observed = {
      ...refreshed,
      target: advancedTarget,
      members: refreshed.members.map((member, index) => index === 0
        ? {
            ...before.members[0]!,
            coordinates: {
              ...before.members[0]!.coordinates!,
              base: advancedTarget.coordinates.head,
            },
          }
        : {
            ...member,
            coordinates: member.coordinates === null ? null : {
              ...member.coordinates,
              base: before.members[0]!.coordinates!.head,
            },
          }),
    };
    const proved: string[] = [];

    const result = await adoptExternalDeliverySuffixRefresh({
      plan,
      current: { revision: 7, value: state },
      affectedDeliverableIds: affected,
      selectedDeliverableId,
      observeResult: async () => ({
        status: "observed",
        observation: { snapshot: observed, targetMovement: "append-only" },
      }),
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async ({ deliverableId }) => {
        proved.push(deliverableId);
        return deliverableId === selectedDeliverableId
          ? { status: "refused", reason: "contribution-diverged", paths: ["base-only-prefix"] }
          : { status: "accepted", proof: "mechanical-reapply" };
      },
      absorbTop: async () => ({ status: "absorbed", head: "a".repeat(40), tree: "b".repeat(40) }),
      publishTop: async () => ({ status: "published" }),
      rewriteLocalRef: async () => ({ status: "rewritten" }),
      stateStore: { publish: async (_planId, value, revision) => ({
        status: "ok", value: { revision: revision + 1, value },
      }) },
    });

    expect(result).toMatchObject({
      status: "applied",
      selectedDeliverableId,
      nextAction: "verify-review-fix",
      verification: { memberDeliverableIds: [selectedDeliverableId], tier1Required: true },
      acknowledgementInput: {
        planId: plan.planId,
        selectedDeliverableId,
        expectedStateRevision: 9,
        continuationDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      },
      state: {
        revision: 9,
        value: {
          target: advancedTarget,
          activeOperation: null,
          pendingReviewFixVerification: {
            selectedDeliverableId,
            memberDeliverableIds: [selectedDeliverableId],
          },
        },
      },
    });
    const dependentIds = affected.slice(1);
    expect(proved).toEqual([...dependentIds, ...dependentIds]);
  });

  it("offers one mutation-free consent input for the complete conflicted dependent set", async () => {
    const { plan, state, affected, before, observed, selectedDeliverableId } = dependentConflictFixture();
    const conflictedDeliverableId = affected.at(-1)!;
    const conflicts = [{ deliverableId: conflictedDeliverableId, paths: [`${conflictedDeliverableId}.txt`] }];
    const publish = vi.fn();
    const rewriteLocalRef = vi.fn();

    const result = await adoptExternalDeliverySuffixRefresh({
      plan,
      current: { revision: 7, value: state },
      affectedDeliverableIds: affected,
      selectedDeliverableId,
      observeResult: async () => ({
        status: "observed",
        observation: { snapshot: observed, targetMovement: "exact" },
      }),
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async ({ deliverableId }) => deliverableId === conflictedDeliverableId
        ? {
            status: "refused",
            reason: "contribution-conflicted",
            paths: [`${deliverableId}.txt`],
          }
        : { status: "accepted", proof: "mechanical-reapply" },
      absorbTop: async () => { throw new Error("must not absorb"); },
      publishTop: async () => { throw new Error("must not publish"); },
      rewriteLocalRef,
      stateStore: { publish },
    });

    expect(result).toEqual({
      status: "conflict-resolution-required",
      conflicts,
      resolutionInput: {
        planId: plan.planId,
        scope: { kind: "dependent-suffix", selectedDeliverableId },
        expectedStateRevision: 7,
        observedSuffixDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        conflicts,
      },
      externalRefRestorations: affected.slice(1).map((deliverableId, index) => ({
        ref: before.members[index + 1]!.ref,
        observedHead: observed.members[index + 1]!.coordinates!.head,
        restoreHead: before.members[index + 1]!.coordinates!.head,
      })),
      recommendedActionText: expect.stringContaining("explicit approval"),
    });
    expect(publish).not.toHaveBeenCalled();
    expect(rewriteLocalRef).not.toHaveBeenCalled();
  });

  it("refuses pathless conflict evidence before offering consent or mutating", async () => {
    const { plan, state, affected, observed, selectedDeliverableId } = dependentConflictFixture();
    const publish = vi.fn();
    const rewriteLocalRef = vi.fn();

    const result = await adoptExternalDeliverySuffixRefresh({
      plan,
      current: { revision: 7, value: state },
      affectedDeliverableIds: affected,
      selectedDeliverableId,
      observeResult: async () => ({
        status: "observed",
        observation: { snapshot: observed, targetMovement: "exact" },
      }),
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async () => ({
        status: "refused",
        reason: "contribution-conflicted",
        paths: [],
      }),
      absorbTop: async () => { throw new Error("must not absorb"); },
      publishTop: async () => { throw new Error("must not publish"); },
      rewriteLocalRef,
      stateStore: { publish },
    });

    expect(result).toEqual({ status: "refused", reason: "git-failure" });
    expect(publish).not.toHaveBeenCalled();
    expect(rewriteLocalRef).not.toHaveBeenCalled();
  });

  it("accepts only the unchanged freshly reproved conflict-resolution input", async () => {
    const { plan, state, affected, observed, selectedDeliverableId } = dependentConflictFixture();
    const publishState = async (_planId: string, value: DeliveryStateV1, revision: number) => ({
      status: "ok" as const,
      value: { revision: revision + 1, value },
    });
    const common = {
      plan,
      current: { revision: 7, value: state },
      affectedDeliverableIds: affected,
      selectedDeliverableId,
      observeResult: async () => ({
        status: "observed" as const,
        observation: { snapshot: observed, targetMovement: "exact" as const },
      }),
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async ({ deliverableId }: DeliveryProviderRefreshMovement) => ({
        status: "refused" as const,
        reason: "contribution-conflicted" as const,
        paths: [`${deliverableId}.txt`],
      }),
      absorbTop: async () => ({ status: "absorbed" as const, head: "c".repeat(40), tree: "d".repeat(40) }),
      publishTop: async () => ({ status: "published" as const }),
      rewriteLocalRef: async () => ({ status: "rewritten" as const }),
      stateStore: { publish: publishState },
    };
    const offered = await adoptExternalDeliverySuffixRefresh(common);
    if (offered.status !== "conflict-resolution-required") {
      throw new Error("fixture must require conflict resolution");
    }

    const applied = await adoptExternalDeliverySuffixRefresh({
      ...common,
      conflictResolution: offered.resolutionInput,
    });
    const memberDeliverableIds = [
      selectedDeliverableId,
      ...offered.resolutionInput.conflicts.map(({ deliverableId }) => deliverableId),
    ];
    expect(applied).toMatchObject({
      status: "applied",
      verification: { memberDeliverableIds, tier1Required: true },
      acknowledgementInput: { memberDeliverableIds },
      state: {
        value: {
          pendingReviewFixVerification: { selectedDeliverableId, memberDeliverableIds },
        },
      },
    });

    await expect(adoptExternalDeliverySuffixRefresh({
      ...common,
      conflictResolution: {
        ...offered.resolutionInput,
        conflicts: offered.resolutionInput.conflicts.slice(1),
      },
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
    })).resolves.toEqual({ status: "refused", reason: "conflict-resolution-mismatch" });

    await expect(adoptExternalDeliverySuffixRefresh({
      ...common,
      current: { revision: 8, value: state },
      conflictResolution: offered.resolutionInput,
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
    })).resolves.toEqual({ status: "refused", reason: "conflict-resolution-mismatch" });

    await expect(adoptExternalDeliverySuffixRefresh({
      ...common,
      conflictResolution: {
        ...offered.resolutionInput,
        scope: { kind: "dependent-suffix", selectedDeliverableId: affected[1]! },
      },
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
    })).resolves.toEqual({ status: "refused", reason: "conflict-resolution-mismatch" });

    await expect(adoptExternalDeliverySuffixRefresh({
      ...common,
      conflictResolution: offered.resolutionInput,
      proveContribution: async () => ({
        status: "refused",
        reason: "contribution-diverged",
        paths: ["diverged.txt"],
      }),
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
    })).resolves.toEqual({
      status: "refused",
      reason: "contribution-diverged",
      paths: ["diverged.txt"],
    });
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

  it("refuses schema-valid reservations with the wrong operation kind or rewrite mode before effects", async () => {
    const { plan, reserved } = reservedProviderRefreshFixture();
    const operation = reserved.value.activeOperation!;
    if (operation.kind !== "rewrite") throw new Error("fixture must carry a rewrite reservation");
    const effect = vi.fn(async () => { throw new Error("invalid reservation reached an effect"); });
    const dependencies = {
      observeResult: effect,
      readTargetAncestry: effect,
      proveContribution: effect,
      absorbTop: effect,
      publishTop: effect,
      rewriteLocalRef: effect,
      cleanupPreparedCandidates: effect,
      stateStore: { publish: effect },
    };
    const cases: DeliveryStateV1["activeOperation"][] = [{
      operationId: operation.operationId,
      kind: "teardown",
      affectedDeliverableIds: operation.affectedDeliverableIds,
      stateRevision: operation.stateRevision,
      boundPlanDigest: operation.boundPlanDigest,
      before: operation.before,
      requested: operation.requested,
      mode: "member",
      candidateHeads: [],
    }, {
      ...operation,
      mode: "selected-change",
    }];

    for (const activeOperation of cases) {
      await expect(settleReservedDeliverySuffixRefresh({
        plan,
        current: { ...reserved, value: { ...reserved.value, activeOperation } },
        ...dependencies,
      })).resolves.toEqual({ status: "blocked", reason: "ambiguous" });
    }
    expect(effect).not.toHaveBeenCalled();
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
    })).resolves.toMatchObject({
      status: "blocked",
      reason: "content-conflict",
      paths: ["top.txt"],
      conflictPreparation: {
        topRef: reserved.value.members.at(-1)!.ref,
        logicalMergeBase: reserved.value.members.at(-1)!.coordinates!.base,
        parents: {
          top: reserved.value.members.at(-1)!.coordinates!.head,
          refreshedPredecessor: observed.members.at(-1)!.coordinates!.head,
        },
      },
    });
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

  it("checks terminal readiness before reserving external adoption", async () => {
    const { plan, state, affected, observed } = providerRefreshFixture();
    let revision = 7;
    let localRefChanged = false;
    let topChanged = false;

    const result = await adoptExternalDeliverySuffixRefresh({
      plan,
      current: { revision, value: state },
      affectedDeliverableIds: affected,
      observeResult: async () => ({
        status: "observed",
        observation: { snapshot: observed, targetMovement: "exact" },
      }),
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      preflightTop: async () => ({ status: "refused", reason: "worktree-dirty" }),
      absorbTop: async () => {
        topChanged = true;
        return { status: "absorbed", head: "a".repeat(40), tree: "b".repeat(40) };
      },
      publishTop: async () => {
        topChanged = true;
        return { status: "published" };
      },
      rewriteLocalRef: async () => {
        localRefChanged = true;
        return { status: "rewritten" };
      },
      stateStore: { publish: async (_planId, value) => {
        revision += 1;
        return { status: "ok", value: { revision, value } };
      } },
    });

    expect(result).toEqual({ status: "refused", reason: "worktree-dirty" });
    expect(revision).toBe(7);
    expect(localRefChanged).toBe(false);
    expect(topChanged).toBe(false);
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

  it("settles an empty dependent suffix only when the terminal top still owes absorption", async () => {
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
      selectedDeliverableId: highest.deliverableId,
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
      previousHighestMember: { head: "0".repeat(40) },
      highestMember: { head: highest.coordinates!.head, tree: highest.coordinates!.tree },
    }));
    expect(result).toMatchObject({
      status: "applied",
      selectedDeliverableId: highest.deliverableId,
      state: {
        value: {
          activeOperation: null,
          pendingReviewFixVerification: {
            selectedDeliverableId: highest.deliverableId,
          },
        },
      },
    });

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

  it("preserves narrow lifecycle and ref-adapter refusal diagnostics", async () => {
    const { plan, state } = movedFixture();
    const member = state.members[1]!;
    const request = { target: state.target, members: [{ ...member }] };
    await expect(executeDeliverySuffixRewrite({
      plan,
      current: { revision: 7, value: state },
      deliverableId: member.deliverableId,
      requested: request,
      revalidateLifecycle: async () => ({
        status: "refused", reason: "entry-unavailable", paths: ["meta.md"],
      }),
      rewriteRef: async () => { throw new Error("must not rewrite"); },
      observeResult: async () => { throw new Error("must not observe"); },
      proveContribution: async () => { throw new Error("must not prove"); },
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
    })).resolves.toEqual({
      status: "refused",
      reason: "lifecycle-contribution",
      paths: ["meta.md"],
      detail: "Lifecycle revalidation refused: entry-unavailable.",
    });

    const writes: DeliveryStateV1[] = [];
    await expect(executeDeliverySuffixRewrite({
      plan,
      current: { revision: 7, value: state },
      deliverableId: member.deliverableId,
      requested: request,
      revalidateLifecycle: async () => ({ status: "ok" }),
      rewriteRef: async () => ({ status: "refused", reason: "stale-lease" }),
      observeResult: async () => { throw new Error("must not observe"); },
      proveContribution: async () => { throw new Error("must not prove"); },
      stateStore: { publish: async (_id, value, revision) => {
        writes.push(value);
        return { status: "ok", value: { revision: revision + 1, value } };
      } },
    })).resolves.toEqual({
      status: "refused",
      reason: "rewrite-refused",
      detail: "Ref rewrite refused: stale-lease.",
    });
    expect(writes).toHaveLength(1);
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
      operationMode: "selected-change",
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

  it("does not let the equivalence exemption stand in for internal selected-change authority", async () => {
    const { plan, state } = movedFixture();
    const member = state.members[1]!;
    const rewriteRef = vi.fn();
    const publish = vi.fn();
    await expect(executeDeliverySuffixRewrite({
      plan,
      current: { revision: 7, value: state },
      deliverableId: member.deliverableId,
      requested: { target: state.target, members: [{ ...member }] },
      contributionMode: "selected-change",
      revalidateLifecycle: async () => ({ status: "ok" }),
      rewriteRef,
      observeResult: async () => { throw new Error("must not observe"); },
      proveContribution: async () => { throw new Error("must not prove"); },
      stateStore: { publish },
    })).resolves.toEqual({ status: "refused", reason: "selected-change-authority-required" });
    expect(rewriteRef).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
