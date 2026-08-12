import { describe, expect, it, vi } from "vitest";

import {
  applyDeliveryLanding,
  prepareDeliveryLanding,
  reconcileDeliveryExecution,
} from "../../../src/lib/delivery/landing.js";
import type { DeliveryPositionFactsV1 } from "../../../src/lib/delivery/position.js";
import type { DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import { deliveryPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

function boundState() {
  const plan = deliveryPlanFixture();
  const state = deliveryStateFixture(plan);
  return {
    plan,
    state: {
      ...state,
      members: state.members.map((member, index) => index === 0 ? {
        ...member,
        changeRequest: { providerId: "github", changeRequestId: "401" },
      } : member),
    },
  };
}

function facts(state: DeliveryStateV1): DeliveryPositionFactsV1 {
  return {
    target: state.target,
    members: state.members.map((member) => ({
      deliverableId: member.deliverableId,
      ref: member.ref,
      changeRequest: member.changeRequest,
      coordinates: member.coordinates,
    })),
    landedDeliverableIds: [],
  };
}

function boundaries(state: DeliveryStateV1) {
  const member = state.members[0]!;
  let merged = false;
  const observeRequest = vi.fn(async () => ({
    status: "observed" as const,
    request: {
      binding: member.changeRequest!,
      repository: "andrewRCr/arc-framework",
      headRepository: "andrewRCr/arc-framework",
      headRef: member.ref!.replace("refs/heads/", ""),
      headSha: member.coordinates!.head,
      baseRef: "main",
      state: merged ? "merged" as const : "open" as const,
      draft: true,
    },
  }));
  const mergeRequest = vi.fn(async () => {
    merged = true;
    return { status: "submitted" as const };
  });
  const host = {
    observeRequest: vi.fn(async () => ({ status: "absent" as const })),
    openRequest: vi.fn(async () => ({ status: "submitted" as const })),
    readRequest: observeRequest,
    mergeRequest,
    observeTarget: vi.fn(async () => ({
      status: "observed" as const,
      coordinates: { head: "d".repeat(40), tree: "e".repeat(40) },
    })),
  };
  return {
    host,
    mergeRequest,
    readiness: { assess: vi.fn(async () => ({ status: "ready" as const, settledReviewState: "settled" })) },
    lock: { release: vi.fn(async () => ({ status: "not-configured" as const })) },
    observation: {
      observeSelection: vi.fn(async () => ({
        status: "observed" as const,
        facts: facts(state),
        snapshot: {
          target: state.target,
          members: [{
            deliverableId: member.deliverableId,
            ref: member.ref,
            changeRequest: member.changeRequest,
            coordinates: member.coordinates,
          }],
        },
      })),
      proveLandedContribution: vi.fn(async () => ({ status: "accepted" as const })),
    },
  };
}

describe("delivery landing", () => {
  it("prepares one exact non-terminal member without merging and always runs readiness", async () => {
    const { plan, state } = boundState();
    const deps = boundaries(state);
    const persisted: DeliveryStateV1[] = [];
    const result = await prepareDeliveryLanding({
      plan,
      current: { revision: 7, value: state },
      facts: facts(state),
      selectedDeliverableId: state.members[0]!.deliverableId,
      repository: "andrewRCr/arc-framework",
      baseRef: "refs/heads/main",
      targetRef: "refs/heads/main",
      mergeStrategy: "squash",
      releaseMergeLock: false,
      stateStore: {
        publish: async (_planId, value) => {
          persisted.push(value);
          return { status: "ok" as const, value: { revision: 8, value } };
        },
      },
      host: deps.host,
      readiness: deps.readiness,
    });
    expect(result.status).toBe("prepared");
    expect(deps.readiness.assess).toHaveBeenCalledOnce();
    expect(deps.mergeRequest).not.toHaveBeenCalled();
    expect(persisted[0]?.activeOperation?.kind).toBe("land");
  });

  it("refuses terminal, out-of-order, and non-unique request selections", async () => {
    const { plan, state } = boundState();
    const deps = boundaries(state);
    const common = {
      plan,
      current: { revision: 7, value: state },
      facts: facts(state),
      repository: "andrewRCr/arc-framework",
      baseRef: "refs/heads/main",
      targetRef: "refs/heads/main",
      mergeStrategy: "merge" as const,
      releaseMergeLock: false,
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
      host: deps.host,
      readiness: deps.readiness,
    };
    await expect(prepareDeliveryLanding({
      ...common,
      selectedDeliverableId: state.members[1]!.deliverableId,
    })).resolves.toEqual({ status: "refused" });
    await expect(prepareDeliveryLanding({
      ...common,
      host: {
        ...deps.host,
        readRequest: async () => ({ status: "refused" as const, reason: "multiple" as const }),
      },
      selectedDeliverableId: state.members[0]!.deliverableId,
    })).resolves.toEqual({ status: "refused" });
    expect(deps.mergeRequest).not.toHaveBeenCalled();
  });

  it("reobserves after approval, performs one head-matched merge, and records the actual target", async () => {
    const { plan, state } = boundState();
    const deps = boundaries(state);
    let reservedRecord: { revision: number; value: DeliveryStateV1 } | null = null;
    const prepared = await prepareDeliveryLanding({
      plan,
      current: { revision: 7, value: state },
      facts: facts(state),
      selectedDeliverableId: state.members[0]!.deliverableId,
      repository: "andrewRCr/arc-framework",
      baseRef: "refs/heads/main",
      targetRef: "refs/heads/main",
      mergeStrategy: "rebase",
      releaseMergeLock: false,
      stateStore: {
        publish: async (_planId, value) => {
          reservedRecord = { revision: 8, value };
          return { status: "ok" as const, value: reservedRecord };
        },
      },
      host: deps.host,
      readiness: deps.readiness,
    });
    if (prepared.status !== "prepared" || reservedRecord === null) throw new Error("fixture must prepare");
    const applied = await applyDeliveryLanding({
      plan,
      current: reservedRecord,
      approved: prepared.presentation,
      stateStore: {
        publish: async (_planId, value) => ({
          status: "ok" as const,
          value: { revision: 9, value },
        }),
      },
      host: deps.host,
      readiness: deps.readiness,
      lock: deps.lock,
      observation: deps.observation,
    });
    expect(applied.status).toBe("landed");
    expect(deps.mergeRequest).toHaveBeenCalledOnce();
    if (applied.status === "landed") {
      expect(applied.state.value.target).toEqual({
        ref: "refs/heads/main",
        coordinates: { head: "d".repeat(40), tree: "e".repeat(40) },
      });
      expect(applied.state.value.activeOperation).toBeNull();
    }
  });

  it("blocks approved identity or fresh readiness drift before any merge", async () => {
    const { plan, state } = boundState();
    const deps = boundaries(state);
    const records: Array<{ revision: number; value: DeliveryStateV1 }> = [];
    const prepared = await prepareDeliveryLanding({
      plan,
      current: { revision: 7, value: state },
      facts: facts(state),
      selectedDeliverableId: state.members[0]!.deliverableId,
      repository: "andrewRCr/arc-framework",
      baseRef: "refs/heads/main",
      targetRef: "refs/heads/main",
      mergeStrategy: "merge",
      releaseMergeLock: true,
      stateStore: { publish: async (_planId, value) => {
        const record = { revision: 8, value };
        records.push(record);
        return { status: "ok" as const, value: record };
      } },
      host: deps.host,
      readiness: deps.readiness,
    });
    const [current] = records;
    if (prepared.status !== "prepared" || current === undefined) throw new Error("fixture must prepare");
    await expect(applyDeliveryLanding({
      plan,
      current,
      approved: { ...prepared.presentation, head: "f".repeat(40) },
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
      host: deps.host,
      readiness: deps.readiness,
      lock: deps.lock,
      observation: deps.observation,
    })).resolves.toEqual({ status: "refused" });
    expect(deps.mergeRequest).not.toHaveBeenCalled();

    await expect(applyDeliveryLanding({
      plan,
      current,
      approved: prepared.presentation,
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
      host: deps.host,
      readiness: { assess: async () => ({ status: "refused" as const }) },
      lock: deps.lock,
      observation: deps.observation,
    })).resolves.toEqual({ status: "refused" });
    expect(deps.mergeRequest).not.toHaveBeenCalled();
  });

  it("reobserves after lock release and never adopts target movement without the matching merge", async () => {
    const { plan, state } = boundState();
    const deps = boundaries(state);
    let current: { revision: number; value: DeliveryStateV1 } | null = null;
    const prepared = await prepareDeliveryLanding({
      plan,
      current: { revision: 7, value: state },
      facts: facts(state),
      selectedDeliverableId: state.members[0]!.deliverableId,
      repository: "andrewRCr/arc-framework",
      baseRef: "refs/heads/main",
      targetRef: "refs/heads/main",
      mergeStrategy: "merge",
      releaseMergeLock: true,
      stateStore: { publish: async (_planId, value) => {
        current = { revision: 8, value };
        return { status: "ok" as const, value: current };
      } },
      host: deps.host,
      readiness: deps.readiness,
    });
    if (prepared.status !== "prepared" || current === null) throw new Error("fixture must prepare");
    let observations = 0;
    await expect(applyDeliveryLanding({
      plan,
      current,
      approved: prepared.presentation,
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
      host: deps.host,
      readiness: deps.readiness,
      lock: deps.lock,
      observation: {
        ...deps.observation,
        observeSelection: async () => {
          observations += 1;
          return observations === 1
            ? deps.observation.observeSelection()
            : { status: "refused" as const };
        },
      },
    })).resolves.toEqual({ status: "refused" });
    expect(deps.lock.release).toHaveBeenCalledOnce();
    expect(deps.mergeRequest).not.toHaveBeenCalled();

    const noMergedRequest = boundaries(state);
    await expect(applyDeliveryLanding({
      plan,
      current,
      approved: prepared.presentation,
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
      host: { ...noMergedRequest.host, mergeRequest: async () => ({ status: "submitted" as const }) },
      readiness: noMergedRequest.readiness,
      lock: noMergedRequest.lock,
      observation: noMergedRequest.observation,
    })).resolves.toEqual({ status: "refused" });
  });

  it("retains attended authorization out of state and routes nonapplication back through prepare", async () => {
    const { plan, state } = boundState();
    const deps = boundaries(state);
    const persisted: Array<{ revision: number; value: DeliveryStateV1 }> = [];
    const prepared = await prepareDeliveryLanding({
      plan,
      current: { revision: 7, value: state },
      facts: facts(state),
      selectedDeliverableId: state.members[0]!.deliverableId,
      repository: "andrewRCr/arc-framework",
      baseRef: "refs/heads/main",
      targetRef: "refs/heads/main",
      mergeStrategy: "merge",
      releaseMergeLock: false,
      stateStore: { publish: async (_planId, value) => {
        const current = { revision: 8, value };
        persisted.push(current);
        return { status: "ok" as const, value: current };
      } },
      host: deps.host,
      readiness: deps.readiness,
    });
    expect(prepared.status).toBe("prepared");
    const [current] = persisted;
    if (current === undefined) throw new Error("fixture must persist");
    await expect(reconcileDeliveryExecution({
      planId: plan.planId,
      current,
      observation: { observe: async () => ({ status: "observed" as const, value: { outcome: "not-applied" } }) },
      stateStore: { publish: async () => { throw new Error("must retain reservation"); } },
    })).resolves.toEqual({
      status: "retryable",
      guidance: "Prepare the exact landing again and re-fire its integration interlock.",
    });
    expect(JSON.stringify(current.value)).not.toMatch(/approval|reviewVerdict/u);
  });

  it("blocks unavailable recovery evidence and retains the reservation", async () => {
    const { plan, state } = boundState();
    const deps = boundaries(state);
    let current: { revision: number; value: DeliveryStateV1 } | null = null;
    await prepareDeliveryLanding({
      plan,
      current: { revision: 7, value: state },
      facts: facts(state),
      selectedDeliverableId: state.members[0]!.deliverableId,
      repository: "andrewRCr/arc-framework",
      baseRef: "refs/heads/main",
      targetRef: "refs/heads/main",
      mergeStrategy: "merge",
      releaseMergeLock: false,
      stateStore: { publish: async (_planId, value) => {
        current = { revision: 8, value };
        return { status: "ok" as const, value: current };
      } },
      host: deps.host,
      readiness: deps.readiness,
    });
    if (current === null) throw new Error("fixture must reserve");
    await expect(reconcileDeliveryExecution({
      planId: plan.planId,
      current,
      observation: { observe: async () => ({ status: "refused" as const }) },
      stateStore: { publish: async () => { throw new Error("must retain reservation"); } },
    })).resolves.toEqual({
      status: "blocked",
      guidance: "The reserved operation result is unavailable; retain the reservation.",
    });
  });
});
