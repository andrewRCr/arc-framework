import { describe, expect, it, vi } from "vitest";

import {
  deriveNativeDeliveryMemberChain,
  deriveNativeDeliveryRegisteredRemainder,
  preflightSequentialDeliveryLanding,
  prepareNativeDeliveryLanding,
  reconcileLinkedNativeDeliverySuffix,
  reconcileReservedNativeDeliveryMerge,
  reserveNativeDeliveryLanding,
  selectNativeDeliveryLandingArm,
  sequentialLandingNativeObservationGuard,
  submitReservedNativeDeliveryMerge,
} from "../../../src/lib/delivery/native-landing.js";
import {
  attachDeliveryOperationEffectIdentity,
  beginNativeDeliverySubmission,
  reserveDeliveryOperation,
} from "../../../src/lib/delivery/operation.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";
import {
  deliveryFourMemberStackPlanFixture,
} from "../../fixtures/delivery-plan.js";
import {
  heads,
  mergePolicy,
  plan,
} from "../../helpers/native-landing-fixtures.js";

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
      baseRef: "refs/heads/delivery-target",
    })).toMatchObject({
      status: "derived",
      members: [
        { headRef: "member-1", baseRef: "delivery-target" },
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
        baseRef: "delivery-target",
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

  it("reports an exhausted nonterminal remainder before provider-target failures", () => {
    expect(selectNativeDeliveryLandingArm({
      plan,
      landedPrefix: heads.map((member) => member.deliverableId),
      observation: { status: "unavailable" },
      mergeStrategy: "merge",
      mergeAction: "direct",
      explicitAtomic: false,
      members: [],
    })).toMatchObject({ status: "blocked", reason: "no-nonterminal-remainder" });
  });

  it("reobserves a linked-single landing against the complete registered remainder", () => {
    const chainPlan = deliveryFourMemberStackPlanFixture();
    const state = deliveryStateFixture(chainPlan);
    const bound = {
      ...state,
      members: state.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(41 + index) },
      })),
    };

    expect(deriveNativeDeliveryRegisteredRemainder({
      plan: chainPlan,
      state: bound,
      firstDeliverableId: bound.members[0]!.deliverableId,
      repository: "owner/repo",
      baseRef: "delivery-target",
    })).toMatchObject({
      status: "derived",
      members: [
        { deliverableId: bound.members[0]!.deliverableId, baseRef: "delivery-target" },
        { deliverableId: bound.members[1]!.deliverableId, baseRef: "member-1" },
        { deliverableId: bound.members[2]!.deliverableId, baseRef: "member-2" },
      ],
    });
    expect(deriveNativeDeliveryRegisteredRemainder({
      plan: chainPlan,
      state: bound,
      firstDeliverableId: bound.members[1]!.deliverableId,
      repository: "owner/repo",
      baseRef: "delivery-target",
    })).toMatchObject({
      status: "derived",
      members: [
        { deliverableId: bound.members[1]!.deliverableId, baseRef: "delivery-target" },
        { deliverableId: bound.members[2]!.deliverableId, baseRef: "member-2" },
      ],
    });
  });

  it("keeps sequential landing off a registered stack and available for an unlinked stack", async () => {
    const chainPlan = deliveryFourMemberStackPlanFixture();
    const state = deliveryStateFixture(chainPlan);
    const bound = {
      ...state,
      members: state.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github" as const, changeRequestId: String(41 + index) },
      })),
    };
    const observe = vi.fn();
    expect(sequentialLandingNativeObservationGuard({ status: "registered", stackNumber: 621 }))
      .toMatchObject({
        status: "refuse",
        reason: "registered-native-stack",
        recommendedActionText:
          "Rerun `arc delivery native land-select`; it will freshly observe the canonical remaining stack.",
      });
    expect(sequentialLandingNativeObservationGuard({ status: "unregistered" }))
      .toEqual({ status: "continue" });
    expect(sequentialLandingNativeObservationGuard({ status: "unavailable" }))
      .toMatchObject({ status: "refuse", reason: "native-observation-unavailable" });

    observe.mockResolvedValueOnce({ status: "registered", stackNumber: 621 });
    await expect(preflightSequentialDeliveryLanding({
      plan: chainPlan,
      state: bound,
      selectedDeliverableId: bound.members[0]!.deliverableId,
      repository: "owner/repo",
      observe: { observe },
    })).resolves.toMatchObject({ status: "refuse", reason: "registered-native-stack" });
    expect(observe).toHaveBeenCalledOnce();

    observe.mockReset();
    observe.mockResolvedValueOnce({ status: "unregistered" });
    await expect(preflightSequentialDeliveryLanding({
      plan: chainPlan,
      state: bound,
      selectedDeliverableId: bound.members[0]!.deliverableId,
      repository: "owner/repo",
      observe: { observe },
    })).resolves.toEqual({ status: "continue" });
    expect(observe).toHaveBeenCalledOnce();

    observe.mockReset();
    await expect(preflightSequentialDeliveryLanding({
      plan: chainPlan,
      state,
      selectedDeliverableId: state.members[0]!.deliverableId,
      repository: "owner/repo",
      observe: { observe },
    })).resolves.toEqual({ status: "continue" });
    expect(observe).not.toHaveBeenCalled();
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

  it("starts all readiness checks together and reports every refusal in selected order", async () => {
    const chainPlan = deliveryFourMemberStackPlanFixture();
    const selected = chainPlan.members.slice(0, -1).map((member, index) => ({
      deliverableId: member.deliverableId,
      changeRequestId: String(41 + index),
      headSha: String(index + 1).repeat(40),
    }));
    const started: string[] = [];
    const settle = new Map<string, (result: { readonly status: "ready" | "refused" }) => void>();
    const preparing = prepareNativeDeliveryLanding(
      { arm: "linked-atomic", members: selected },
      {
        readiness: (member) => {
          started.push(member.deliverableId);
          return new Promise((resolve) => settle.set(member.deliverableId, resolve));
        },
      },
    );

    await Promise.resolve();
    expect(started).toEqual(selected.map((member) => member.deliverableId));
    settle.get(selected[2]!.deliverableId)?.({ status: "refused" });
    settle.get(selected[1]!.deliverableId)?.({ status: "ready" });
    settle.get(selected[0]!.deliverableId)?.({ status: "refused" });

    await expect(preparing).resolves.toMatchObject({
      status: "blocked",
      reason: "member-not-ready",
      unreadyMembers: [selected[0], selected[2]],
    });
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
      baseRef: "delivery-target",
      targetRef: state.target!.ref,
      mergePolicy: mergePolicy("o/r"),
    }, { readiness: vi.fn(), stateStore })).resolves.toMatchObject({
      status: "blocked",
      reason: "member-set-mismatch",
    });
    expect(stateStore.publish).not.toHaveBeenCalled();
  });

  it("refuses caller-selected native landing refs before readiness or reservation", async () => {
    const chainPlan = deliveryFourMemberStackPlanFixture();
    const state = deliveryStateFixture(chainPlan);
    const bound = {
      ...state,
      members: state.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(41 + index) },
      })),
    };
    const selection = {
      status: "selected" as const,
      arm: "linked-single" as const,
      members: [{
        deliverableId: bound.members[0]!.deliverableId,
        changeRequestId: bound.members[0]!.changeRequest!.changeRequestId,
        headSha: bound.members[0]!.coordinates!.head,
      }],
      recommendedActionText: "prepare",
    };
    const facts = {
      target: bound.target,
      members: bound.members.map(({ deliverableId, ref, changeRequest, coordinates }) => ({
        deliverableId, ref, changeRequest, coordinates,
      })),
      landedDeliverableIds: [],
    };
    for (const refs of [
      { baseRef: "main", targetRef: bound.target!.ref },
      { baseRef: "delivery-target", targetRef: "refs/heads/main" },
    ]) {
      const readiness = vi.fn().mockResolvedValue({ status: "ready" });
      const stateStore = { publish: vi.fn() };
      await expect(reserveNativeDeliveryLanding({
        plan: chainPlan,
        current: { revision: 1, value: bound },
        operationId: "operation-1",
        selection,
        facts,
        repository: "owner/repo",
        mergePolicy: mergePolicy("owner/repo"),
        ...refs,
      }, { readiness, stateStore })).resolves.toMatchObject({
        status: "blocked",
        reason: "protected-target-mismatch",
      });
      expect(readiness).not.toHaveBeenCalled();
      expect(stateStore.publish).not.toHaveBeenCalled();
    }
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
      baseRef: "delivery-target",
      targetRef: bound.target!.ref,
      mergePolicy: mergePolicy("owner/repo"),
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
    })).resolves.toMatchObject({
      status: "prepared",
      members: selectedMembers,
      state: {
        value: {
          activeOperation: {
            mode: "native",
            native: { arm: "linked-atomic", phase: "prepared" },
            effect: { mergePolicy: mergePolicy("owner/repo") },
          },
        },
      },
    });

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
      baseRef: "delivery-target", targetRef: "refs/heads/delivery-target", strategy: "merge", mergePolicy: mergePolicy("o/r"),
    } as const;
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "operation-1", kind: "land", mode: "native", nativeArm: "linked-atomic",
      affectedDeliverableIds: ids,
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
    const policyMovedHost = {
      submitNativeMerge: vi.fn().mockResolvedValue({ status: "refused", reason: "unavailable" }),
      observeNativeMerge: vi.fn(),
    };
    await expect(submitReservedNativeDeliveryMerge({
      planId: plan.planId, current: record, operationId: "operation-1", request,
    }, {
      host: policyMovedHost,
      stateStore,
      reobserveSelection: vi.fn().mockResolvedValue({ status: "exact" }),
      revalidateSet: vi.fn().mockResolvedValue({ status: "ready" }),
      releaseLock: vi.fn().mockResolvedValue({ status: "released" }),
      revalidateMergePolicy: vi.fn().mockResolvedValue({ status: "refused" }),
      observeEffect: vi.fn(),
    })).resolves.toMatchObject({ status: "blocked", reason: "merge-policy-moved" });
    expect(policyMovedHost.submitNativeMerge).not.toHaveBeenCalled();

    let setAdmissionAvailable = true;
    const submitted = await submitReservedNativeDeliveryMerge({ planId: plan.planId, current: record, operationId: "operation-1", request }, {
      host, stateStore,
      reobserveSelection: vi.fn().mockResolvedValue({ status: "exact" }),
      revalidateSet: vi.fn(async (members) => {
        if (!setAdmissionAvailable || members.length !== ids.length) {
          return { status: "refused" as const };
        }
        setAdmissionAvailable = false;
        return { status: "ready" as const };
      }),
      releaseLock: vi.fn().mockResolvedValue({ status: "released" }),
      revalidateMergePolicy: vi.fn().mockResolvedValue({ status: "exact" }),
      observeEffect: vi.fn(),
    });
    expect(submitted).toMatchObject({ status: "pending", effectIdentity: "uuid-1" });
    expect(record.value.activeOperation).toMatchObject({ effectIdentity: { providerId: "github", effectId: "uuid-1" } });

    const reconciled = await reconcileReservedNativeDeliveryMerge({
      planId: plan.planId, current: record, request, treeRoot: "/repo", remote: "origin",
    }, { host, stateStore, observeEffect: vi.fn().mockResolvedValue({ outcome: "all-landed", snapshot }) });
    expect(reconciled).toMatchObject({
      status: "applied",
      projected: { activeOperation: null },
    });
    expect(stateStore.publish).toHaveBeenCalledTimes(2);
    expect(record.value.activeOperation).toMatchObject({
      effectIdentity: { providerId: "github", effectId: "uuid-1" },
    });
  });

  it("publishes submitting before host access and never replays a submission whose identity was lost", async () => {
    const state = deliveryStateFixture(plan);
    const members = state.members.slice(0, -1);
    const snapshot = { target: state.target, members };
    const effect = {
      providerId: "github", repository: "o/r", changeRequestId: "42", headSha: "b".repeat(40),
      baseRef: "delivery-target", targetRef: "refs/heads/delivery-target", strategy: "merge",
      mergePolicy: mergePolicy("o/r"),
    } as const;
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "operation-1", kind: "land", mode: "native", nativeArm: "linked-atomic",
      affectedDeliverableIds: members.map((member) => member.deliverableId),
      expectedStateRevision: 1, before: snapshot, requested: snapshot, effect,
    });
    if (reserved.status !== "reserved") throw new Error("fixture reservation failed");
    const preparedRecord = { revision: 2, value: reserved.state };
    let record = preparedRecord;
    let submittingRecord: typeof record | null = null;
    const stateStore = { publish: vi.fn(async (_id, value, expectedRevision) => {
      if (expectedRevision !== record.revision) {
        return { status: "refused" as const, reason: "version-conflict" as const };
      }
      record = { revision: record.revision + 1, value };
      if (value.activeOperation?.kind === "land"
        && value.activeOperation.native?.phase === "submitting"
        && value.activeOperation.effectIdentity === null) submittingRecord = record;
      return { status: "ok" as const, value: record };
    }) };
    const request = {
      repository: "o/r", topChangeRequestId: "42", topHeadSha: "b".repeat(40),
      mergeAction: "direct_merge" as const, mergeMethod: "merge" as const,
    };
    const host = {
      submitNativeMerge: vi.fn(async () => {
        expect(record.value.activeOperation).toMatchObject({
          native: { arm: "linked-atomic", phase: "submitting" },
          effectIdentity: null,
        });
        return { status: "submitted" as const, effectIdentity: "uuid-1" };
      }),
      observeNativeMerge: vi.fn(),
    };
    const dependencies = {
      host,
      stateStore,
      reobserveSelection: vi.fn().mockResolvedValue({ status: "exact" }),
      revalidateSet: vi.fn().mockResolvedValue({ status: "ready" }),
      releaseLock: vi.fn().mockResolvedValue({ status: "released" }),
      revalidateMergePolicy: vi.fn().mockResolvedValue({ status: "exact" }),
      observeEffect: vi.fn(),
    };

    await expect(submitReservedNativeDeliveryMerge({
      planId: plan.planId, current: record, operationId: "operation-1", request,
    }, dependencies)).resolves.toMatchObject({ status: "pending", effectIdentity: "uuid-1" });
    expect(record).toMatchObject({
      revision: 4,
      value: { activeOperation: { native: { phase: "submitting" }, effectIdentity: { effectId: "uuid-1" } } },
    });
    if (submittingRecord === null) throw new Error("submitting phase was not persisted");
    const replayHost = { submitNativeMerge: vi.fn(), observeNativeMerge: vi.fn() };
    await expect(submitReservedNativeDeliveryMerge({
      planId: plan.planId,
      current: submittingRecord,
      operationId: "operation-1",
      request,
    }, { ...dependencies, host: replayHost })).resolves.toMatchObject({
      status: "blocked",
      reason: "submission-before-persist-unresolved",
    });
    expect(replayHost.submitNativeMerge).not.toHaveBeenCalled();

    await expect(submitReservedNativeDeliveryMerge({
      planId: plan.planId,
      current: record,
      operationId: "operation-1",
      request,
    }, { ...dependencies, host: replayHost })).resolves.toMatchObject({
      status: "pending",
      effectIdentity: "uuid-1",
    });
    expect(replayHost.submitNativeMerge).not.toHaveBeenCalled();

    const conflictHost = { submitNativeMerge: vi.fn(), observeNativeMerge: vi.fn() };
    await expect(submitReservedNativeDeliveryMerge({
      planId: plan.planId,
      current: preparedRecord,
      operationId: "operation-1",
      request,
    }, {
      ...dependencies,
      host: conflictHost,
      stateStore: { publish: vi.fn().mockResolvedValue({ status: "refused", reason: "version-conflict" }) },
    })).resolves.toMatchObject({ status: "blocked", reason: "state-conflict" });
    expect(conflictHost.submitNativeMerge).not.toHaveBeenCalled();

    await expect(submitReservedNativeDeliveryMerge({
      planId: plan.planId,
      current: { revision: 3, value: preparedRecord.value },
      operationId: "operation-1",
      request,
    }, { ...dependencies, host: conflictHost })).resolves.toMatchObject({
      status: "blocked",
      reason: "operation-stale",
    });
    expect(conflictHost.submitNativeMerge).not.toHaveBeenCalled();
  });

  it("does not submit a sequential reservation through native landing", async () => {
    const state = deliveryStateFixture(plan);
    const member = state.members[0]!;
    const snapshot = { target: state.target, members: [member] };
    const effect = {
      providerId: "github", repository: "o/r", changeRequestId: "41", headSha: member.coordinates!.head,
      baseRef: "delivery-target", targetRef: "refs/heads/delivery-target", strategy: "merge", mergePolicy: mergePolicy("o/r"),
    } as const;
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "operation-1", kind: "land", mode: "sequential", nativeArm: null,
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
      revalidateSet: vi.fn().mockResolvedValue({ status: "ready" }),
      releaseLock: vi.fn().mockResolvedValue({ status: "released" }),
      revalidateMergePolicy: vi.fn().mockResolvedValue({ status: "exact" }),
      observeEffect: vi.fn(),
    })).resolves.toMatchObject({ status: "blocked", reason: "reservation-mismatch" });
    expect(host.submitNativeMerge).not.toHaveBeenCalled();
  });

  it("refuses a legacy native reservation rooted at a different target before host access", async () => {
    const state = deliveryStateFixture(plan);
    const members = state.members.slice(0, -1);
    const snapshot = { target: state.target, members };
    const effect = {
      providerId: "github", repository: "o/r", changeRequestId: "42", headSha: "b".repeat(40),
      baseRef: "main", targetRef: "refs/heads/main", strategy: "merge", mergePolicy: mergePolicy("o/r"),
    } as const;
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "operation-1", kind: "land", mode: "native", nativeArm: "linked-atomic",
      affectedDeliverableIds: members.map((member) => member.deliverableId),
      expectedStateRevision: 1, before: snapshot, requested: snapshot, effect,
    });
    if (reserved.status !== "reserved") throw new Error("fixture reservation failed");
    const current = { revision: 2, value: reserved.state };
    const request = {
      repository: "o/r", topChangeRequestId: "42", topHeadSha: "b".repeat(40),
      mergeAction: "direct_merge" as const, mergeMethod: "merge" as const,
    };
    const host = {
      submitNativeMerge: vi.fn(),
      observeNativeMerge: vi.fn(),
    };
    const reobserveSelection = vi.fn();
    const revalidateSet = vi.fn();
    const releaseLock = vi.fn();
    const revalidateMergePolicy = vi.fn();
    const observeEffect = vi.fn();

    await expect(submitReservedNativeDeliveryMerge({
      planId: plan.planId, current, operationId: "operation-1", request,
    }, {
      host, stateStore: { publish: vi.fn() }, reobserveSelection, revalidateSet, releaseLock,
      revalidateMergePolicy, observeEffect,
    })).resolves.toMatchObject({ status: "blocked", reason: "protected-target-mismatch" });
    await expect(reconcileReservedNativeDeliveryMerge({
      planId: plan.planId, current, request, treeRoot: "/repo", remote: "origin",
    }, {
      host, stateStore: { publish: vi.fn() }, observeEffect,
    })).resolves.toMatchObject({ status: "blocked", reason: "protected-target-mismatch" });
    expect(host.submitNativeMerge).not.toHaveBeenCalled();
    expect(host.observeNativeMerge).not.toHaveBeenCalled();
    expect(reobserveSelection).not.toHaveBeenCalled();
    expect(revalidateSet).not.toHaveBeenCalled();
    expect(releaseLock).not.toHaveBeenCalled();
    expect(revalidateMergePolicy).not.toHaveBeenCalled();
    expect(observeEffect).not.toHaveBeenCalled();
  });

  it("retains pending, contradictory, partial, and unavailable native effects", async () => {
    const state = deliveryStateFixture(plan);
    const ids = state.members.slice(0, -1).map((member) => member.deliverableId);
    const snapshot = { target: state.target, members: state.members.slice(0, -1) };
    const effect = {
      providerId: "github", repository: "o/r", changeRequestId: "42", headSha: "b".repeat(40),
      baseRef: "delivery-target", targetRef: "refs/heads/delivery-target", strategy: "merge", mergePolicy: mergePolicy("o/r"),
    } as const;
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "operation-1", kind: "land", mode: "native", nativeArm: "linked-atomic",
      affectedDeliverableIds: ids,
      expectedStateRevision: 1, before: snapshot, requested: snapshot, effect,
    });
    if (reserved.status !== "reserved") throw new Error("fixture reservation failed");
    const submitting = beginNativeDeliverySubmission({ revision: 2, value: reserved.state }, "operation-1");
    if (submitting.status === "refused") throw new Error("fixture submission transition failed");
    const attached = attachDeliveryOperationEffectIdentity(
      { revision: 3, value: submitting.state }, "operation-1", { providerId: "github", effectId: "uuid-1" },
    );
    if (attached.status === "refused") throw new Error("fixture identity attachment failed");
    const record = { revision: 4, value: attached.state };
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
      { planId: plan.planId, current: record, request, treeRoot: "/repo", remote: "origin" },
      { host, stateStore, observeEffect: vi.fn() },
    )).resolves.toMatchObject({ status: "pending" });
    await expect(reconcileReservedNativeDeliveryMerge(
      {
        planId: plan.planId,
        current: record,
        request: { ...request, repository: "other/repo" },
        treeRoot: "/repo",
        remote: "origin",
      },
      { host, stateStore, observeEffect: vi.fn() },
    )).resolves.toMatchObject({ status: "blocked", reason: "reservation-mismatch" });
    host.observeNativeMerge.mockResolvedValue({ status: "merged" });
    await expect(reconcileReservedNativeDeliveryMerge(
      { planId: plan.planId, current: record, request, treeRoot: "/repo", remote: "origin" },
      { host, stateStore, observeEffect: vi.fn().mockResolvedValue({ outcome: "none-landed" }) },
    )).resolves.toMatchObject({ status: "blocked", reason: "ambiguous-result" });
    await expect(reconcileReservedNativeDeliveryMerge(
      { planId: plan.planId, current: record, request, treeRoot: "/repo", remote: "origin" },
      { host, stateStore, observeEffect: vi.fn().mockResolvedValue({ outcome: "partial-landed", affectedDeliverableIds: [ids[0]] }) },
    )).resolves.toMatchObject({ status: "blocked", reason: "partial-landed" });
    host.observeNativeMerge.mockResolvedValue({ status: "refused", reason: "unavailable" });
    await expect(reconcileReservedNativeDeliveryMerge(
      { planId: plan.planId, current: record, request, treeRoot: "/repo", remote: "origin" },
      { host, stateStore, observeEffect: vi.fn() },
    )).resolves.toMatchObject({ status: "blocked", reason: "unavailable" });
    expect(stateStore.publish).not.toHaveBeenCalled();

    host.observeNativeMerge.mockResolvedValue({ status: "failed" });
    await expect(reconcileReservedNativeDeliveryMerge(
      { planId: plan.planId, current: record, request, treeRoot: "/repo", remote: "origin" },
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
      baseRef: "delivery-target", targetRef: "refs/heads/delivery-target", strategy: "merge", mergePolicy: mergePolicy("o/r"),
    } as const;
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "operation-1", kind: "land", mode: "native", nativeArm: "linked-atomic",
      affectedDeliverableIds: ids,
      expectedStateRevision: 1, before: snapshot, requested: snapshot, effect,
    });
    if (reserved.status !== "reserved") throw new Error("fixture reservation failed");
    const submitting = beginNativeDeliverySubmission({ revision: 2, value: reserved.state }, "operation-1");
    if (submitting.status === "refused") throw new Error("fixture submission transition failed");
    const attached = attachDeliveryOperationEffectIdentity(
      { revision: 3, value: submitting.state }, "operation-1", { providerId: "github", effectId: "uuid-1" },
    );
    if (attached.status === "refused") throw new Error("fixture identity attachment failed");
    const record = { revision: 4, value: attached.state };
    const stateStore = { publish: vi.fn(async (_id, value) => ({
      status: "ok" as const,
      value: { revision: 5, value },
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
      { planId: plan.planId, current: record, request, treeRoot: "/repo", remote: "origin" },
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
      baseRef: "delivery-target", targetRef: "refs/heads/delivery-target", strategy: "merge", mergePolicy: mergePolicy("o/r"),
    } as const;
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "operation-1", kind: "land", mode: "native", nativeArm: "linked-atomic",
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
      revalidateSet: vi.fn().mockResolvedValue({ status: "ready" }),
      releaseLock: vi.fn().mockResolvedValue({ status: "released" }),
      revalidateMergePolicy: vi.fn().mockResolvedValue({ status: "exact" }),
      observeEffect: vi.fn().mockResolvedValue({ outcome: "all-landed", snapshot }),
    };
    await expect(submitReservedNativeDeliveryMerge({
      planId: plan.planId, current, operationId: "operation-1", request,
    }, dependencies)).resolves.toMatchObject({
      status: "applied",
      projected: { activeOperation: null },
    });
    expect(stateStore.publish).toHaveBeenCalledOnce();

    dependencies.observeEffect.mockResolvedValue({ outcome: "none-landed" });
    await expect(submitReservedNativeDeliveryMerge({
      planId: plan.planId, current, operationId: "operation-1", request,
    }, dependencies)).resolves.toMatchObject({ status: "blocked", reason: "submission-before-persist-unresolved" });
    expect(stateStore.publish).toHaveBeenCalledTimes(2);
  });

  it("publishes an atomic native landing only at final settlement", async () => {
    const state = deliveryStateFixture(plan);
    const members = state.members.slice(0, -1);
    const snapshot = { target: state.target, members };
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "operation-1",
      kind: "land",
      mode: "native",
      nativeArm: "linked-atomic",
      affectedDeliverableIds: members.map((member) => member.deliverableId),
      expectedStateRevision: 1,
      before: snapshot,
      requested: snapshot,
      effect: {
        providerId: "github",
        repository: "o/r",
        changeRequestId: "42",
        headSha: members.at(-1)!.coordinates!.head,
        baseRef: "delivery-target",
        targetRef: "refs/heads/delivery-target",
        strategy: "merge", mergePolicy: mergePolicy("o/r"),
      },
    });
    if (reserved.status !== "reserved") throw new Error("fixture reservation failed");
    const projected = { ...reserved.state, activeOperation: null };
    const stateStore = { publish: vi.fn(async (_id, value, expectedRevision) => expectedRevision === 2
      ? { status: "ok" as const, value: { revision: 3, value } }
      : { status: "refused" as const, reason: "version-conflict" as const }) };

    await expect(reconcileLinkedNativeDeliverySuffix({
      plan,
      before: { revision: 2, value: reserved.state },
      landed: { revision: 2, value: projected },
      repository: "o/r",
      protectedTargetRef: "refs/heads/delivery-target",
    }, {
      observeRequest: vi.fn(),
      observeRef: vi.fn(),
      proveContribution: vi.fn(),
      observeMemberRefCheckouts: vi.fn(),
      absorbTop: vi.fn(),
      publishTop: vi.fn(),
      rewriteLocalRef: vi.fn(),
      stateStore,
    })).resolves.toMatchObject({
      status: "applied",
      state: { revision: 3, value: { activeOperation: null } },
    });
    expect(stateStore.publish).toHaveBeenCalledOnce();
  });

  it("recovers a synchronous merged effect from exact facts without an effect identity", async () => {
    const state = deliveryStateFixture(plan);
    const members = state.members.slice(0, -1);
    const snapshot = { target: state.target, members };
    const last = members.at(-1)!;
    const request = {
      repository: "o/r",
      topChangeRequestId: "42",
      topHeadSha: last.coordinates!.head,
      mergeAction: "direct_merge" as const,
      mergeMethod: "merge" as const,
    };
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "operation-1",
      kind: "land",
      mode: "native",
      nativeArm: "linked-atomic",
      affectedDeliverableIds: members.map((member) => member.deliverableId),
      expectedStateRevision: 1,
      before: snapshot,
      requested: snapshot,
      effect: {
        providerId: "github",
        repository: request.repository,
        changeRequestId: request.topChangeRequestId,
        headSha: request.topHeadSha,
        baseRef: "delivery-target",
        targetRef: "refs/heads/delivery-target",
        strategy: "merge", mergePolicy: mergePolicy("o/r"),
      },
    });
    if (reserved.status !== "reserved") throw new Error("fixture reservation failed");
    const host = {
      submitNativeMerge: vi.fn(),
      observeNativeMerge: vi.fn(),
    };

    const submitting = beginNativeDeliverySubmission({ revision: 2, value: reserved.state }, "operation-1");
    if (submitting.status === "refused") throw new Error("fixture submission transition failed");
    await expect(reconcileReservedNativeDeliveryMerge({
      planId: plan.planId,
      current: { revision: 3, value: submitting.state },
      request,
      treeRoot: "/repo",
      remote: "origin",
    }, {
      host,
      stateStore: { publish: vi.fn() },
      observeEffect: vi.fn().mockResolvedValue({ outcome: "all-landed", snapshot }),
    })).resolves.toMatchObject({
      status: "applied",
      projected: { activeOperation: null },
    });
    expect(host.observeNativeMerge).not.toHaveBeenCalled();
  });

  it("recovers a prepared reservation as the exact submit-ready attended action without host access", async () => {
    const initial = deliveryStateFixture(plan);
    const state = {
      ...initial,
      members: initial.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(41 + index) },
      })),
    };
    const members = state.members.slice(0, -1);
    const snapshot = { target: state.target, members };
    const last = members.at(-1)!;
    const request = {
      repository: "o/r",
      topChangeRequestId: last.changeRequest!.changeRequestId,
      topHeadSha: last.coordinates!.head,
      mergeAction: "direct_merge" as const,
      mergeMethod: "merge" as const,
    };
    const reserved = reserveDeliveryOperation({ revision: 1, value: state }, plan, {
      operationId: "operation-1",
      kind: "land",
      mode: "native",
      nativeArm: "linked-atomic",
      affectedDeliverableIds: members.map((member) => member.deliverableId),
      expectedStateRevision: 1,
      before: snapshot,
      requested: snapshot,
      effect: {
        providerId: "github",
        repository: request.repository,
        changeRequestId: request.topChangeRequestId,
        headSha: request.topHeadSha,
        baseRef: "delivery-target",
        targetRef: "refs/heads/delivery-target",
        strategy: "merge",
        mergePolicy: mergePolicy("o/r"),
      },
    });
    if (reserved.status !== "reserved") throw new Error("fixture reservation failed");
    const host = { submitNativeMerge: vi.fn(), observeNativeMerge: vi.fn() };
    const observeEffect = vi.fn();
    const stateStore = { publish: vi.fn() };

    await expect(reconcileReservedNativeDeliveryMerge({
      planId: plan.planId,
      current: { revision: 2, value: reserved.state },
      request,
      treeRoot: "/repo",
      remote: "origin",
    }, { host, stateStore, observeEffect })).resolves.toEqual({
      status: "prepared",
      transition: "preserved",
      action: "delivery-native-land-submit",
      presentation: {
        operationId: "operation-1",
        members: members.map((member) => ({
          deliverableId: member.deliverableId,
          changeRequestId: member.changeRequest!.changeRequestId,
          headSha: member.coordinates!.head,
        })),
        consequence:
          "Atomically land the displayed complete non-terminal remainder. A residual race remains between final "
          + "observation and the host prefix snapshot.",
      },
      submitAction: {
        command: "arc delivery native land-submit -",
        input: {
          planId: plan.planId,
          operationId: "operation-1",
          request,
          treeRoot: "/repo",
          remote: "origin",
        },
      },
      recommendedActionText:
        "Present the preserved native landing consequence and exact member heads, then obtain integration approval "
        + "before invoking the submit action unchanged.",
    });
    expect(host.observeNativeMerge).not.toHaveBeenCalled();
    expect(observeEffect).not.toHaveBeenCalled();
    expect(stateStore.publish).not.toHaveBeenCalled();
  });

  it("adopts one externally retargeted singleton through proof and a direct CAS", async () => {
    const initial = deliveryStateFixture(plan);
    const bound = {
      ...initial,
      members: initial.members.map((member, index) => ({
        ...member,
        coordinates: member.coordinates === null ? null : {
          ...member.coordinates,
          base: index === 0
            ? initial.target!.coordinates!.head
            : initial.members[index - 1]!.coordinates!.head,
        },
        changeRequest: { providerId: "github", changeRequestId: String(41 + index) },
      })),
    };
    const first = bound.members[0]!;
    const beforeSnapshot = { target: bound.target, members: [first] };
    const effect = {
      providerId: "github", repository: "o/r", changeRequestId: "41", headSha: first.coordinates!.head,
      baseRef: "delivery-target", targetRef: "refs/heads/delivery-target", strategy: "merge", mergePolicy: mergePolicy("o/r"),
    } as const;
    const reserved = reserveDeliveryOperation({ revision: 1, value: bound }, plan, {
      operationId: "operation-1", kind: "land", mode: "native", nativeArm: "linked-single",
      affectedDeliverableIds: [first.deliverableId],
      expectedStateRevision: 1, before: beforeSnapshot, requested: beforeSnapshot, effect,
    });
    if (reserved.status !== "reserved") throw new Error("fixture reservation failed");
    const submitted = beginNativeDeliverySubmission({ revision: 2, value: reserved.state }, "operation-1");
    if (submitted.status !== "begun") throw new Error("fixture submission transition failed");
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
    const stateStore = { publish: vi.fn(async (_id, value, expectedRevision) => expectedRevision === revision
      ? { status: "ok" as const, value: { revision: revision += 1, value } }
      : { status: "refused" as const, reason: "version-conflict" as const }) };
    const next = landed.members[1]!;
    const moved = { head: "a".repeat(40), tree: "b".repeat(40) };
    const proof = vi.fn().mockResolvedValue({ status: "accepted", proof: "mechanical-reapply" });
    await expect(reconcileLinkedNativeDeliverySuffix({
      plan,
      before: { revision: 3, value: submitted.state },
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
      observeMemberRefCheckouts: vi.fn().mockResolvedValue({ status: "observed", checkouts: [] }),
      absorbTop: vi.fn().mockResolvedValue({
        status: "absorbed",
        head: "c".repeat(40),
        tree: "f".repeat(40),
      }),
      publishTop: vi.fn().mockResolvedValue({ status: "published" }),
      rewriteLocalRef: vi.fn().mockResolvedValue({ status: "rewritten" }),
      stateStore,
    })).resolves.toMatchObject({ status: "applied", state: { value: { activeOperation: null } } });
    expect(proof).toHaveBeenCalledOnce();
    // Three: the member record before the rewrite loop, the absorbed top's own record, then the settle.
    expect(stateStore.publish).toHaveBeenCalledTimes(3);
  });
});
