import { describe, expect, it, vi } from "vitest";

import {
  deriveNativeDeliveryMemberChain,
  prepareNativeDeliveryLanding,
  reconcileLinkedNativeDeliverySuffix,
  reconcileReservedNativeDeliveryMerge,
  reserveNativeDeliveryLanding,
  selectNativeDeliveryLandingArm,
  submitReservedNativeDeliveryMerge,
} from "../../../src/lib/delivery/native-landing.js";
import {
  attachDeliveryOperationEffectIdentity,
  reserveDeliveryOperation,
} from "../../../src/lib/delivery/operation.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";
import {
  deliveryFourMemberStackPlanFixture,
  deliveryThreeMemberStackPlanFixture,
} from "../../fixtures/delivery-plan.js";

const plan = deliveryThreeMemberStackPlanFixture();
const heads = plan.members.slice(0, -1).map((member, index) => ({
  deliverableId: member.deliverableId,
  changeRequestId: String(41 + index),
  headSha: String(index + 1).repeat(40),
}));

describe("native delivery landing", () => {
  it("derives every selected member base from its exact predecessor", () => {
    const chainPlan = deliveryFourMemberStackPlanFixture();
    const state = deliveryStateFixture(chainPlan);
    const bound = {
      ...state,
      members: state.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(41 + index) },
      })),
    };
    const selectedMembers = bound.members.slice(0, -1).map((member) => ({
      deliverableId: member.deliverableId,
      changeRequestId: member.changeRequest!.changeRequestId,
      headSha: member.coordinates!.head,
    }));

    expect(deriveNativeDeliveryMemberChain({
      state: bound,
      selectedMembers,
      repository: "owner/repo",
      baseRef: "refs/heads/main",
    })).toMatchObject({
      status: "derived",
      members: [
        { headRef: "member-1", baseRef: "main" },
        { headRef: "member-2", baseRef: "member-1" },
        { headRef: "member-3", baseRef: "member-2" },
      ],
    });
  });

  it("refuses selected identities that do not match the current binding", () => {
    const state = deliveryStateFixture(plan);
    const member = state.members[0]!;
    const bound = {
      ...state,
      members: state.members.map((candidate, index) => ({
        ...candidate,
        changeRequest: { providerId: "github", changeRequestId: String(41 + index) },
      })),
    };

    for (const selectedMembers of [
      [{ deliverableId: member.deliverableId, changeRequestId: "99", headSha: member.coordinates!.head }],
      [{ deliverableId: member.deliverableId, changeRequestId: "41", headSha: "f".repeat(40) }],
      [
        { deliverableId: member.deliverableId, changeRequestId: "41", headSha: member.coordinates!.head },
        { deliverableId: member.deliverableId, changeRequestId: "41", headSha: member.coordinates!.head },
      ],
    ]) {
      expect(deriveNativeDeliveryMemberChain({
        state: bound,
        selectedMembers,
        repository: "owner/repo",
        baseRef: "main",
      })).toMatchObject({ status: "refused", reason: "member-mismatch" });
    }
  });

  it("selects linked singleton by default and exact nonterminal remainder only on explicit direct invocation", () => {
    expect(selectNativeDeliveryLandingArm({
      plan, landedPrefix: [], observation: { status: "registered", stackNumber: 3 },
      mergeStrategy: "merge", mergeAction: "direct", explicitAtomic: false, members: heads,
    })).toMatchObject({ status: "selected", arm: "linked-single", members: [heads[0]] });
    expect(selectNativeDeliveryLandingArm({
      plan, landedPrefix: [], observation: { status: "registered", stackNumber: 3 },
      mergeStrategy: "merge", mergeAction: "direct", explicitAtomic: true, members: heads,
    })).toMatchObject({ status: "selected", arm: "linked-atomic", members: heads });
    expect(selectNativeDeliveryLandingArm({
      plan, landedPrefix: [heads[0]!.deliverableId], observation: { status: "registered", stackNumber: 3 },
      mergeStrategy: "merge", mergeAction: "direct", explicitAtomic: false, members: [heads[1]!],
    })).toMatchObject({ status: "selected", arm: "linked-single", members: [heads[1]] });
  });

  it("admits the unlinked arm only from authoritative absence and directs registered downgrades", () => {
    expect(selectNativeDeliveryLandingArm({
      plan, landedPrefix: [], mergeAction: "direct", explicitAtomic: false, members: heads,
      observation: { status: "unregistered" }, mergeStrategy: "merge",
    })).toMatchObject({ status: "selected", arm: "unlinked" });

    for (const observation of [
      { status: "partial" as const, affectedDeliverableIds: [heads[0]!.deliverableId] },
      { status: "incoherent" as const, affectedDeliverableIds: [heads[0]!.deliverableId] },
      { status: "unsupported" as const },
      { status: "unavailable" as const },
      { status: "malformed" as const },
      { status: "ambiguous" as const },
    ]) expect(selectNativeDeliveryLandingArm({
      plan, landedPrefix: [], mergeAction: "direct", explicitAtomic: false, members: heads,
      observation, mergeStrategy: "merge",
    })).toMatchObject({ status: "blocked", reason: observation.status });

    expect(selectNativeDeliveryLandingArm({
      plan, landedPrefix: [], mergeAction: "direct", explicitAtomic: false, members: heads,
      observation: { status: "registered", stackNumber: 3 }, mergeStrategy: "squash",
    })).toMatchObject({ status: "downgrade-required", reason: "merge-strategy-unsupported" });

    expect(selectNativeDeliveryLandingArm({
      plan, landedPrefix: [], observation: { status: "registered", stackNumber: 3 },
      mergeStrategy: "merge", mergeAction: "queue", explicitAtomic: true, members: heads,
    })).toMatchObject({ status: "downgrade-required", reason: "queue-not-atomic" });
  });

  it("requires every selected head independently ready and names the exact set and residual race", async () => {
    const readiness = vi.fn().mockResolvedValue({ status: "ready" });
    const prepared = await prepareNativeDeliveryLanding({ arm: "linked-atomic", members: heads }, { readiness });
    expect(prepared).toMatchObject({ status: "prepared", members: heads });
    expect(prepared.status === "prepared" && prepared.consequence).toContain("residual race");
    expect(readiness).toHaveBeenCalledTimes(2);

    readiness.mockResolvedValueOnce({ status: "refused" });
    await expect(prepareNativeDeliveryLanding({ arm: "linked-atomic", members: heads }, { readiness }))
      .resolves.toMatchObject({ status: "blocked", reason: "member-not-ready" });
  });

  it("re-derives the exact plan-ordered landing set from fresh position facts before reservation", async () => {
    const state = deliveryStateFixture(plan);
    const facts = {
      target: state.target,
      members: state.members.map(({ deliverableId, ref, changeRequest, coordinates }) => ({
        deliverableId, ref, changeRequest, coordinates,
      })),
      landedDeliverableIds: [],
    };
    const stateStore = { publish: vi.fn() };
    await expect(reserveNativeDeliveryLanding({
      plan,
      current: { revision: 1, value: state },
      operationId: "operation-1",
      selection: { status: "selected", arm: "linked-single", members: [heads[1]!], recommendedActionText: "prepare" },
      facts,
      repository: "o/r",
      baseRef: "main",
      targetRef: "refs/heads/main",
    }, { readiness: vi.fn(), stateStore })).resolves.toMatchObject({
      status: "blocked",
      reason: "member-set-mismatch",
    });
    expect(stateStore.publish).not.toHaveBeenCalled();
  });

  it("reserves a valid three-member atomic chain and refuses reordered selection", async () => {
    const chainPlan = deliveryFourMemberStackPlanFixture();
    const state = deliveryStateFixture(chainPlan);
    const bound = {
      ...state,
      members: state.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(41 + index) },
      })),
    };
    const selectedMembers = bound.members.slice(0, -1).map((member) => ({
      deliverableId: member.deliverableId,
      changeRequestId: member.changeRequest!.changeRequestId,
      headSha: member.coordinates!.head,
    }));
    const facts = {
      target: bound.target,
      members: bound.members.map(({ deliverableId, ref, changeRequest, coordinates }) => ({
        deliverableId, ref, changeRequest, coordinates,
      })),
      landedDeliverableIds: [],
    };
    const stateStore = { publish: vi.fn(async (_planId, value) => ({
      status: "ok" as const,
      value: { revision: 2, value },
    })) };
    const baseInput = {
      plan: chainPlan,
      current: { revision: 1, value: bound },
      operationId: "operation-1",
      facts,
      repository: "owner/repo",
      baseRef: "main",
      targetRef: "refs/heads/main",
    };

    await expect(reserveNativeDeliveryLanding({
      ...baseInput,
      selection: {
        status: "selected" as const,
        arm: "linked-atomic" as const,
        members: selectedMembers,
        recommendedActionText: "prepare",
      },
    }, {
      readiness: vi.fn().mockResolvedValue({ status: "ready" }),
      stateStore,
    })).resolves.toMatchObject({ status: "prepared", members: selectedMembers });

    await expect(reserveNativeDeliveryLanding({
      ...baseInput,
      selection: {
        status: "selected" as const,
        arm: "linked-atomic" as const,
        members: [...selectedMembers].reverse(),
        recommendedActionText: "prepare",
      },
    }, {
      readiness: vi.fn().mockResolvedValue({ status: "ready" }),
      stateStore,
    })).resolves.toMatchObject({ status: "blocked", reason: "member-set-mismatch" });
    expect(stateStore.publish).toHaveBeenCalledTimes(1);
  });

  it("persists a submitted effect identity before polling and adopts only exact all-landed facts", async () => {
    const state = deliveryStateFixture(plan);
    const ids = state.members.slice(0, -1).map((member) => member.deliverableId);
    const snapshot = { target: state.target, members: state.members.slice(0, -1) };
    const effect = {
      providerId: "github", repository: "o/r", changeRequestId: "42", headSha: "b".repeat(40),
      baseRef: "main", targetRef: "refs/heads/main", strategy: "merge",
    } as const;
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "operation-1", kind: "land", mode: "native", affectedDeliverableIds: ids,
      expectedStateRevision: 1, before: snapshot, requested: snapshot, effect,
    });
    if (reserved.status !== "reserved") throw new Error("fixture reservation failed");
    let record = { revision: 2, value: reserved.state };
    const stateStore = { publish: vi.fn(async (_id, value) => {
      record = { revision: record.revision + 1, value };
      return { status: "ok" as const, value: record };
    }) };
    const host = {
      submitNativeMerge: vi.fn().mockResolvedValue({ status: "submitted", effectIdentity: "uuid-1" }),
      observeNativeMerge: vi.fn().mockResolvedValue({ status: "merged" }),
    };
    const request = {
      repository: "o/r", topChangeRequestId: "42", topHeadSha: "b".repeat(40),
      mergeAction: "direct_merge" as const, mergeMethod: "merge" as const,
    };
    const submitted = await submitReservedNativeDeliveryMerge({ planId: plan.planId, current: record, operationId: "operation-1", request }, {
      host, stateStore,
      reobserveSelection: vi.fn().mockResolvedValue({ status: "exact" }),
      revalidate: vi.fn().mockResolvedValue({ status: "ready" }),
      releaseLock: vi.fn().mockResolvedValue({ status: "released" }),
      observeEffect: vi.fn(),
    });
    expect(submitted).toMatchObject({ status: "pending", effectIdentity: "uuid-1" });
    expect(record.value.activeOperation).toMatchObject({ effectIdentity: { providerId: "github", effectId: "uuid-1" } });

    const reconciled = await reconcileReservedNativeDeliveryMerge({
      planId: plan.planId, current: record, request,
    }, { host, stateStore, observeEffect: vi.fn().mockResolvedValue({ outcome: "all-landed", snapshot }) });
    expect(reconciled).toMatchObject({ status: "applied" });
    expect(record.value.activeOperation).toBeNull();
  });

  it("does not submit a sequential reservation through native landing", async () => {
    const state = deliveryStateFixture(plan);
    const member = state.members[0]!;
    const snapshot = { target: state.target, members: [member] };
    const effect = {
      providerId: "github", repository: "o/r", changeRequestId: "41", headSha: member.coordinates!.head,
      baseRef: "main", targetRef: "refs/heads/main", strategy: "merge",
    } as const;
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "operation-1", kind: "land", mode: "sequential",
      affectedDeliverableIds: [member.deliverableId], expectedStateRevision: 1,
      before: snapshot, requested: snapshot, effect,
    });
    if (reserved.status !== "reserved") throw new Error("fixture reservation failed");
    const host = {
      submitNativeMerge: vi.fn().mockResolvedValue({ status: "submitted", effectIdentity: "uuid-1" }),
      observeNativeMerge: vi.fn(),
    };
    await expect(submitReservedNativeDeliveryMerge({
      planId: plan.planId,
      current: { revision: 2, value: reserved.state },
      operationId: "operation-1",
      request: {
        repository: "o/r", topChangeRequestId: "41", topHeadSha: member.coordinates!.head,
        mergeAction: "direct_merge", mergeMethod: "merge",
      },
    }, {
      host,
      stateStore: { publish: vi.fn() },
      reobserveSelection: vi.fn().mockResolvedValue({ status: "exact" }),
      revalidate: vi.fn().mockResolvedValue({ status: "ready" }),
      releaseLock: vi.fn().mockResolvedValue({ status: "released" }),
      observeEffect: vi.fn(),
    })).resolves.toMatchObject({ status: "blocked", reason: "reservation-mismatch" });
    expect(host.submitNativeMerge).not.toHaveBeenCalled();
  });

  it("retains pending, contradictory, partial, and unavailable native effects", async () => {
    const state = deliveryStateFixture(plan);
    const ids = state.members.slice(0, -1).map((member) => member.deliverableId);
    const snapshot = { target: state.target, members: state.members.slice(0, -1) };
    const effect = {
      providerId: "github", repository: "o/r", changeRequestId: "42", headSha: "b".repeat(40),
      baseRef: "main", targetRef: "refs/heads/main", strategy: "merge",
    } as const;
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "operation-1", kind: "land", mode: "native", affectedDeliverableIds: ids,
      expectedStateRevision: 1, before: snapshot, requested: snapshot, effect,
    });
    if (reserved.status !== "reserved") throw new Error("fixture reservation failed");
    const attached = attachDeliveryOperationEffectIdentity(
      { revision: 2, value: reserved.state }, "operation-1", { providerId: "github", effectId: "uuid-1" },
    );
    if (attached.status === "refused") throw new Error("fixture identity attachment failed");
    const record = { revision: 3, value: attached.state };
    const stateStore = { publish: vi.fn() };
    const request = {
      repository: "o/r", topChangeRequestId: "42", topHeadSha: "b".repeat(40),
      mergeAction: "direct_merge" as const, mergeMethod: "merge" as const,
    };
    const host = {
      submitNativeMerge: vi.fn(),
      observeNativeMerge: vi.fn().mockResolvedValue({ status: "pending" }),
    };

    await expect(reconcileReservedNativeDeliveryMerge(
      { planId: plan.planId, current: record, request },
      { host, stateStore, observeEffect: vi.fn() },
    )).resolves.toMatchObject({ status: "pending" });
    await expect(reconcileReservedNativeDeliveryMerge(
      { planId: plan.planId, current: record, request: { ...request, repository: "other/repo" } },
      { host, stateStore, observeEffect: vi.fn() },
    )).resolves.toMatchObject({ status: "blocked", reason: "reservation-mismatch" });
    host.observeNativeMerge.mockResolvedValue({ status: "merged" });
    await expect(reconcileReservedNativeDeliveryMerge(
      { planId: plan.planId, current: record, request },
      { host, stateStore, observeEffect: vi.fn().mockResolvedValue({ outcome: "none-landed" }) },
    )).resolves.toMatchObject({ status: "blocked", reason: "ambiguous-result" });
    await expect(reconcileReservedNativeDeliveryMerge(
      { planId: plan.planId, current: record, request },
      { host, stateStore, observeEffect: vi.fn().mockResolvedValue({ outcome: "partial-landed", affectedDeliverableIds: [ids[0]] }) },
    )).resolves.toMatchObject({ status: "blocked", reason: "partial-landed" });
    host.observeNativeMerge.mockResolvedValue({ status: "refused", reason: "unavailable" });
    await expect(reconcileReservedNativeDeliveryMerge(
      { planId: plan.planId, current: record, request },
      { host, stateStore, observeEffect: vi.fn() },
    )).resolves.toMatchObject({ status: "blocked", reason: "unavailable" });
    expect(stateStore.publish).not.toHaveBeenCalled();

    host.observeNativeMerge.mockResolvedValue({ status: "failed" });
    await expect(reconcileReservedNativeDeliveryMerge(
      { planId: plan.planId, current: record, request },
      { host, stateStore, observeEffect: vi.fn().mockResolvedValue({ outcome: "all-landed", snapshot }) },
    )).resolves.toMatchObject({ status: "blocked", reason: "ambiguous-result" });
    expect(stateStore.publish).not.toHaveBeenCalled();
  });

  it("clears only a persisted failed effect with exact none-landed facts", async () => {
    const state = deliveryStateFixture(plan);
    const ids = state.members.slice(0, -1).map((member) => member.deliverableId);
    const snapshot = { target: state.target, members: state.members.slice(0, -1) };
    const effect = {
      providerId: "github", repository: "o/r", changeRequestId: "42", headSha: "b".repeat(40),
      baseRef: "main", targetRef: "refs/heads/main", strategy: "merge",
    } as const;
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "operation-1", kind: "land", mode: "native", affectedDeliverableIds: ids,
      expectedStateRevision: 1, before: snapshot, requested: snapshot, effect,
    });
    if (reserved.status !== "reserved") throw new Error("fixture reservation failed");
    const attached = attachDeliveryOperationEffectIdentity(
      { revision: 2, value: reserved.state }, "operation-1", { providerId: "github", effectId: "uuid-1" },
    );
    if (attached.status === "refused") throw new Error("fixture identity attachment failed");
    const record = { revision: 3, value: attached.state };
    const stateStore = { publish: vi.fn(async (_id, value) => ({
      status: "ok" as const,
      value: { revision: 4, value },
    })) };
    const request = {
      repository: "o/r", topChangeRequestId: "42", topHeadSha: "b".repeat(40),
      mergeAction: "direct_merge" as const, mergeMethod: "merge" as const,
    };
    const host = {
      submitNativeMerge: vi.fn(),
      observeNativeMerge: vi.fn().mockResolvedValue({ status: "failed" }),
    };

    await expect(reconcileReservedNativeDeliveryMerge(
      { planId: plan.planId, current: record, request },
      { host, stateStore, observeEffect: vi.fn().mockResolvedValue({ outcome: "none-landed" }) },
    )).resolves.toEqual({
      status: "retryable",
      transition: "cleared",
      action: "delivery-native-land-select",
      selector: {
        planId: plan.planId,
        operationKind: "land",
        operationId: "operation-1",
        affectedDeliverableIds: ids,
        mode: "native",
      },
      recommendedActionText:
        "Rerun `arc delivery native land-select` for the exact native landing reservation subject.",
    });
    expect(stateStore.publish).toHaveBeenCalledWith(
      plan.planId,
      expect.objectContaining({ activeOperation: null }),
      record.revision,
    );
  });

  it("adopts an immediate merged response only from fresh all-landed facts", async () => {
    const state = deliveryStateFixture(plan);
    const members = state.members.slice(0, -1);
    const snapshot = { target: state.target, members };
    const effect = {
      providerId: "github", repository: "o/r", changeRequestId: "42", headSha: "b".repeat(40),
      baseRef: "main", targetRef: "refs/heads/main", strategy: "merge",
    } as const;
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "operation-1", kind: "land", mode: "native",
      affectedDeliverableIds: members.map((member) => member.deliverableId),
      expectedStateRevision: 1, before: snapshot, requested: snapshot, effect,
    });
    if (reserved.status !== "reserved") throw new Error("fixture reservation failed");
    const current = { revision: 2, value: reserved.state };
    const request = {
      repository: "o/r", topChangeRequestId: "42", topHeadSha: "b".repeat(40),
      mergeAction: "direct_merge" as const, mergeMethod: "merge" as const,
    };
    const stateStore = { publish: vi.fn(async (_id, value) => ({
      status: "ok" as const, value: { revision: 3, value },
    })) };
    const dependencies = {
      host: {
        submitNativeMerge: vi.fn().mockResolvedValue({ status: "merged" }),
        observeNativeMerge: vi.fn(),
      },
      stateStore,
      reobserveSelection: vi.fn().mockResolvedValue({ status: "exact" }),
      revalidate: vi.fn().mockResolvedValue({ status: "ready" }),
      releaseLock: vi.fn().mockResolvedValue({ status: "released" }),
      observeEffect: vi.fn().mockResolvedValue({ outcome: "all-landed", snapshot }),
    };
    await expect(submitReservedNativeDeliveryMerge({
      planId: plan.planId, current, operationId: "operation-1", request,
    }, dependencies)).resolves.toMatchObject({ status: "applied", state: { value: { activeOperation: null } } });

    stateStore.publish.mockClear();
    dependencies.observeEffect.mockResolvedValue({ outcome: "none-landed" });
    await expect(submitReservedNativeDeliveryMerge({
      planId: plan.planId, current, operationId: "operation-1", request,
    }, dependencies)).resolves.toMatchObject({ status: "blocked", reason: "submission-before-persist-unresolved" });
    expect(stateStore.publish).not.toHaveBeenCalled();
  });

  it("routes one linked singleton retarget through contribution-proven suffix reconciliation", async () => {
    const initial = deliveryStateFixture(plan);
    const bound = {
      ...initial,
      members: initial.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(41 + index) },
      })),
    };
    const first = bound.members[0]!;
    const beforeSnapshot = { target: bound.target, members: [first] };
    const effect = {
      providerId: "github", repository: "o/r", changeRequestId: "41", headSha: first.coordinates!.head,
      baseRef: "delivery-target", targetRef: "refs/heads/delivery-target", strategy: "merge",
    } as const;
    const reserved = reserveDeliveryOperation({ revision: 1, value: bound }, plan, {
      operationId: "operation-1", kind: "land", mode: "native", affectedDeliverableIds: [first.deliverableId],
      expectedStateRevision: 1, before: beforeSnapshot, requested: beforeSnapshot, effect,
    });
    if (reserved.status !== "reserved") throw new Error("fixture reservation failed");
    const newTarget = { head: "d".repeat(40), tree: "e".repeat(40) };
    const landed = {
      ...bound,
      target: { ref: "refs/heads/delivery-target", coordinates: newTarget },
      members: bound.members.map((member, index) => index === 0 ? ({
        ...member,
        coordinates: { base: member.coordinates!.base, head: newTarget.head, tree: newTarget.tree },
      }) : member),
      activeOperation: null,
    };
    let revision = 3;
    const stateStore = { publish: vi.fn(async (_id, value) => ({
      status: "ok" as const,
      value: { revision: revision += 1, value },
    })) };
    const next = landed.members[1]!;
    const moved = { head: "a".repeat(40), tree: "b".repeat(40) };
    const proof = vi.fn().mockResolvedValue({ status: "accepted", proof: "mechanical-reapply" });
    await expect(reconcileLinkedNativeDeliverySuffix({
      plan,
      before: { revision: 2, value: reserved.state },
      landed: { revision: 3, value: landed },
      repository: "o/r",
      protectedTargetRef: "refs/heads/delivery-target",
    }, {
      observeRequest: vi.fn().mockResolvedValue({ status: "observed", request: {
        binding: next.changeRequest!, repository: "o/r", headRepository: "o/r",
        headRef: "member-2", headSha: moved.head, baseRef: "delivery-target", state: "open", draft: false,
      } }),
      observeRef: vi.fn().mockResolvedValue(moved),
      proveContribution: proof,
      stateStore,
    })).resolves.toMatchObject({ status: "applied", state: { value: { activeOperation: null } } });
    expect(proof).toHaveBeenCalledTimes(2);
    expect(stateStore.publish).toHaveBeenCalledTimes(2);
  });
});
