import { describe, expect, it, vi } from "vitest";

import {
  applyDeliveryLanding,
  DeliveryRecoveryResultV1Schema,
  DeliveryRecoveryRerunV1Schema,
  prepareDeliveryLanding,
  reconcileDeliveryExecution,
} from "../../../src/lib/delivery/landing.js";
import {
  attachDeliveryOperationEffectIdentity,
  reserveDeliveryOperation,
} from "../../../src/lib/delivery/operation.js";
import type { DeliveryPositionFactsV1 } from "../../../src/lib/delivery/position.js";
import type { DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import {
  deliveryPlanFixture,
  deliveryThreeMemberStackPlanFixture,
} from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

const mergePolicyFor = (repository: string) => ({
  repository,
  stackPosition: "intermediate",
  method: "merge",
  allowedMethods: ["merge"] as Array<"merge" | "rebase" | "squash">,
  policyFingerprint: `sha256:${"a".repeat(64)}`,
} as const);
const mergePolicy = mergePolicyFor("andrewRCr/arc-framework");

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
  const mergeResult = { head: "d".repeat(40), tree: "e".repeat(40) };
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
      mergeCommitSha: merged ? mergeResult.head : null,
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
      coordinates: { head: "f".repeat(40), tree: "a".repeat(40) },
    })),
  };
  return {
    host,
    mergeRequest,
    readiness: { assess: vi.fn(async () => ({ status: "ready" as const, settledReviewState: "settled" })) },
    lock: { release: vi.fn(async () => ({ status: "not-configured" as const })) },
    observation: {
      revalidateMergePolicy: vi.fn(async () => ({ status: "exact" as const })),
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
      observeLandedResult: vi.fn(async () => ({
        predecessor: state.target!.coordinates!,
        member: mergeResult,
      })),
      proveLandedContribution: vi.fn(async () => ({ status: "accepted" as const, proof: "tree-equality" as const })),
    },
  };
}

async function preparedBoundLanding() {
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
    mergePolicy,
    releaseMergeLock: false,
    stateStore: { publish: async (_planId, value) => {
      const current = { revision: 8, value };
      records.push(current);
      return { status: "ok" as const, value: current };
    } },
    host: deps.host,
    readiness: deps.readiness,
  });
  const current = records[0];
  if (prepared.status !== "prepared" || current === undefined) throw new Error("fixture must prepare");
  return { plan, state, deps, prepared, current };
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
      mergePolicy,
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
    expect(persisted[0]?.activeOperation).toMatchObject({
      kind: "land",
      effect: { strategy: "merge", mergePolicy },
    });
  });

  it("refuses terminal and non-unique request selections", async () => {
    const { plan, state } = boundState();
    const deps = boundaries(state);
    const common = {
      plan,
      current: { revision: 7, value: state },
      facts: facts(state),
      repository: "andrewRCr/arc-framework",
      baseRef: "refs/heads/main",
      targetRef: "refs/heads/main",
      mergePolicy,
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

  it("records the exact merge result when the protected target advances after landing", async () => {
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
      mergePolicy,
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
      expect(applied.state.value.members[0]!.coordinates).toEqual(state.members[0]!.coordinates);
    }
  });

  it("does not consume a native reservation through sequential landing", async () => {
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
      mergePolicy,
      releaseMergeLock: false,
      stateStore: { publish: async (_planId, value) => {
        const record = { revision: 8, value };
        records.push(record);
        return { status: "ok" as const, value: record };
      } },
      host: deps.host,
      readiness: deps.readiness,
    });
    const current = records[0];
    if (prepared.status !== "prepared" || current === undefined
      || current.value.activeOperation?.kind !== "land") throw new Error("fixture must prepare");
    const native = {
      ...current,
      value: {
        ...current.value,
        activeOperation: { ...current.value.activeOperation, mode: "native" as const },
      },
    };
    await expect(applyDeliveryLanding({
      plan,
      current: native,
      approved: prepared.presentation,
      stateStore: { publish: vi.fn() },
      host: deps.host,
      readiness: deps.readiness,
      lock: deps.lock,
      observation: deps.observation,
    })).resolves.toEqual({ status: "refused", reason: "landing-refused" });
    expect(deps.mergeRequest).not.toHaveBeenCalled();
  });

  it("clears an exactly unapplied stacked-member refusal into canonical native selection", async () => {
    const { plan, deps, prepared, current } = await preparedBoundLanding();
    const writes: DeliveryStateV1[] = [];
    await expect(applyDeliveryLanding({
      plan,
      current,
      approved: prepared.presentation,
      stateStore: { publish: async (_planId, value) => {
        writes.push(value);
        return { status: "ok" as const, value: { revision: 9, value } };
      } },
      host: {
        ...deps.host,
        mergeRequest: async () => ({ status: "refused", reason: "native-stack-required" }),
      },
      readiness: deps.readiness,
      lock: deps.lock,
      observation: deps.observation,
    })).resolves.toEqual({
      status: "retryable",
      transition: "cleared",
      action: "delivery-native-land-select",
      selector: {
        planId: plan.planId,
        operationId: current.value.activeOperation!.operationId,
        affectedDeliverableIds: current.value.activeOperation!.affectedDeliverableIds,
        operationKind: "land",
        mode: "sequential",
      },
      recommendedActionText:
        "Rerun `arc delivery native land-select`; it will freshly observe the canonical remaining stack.",
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.activeOperation).toBeNull();
    expect(current.value.activeOperation).not.toBeNull();
  });

  it("retains a stacked-member refusal when exact non-application is ambiguous", async () => {
    const { plan, deps, prepared, current } = await preparedBoundLanding();
    const exact = await deps.observation.observeSelection();
    let observations = 0;
    const persisted: DeliveryStateV1[] = [];

    await expect(applyDeliveryLanding({
      plan,
      current,
      approved: prepared.presentation,
      stateStore: { publish: async (_planId, value) => {
        persisted.push(value);
        return { status: "ok" as const, value: { revision: 9, value } };
      } },
      host: {
        ...deps.host,
        mergeRequest: async () => ({ status: "refused", reason: "native-stack-required" }),
      },
      readiness: deps.readiness,
      lock: deps.lock,
      observation: {
        ...deps.observation,
        observeSelection: async () => ++observations < 3
          ? exact
          : { status: "refused" as const },
      },
    })).resolves.toEqual({
      status: "blocked",
      reason: "operation-result-ambiguous",
      recommendedActionText:
        "Retain the sequential reservation; the semantic native refusal could not be proved not applied.",
    });
    expect(persisted).toHaveLength(0);
    expect(current.value.activeOperation).not.toBeNull();
  });

  it("retains a stacked-member refusal when the version-checked clear collides", async () => {
    const { plan, deps, prepared, current } = await preparedBoundLanding();

    await expect(applyDeliveryLanding({
      plan,
      current,
      approved: prepared.presentation,
      stateStore: {
        publish: async () => ({ status: "refused" as const, reason: "version-conflict" as const }),
      },
      host: {
        ...deps.host,
        mergeRequest: async () => ({ status: "refused", reason: "native-stack-required" }),
      },
      readiness: deps.readiness,
      lock: deps.lock,
      observation: deps.observation,
    })).resolves.toEqual({
      status: "blocked",
      reason: "retry-state-persistence-failed",
      recommendedActionText:
        "Retain and reconcile the sequential reservation; native-selection transition persistence failed.",
    });
    expect(current.value.activeOperation).not.toBeNull();
  });

  it("refuses mismatched post-merge request, merge result, or contribution evidence", async () => {
    const { plan, state } = boundState();
    const preparedDeps = boundaries(state);
    let current: { revision: number; value: DeliveryStateV1 } | null = null;
    const prepared = await prepareDeliveryLanding({
      plan,
      current: { revision: 7, value: state },
      facts: facts(state),
      selectedDeliverableId: state.members[0]!.deliverableId,
      repository: "andrewRCr/arc-framework",
      baseRef: "refs/heads/main",
      targetRef: "refs/heads/main",
      mergePolicy,
      releaseMergeLock: false,
      stateStore: { publish: async (_planId, value) => {
        current = { revision: 8, value };
        return { status: "ok" as const, value: current };
      } },
      host: preparedDeps.host,
      readiness: preparedDeps.readiness,
    });
    if (prepared.status !== "prepared" || current === null) throw new Error("fixture must prepare");

    const changedRequest = boundaries(state);
    await expect(applyDeliveryLanding({
      plan,
      current,
      approved: prepared.presentation,
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
      host: {
        ...changedRequest.host,
        readRequest: async () => {
          const observed = await changedRequest.host.readRequest();
          return observed.status === "observed" && observed.request.state === "merged"
            ? { ...observed, request: { ...observed.request, headSha: "f".repeat(40) } }
            : observed;
        },
      },
      readiness: changedRequest.readiness,
      lock: changedRequest.lock,
      observation: changedRequest.observation,
    })).resolves.toEqual({ status: "refused", reason: "landing-refused" });

    const missingResult = boundaries(state);
    await expect(applyDeliveryLanding({
      plan,
      current,
      approved: prepared.presentation,
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
      host: missingResult.host,
      readiness: missingResult.readiness,
      lock: missingResult.lock,
      observation: { ...missingResult.observation, observeLandedResult: async () => null },
    })).resolves.toEqual({ status: "refused", reason: "landing-refused" });

    const refusedContribution = boundaries(state);
    await expect(applyDeliveryLanding({
      plan,
      current,
      approved: prepared.presentation,
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
      host: refusedContribution.host,
      readiness: refusedContribution.readiness,
      lock: refusedContribution.lock,
      observation: {
        ...refusedContribution.observation,
        proveLandedContribution: async () => ({
          status: "refused" as const,
          reason: "contribution-conflicted" as const,
          paths: ["shared.txt"],
        }),
      },
    })).resolves.toEqual({
      status: "refused",
      reason: "contribution-conflicted",
      paths: ["shared.txt"],
    });
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
      mergePolicy,
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
    const policyMoved = boundaries(state);
    await expect(applyDeliveryLanding({
      plan,
      current,
      approved: prepared.presentation,
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
      host: policyMoved.host,
      readiness: policyMoved.readiness,
      lock: policyMoved.lock,
      observation: {
        ...policyMoved.observation,
        revalidateMergePolicy: async () => ({ status: "refused" as const }),
      },
    })).resolves.toEqual({ status: "refused", reason: "landing-refused" });
    expect(policyMoved.mergeRequest).not.toHaveBeenCalled();

    await expect(applyDeliveryLanding({
      plan,
      current,
      approved: { ...prepared.presentation, head: "f".repeat(40) },
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
      host: deps.host,
      readiness: deps.readiness,
      lock: deps.lock,
      observation: deps.observation,
    })).resolves.toEqual({ status: "refused", reason: "landing-refused" });
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
    })).resolves.toEqual({ status: "refused", reason: "landing-refused" });
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
      mergePolicy,
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
    })).resolves.toEqual({ status: "refused", reason: "landing-refused" });
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
    })).resolves.toEqual({ status: "refused", reason: "landing-refused" });
  });

  it("clears a proven non-applied reservation and routes attended landing back through prepare", async () => {
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
      mergePolicy,
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
    const retryStates: DeliveryStateV1[] = [];
    await expect(reconcileDeliveryExecution({
      planId: plan.planId,
      current,
      observation: { observe: async () => ({ status: "observed" as const, value: { outcome: "not-applied" } }) },
      stateStore: { publish: async (_planId, value) => {
        retryStates.push(value);
        return { status: "ok" as const, value: { revision: current.revision + 1, value } };
      } },
    })).resolves.toEqual({
      status: "retryable",
      transition: "cleared",
      action: "delivery-land-prepare",
      selector: {
        planId: plan.planId,
        operationKind: "land",
        operationId: current.value.activeOperation!.operationId,
        affectedDeliverableIds: current.value.activeOperation!.affectedDeliverableIds,
        mode: "sequential",
      },
      recommendedActionText:
        "Rerun `arc delivery land prepare` for the exact sequential landing reservation subject.",
    });
    expect(retryStates).toHaveLength(1);
    expect(retryStates[0]?.activeOperation).toBeNull();
    expect(JSON.stringify(current.value)).not.toMatch(/approval|reviewVerdict/u);
  });

  it("returns the exact landed member for teardown after applied sequential recovery", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const first = {
      ...fixture.members[0]!,
      changeRequest: { providerId: "github", changeRequestId: "401" },
    };
    const state = { ...fixture, members: [first, ...fixture.members.slice(1)] };
    const before = { target: state.target, members: [first] };
    const effect = {
      providerId: "github",
      repository: "andrewRCr/arc-framework",
      changeRequestId: "401",
      headSha: first.coordinates!.head,
      baseRef: "main",
      targetRef: "refs/heads/main",
      strategy: "merge" as const,
      mergePolicy,
    };
    const reserved = reserveDeliveryOperation({ revision: 7, value: state }, plan, {
      operationId: "operation-applied-sequential",
      kind: "land",
      mode: "sequential",
      affectedDeliverableIds: [first.deliverableId],
      expectedStateRevision: 7,
      before,
      requested: { ...before, target: { ...state.target!, ref: "refs/heads/main" } },
      effect,
    });
    if (reserved.status !== "reserved") throw new Error("fixture must reserve sequential landing");
    const landed = { head: "d".repeat(40), tree: "e".repeat(40) };

    const result = await reconcileDeliveryExecution({
      planId: plan.planId,
      current: { revision: 8, value: reserved.state },
      observation: { observe: async () => ({
        status: "observed" as const,
        value: {
          outcome: "applied" as const,
          observation: {
            kind: "land" as const,
            effect,
            outcome: "applied" as const,
            snapshot: {
              target: { ref: "refs/heads/main", coordinates: landed },
              members: [first],
            },
          },
        },
      }) },
      stateStore: { publish: async (_planId, value) => ({
        status: "ok" as const,
        value: { revision: 9, value },
      }) },
    });

    expect(DeliveryRecoveryResultV1Schema.parse(result)).toMatchObject({
      status: "applied",
      nextAction: "teardown-member",
      selectedDeliverableId: first.deliverableId,
      state: { revision: 9, value: { activeOperation: null } },
    });
  });

  it("maps every exact non-application to one typed rerun and its preserve-or-clear transition", async () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const member = state.members[0]!;
    const before = { target: state.target, members: [member] };
    const requested = {
      ...before,
      members: [{
        ...member,
        coordinates: member.coordinates === null
          ? null
          : { ...member.coordinates, head: "e".repeat(40) },
      }],
    };
    const cases = [
      {
        kind: "publish", action: "delivery-publish", transition: "preserved",
        text: "Rerun `arc delivery publish` for the exact publish reservation subject.",
      },
      {
        kind: "materialize", action: "delivery-publish", transition: "cleared",
        text: "Rerun `arc delivery publish` for the exact materialization reservation subject.",
      },
      {
        kind: "rewrite", mode: "review-fix", action: "delivery-rematerialize", transition: "cleared",
        text: "Rerun `arc delivery rematerialize` for the exact review-fix reservation subject.",
      },
      {
        kind: "rewrite", mode: "selected-change", action: "delivery-review-fix-publish", transition: "cleared",
        text: "Rerun `arc delivery review-fix publish` for the exact selected-member reservation subject.",
      },
      {
        kind: "rewrite", mode: "provider-adoption", action: "delivery-refresh-adopt", transition: "preserved",
        text: "Rerun `arc delivery refresh adopt` for the exact provider-adoption reservation subject.",
      },
      {
        kind: "rewrite", mode: "provider-refresh", action: "delivery-refresh-execute", transition: "preserved",
        text: "Rerun `arc delivery refresh execute` for the exact provider-refresh reservation subject.",
      },
      {
        kind: "land", mode: "sequential", action: "delivery-land-prepare", transition: "cleared",
        text: "Rerun `arc delivery land prepare` for the exact sequential landing reservation subject.",
      },
      {
        kind: "land", mode: "native", action: "delivery-native-land-select", transition: "cleared",
        text: "Rerun `arc delivery native land-select` for the exact native landing reservation subject.",
      },
      {
        kind: "teardown", action: "delivery-teardown", transition: "preserved",
        text: "Rerun `arc delivery teardown` for the exact teardown reservation subject.",
      },
      {
        kind: "top-remedy", action: "delivery-top-remedy", transition: "cleared",
        text: "Rerun `arc delivery top-remedy` for the exact top-remedy reservation subject.",
      },
    ] as const;
    for (const entry of cases) {
      const operationId = `operation-${entry.kind}-${"mode" in entry ? entry.mode : "exact"}`;
      const common = {
        operationId,
        kind: entry.kind,
        affectedDeliverableIds: [member.deliverableId],
        expectedStateRevision: 7,
        before,
        requested,
      };
      const request = entry.kind === "publish"
        ? {
            ...common,
            kind: "publish" as const,
            effect: {
              providerId: "github", repository: "o/r", headRef: "member-1",
              headSha: "4".repeat(40), baseRef: "main", draft: true,
            },
          }
        : entry.kind === "land"
          ? {
              ...common,
              kind: "land" as const,
              mode: entry.mode,
              effect: {
                providerId: "github", repository: "o/r", changeRequestId: "41",
                headSha: "4".repeat(40), baseRef: "main", targetRef: "refs/heads/main",
                strategy: "merge" as const,
                mergePolicy: mergePolicyFor("o/r"),
              },
            }
          : entry.kind === "rewrite"
            ? { ...common, kind: "rewrite" as const, mode: entry.mode }
            : entry.kind === "top-remedy"
              ? {
                  ...common,
                  kind: "top-remedy" as const,
                  effect: {
                    providerId: "github", repository: "o/r", changeRequestId: "42",
                    headRef: "member-2", headSha: "5".repeat(40), triggerRef: "refs/heads/member-1",
                    triggerHeadSha: "4".repeat(40), fromBaseRef: "member-1", protectedBaseRef: "main",
                    action: "retarget" as const,
                  },
                }
              : entry.kind === "teardown"
                ? { ...common, kind: "teardown" as const, mode: "member" as const, candidateHeads: [] }
              : common;
      const reserved = reserveDeliveryOperation({ revision: 7, value: state }, plan, request);
      if (reserved.status !== "reserved") throw new Error(`fixture must reserve ${entry.kind}`);
      const attached = entry.kind === "land" && entry.mode === "native"
        ? attachDeliveryOperationEffectIdentity(
            { revision: 8, value: reserved.state },
            operationId,
            { providerId: "github", effectId: "native-effect-1" },
          )
        : null;
      if (attached?.status === "refused") throw new Error("fixture must attach native effect identity");
      const current = attached === null
        ? { revision: 8, value: reserved.state }
        : { revision: 9, value: attached.state };
      const writes: DeliveryStateV1[] = [];
      const hostAssigned = entry.kind === "publish" || entry.kind === "land" || entry.kind === "top-remedy";
      const result = await reconcileDeliveryExecution({
        planId: plan.planId,
        current,
        observation: { observe: async () => ({
          status: "observed" as const,
          value: hostAssigned || entry.kind === "teardown" ? { outcome: "not-applied" } : before,
        }) },
        stateStore: { publish: async (_planId, value) => {
          writes.push(value);
          return { status: "ok" as const, value: { revision: 9, value } };
        } },
      });
      expect(DeliveryRecoveryRerunV1Schema.parse(result)).toEqual({
        status: "retryable",
        transition: entry.transition,
        action: entry.action,
        selector: {
          planId: plan.planId,
          operationKind: entry.kind,
          operationId,
          affectedDeliverableIds: [member.deliverableId],
          ...(entry.kind === "rewrite" || entry.kind === "land" ? { mode: entry.mode } : {}),
        },
        recommendedActionText: entry.text,
      });
      expect(writes).toHaveLength(entry.transition === "cleared" ? 1 : 0);
      if (writes.length === 1) expect(writes[0]?.activeOperation).toBeNull();
      else expect(current.value.activeOperation).not.toBeNull();
    }
  });

  it("leaves closeout-residue reservations to the closeout verb", async () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const members = state.members;
    const snapshot = { target: state.target, members };
    const reserved = reserveDeliveryOperation({ revision: 7, value: state }, plan, {
      operationId: "operation-closeout-residue",
      kind: "teardown",
      mode: "closeout-residue",
      candidateHeads: members.map(({ deliverableId }) => ({ deliverableId, head: null })),
      affectedDeliverableIds: members.map(({ deliverableId }) => deliverableId),
      expectedStateRevision: 7,
      before: snapshot,
      requested: snapshot,
    });
    if (reserved.status !== "reserved") throw new Error("fixture must reserve closeout residue");
    const observe = vi.fn();
    const publish = vi.fn();

    await expect(reconcileDeliveryExecution({
      planId: plan.planId,
      current: { revision: 8, value: reserved.state },
      observation: { observe },
      stateStore: { publish },
    })).resolves.toEqual({
      status: "blocked",
      reason: "closeout-residue-owned-by-closeout",
      recommendedActionText:
        "Rerun `arc delivery closeout` with the exact work-unit, repository, and remote inputs.",
    });
    expect(observe).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("does not clear an identity-less native landing from a none-landed observation", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const members = state.members.slice(0, -1);
    const snapshot = { target: state.target, members };
    const reserved = reserveDeliveryOperation({ revision: 7, value: state }, plan, {
      operationId: "operation-native-without-identity",
      kind: "land",
      mode: "native",
      affectedDeliverableIds: members.map((member) => member.deliverableId),
      expectedStateRevision: 7,
      before: snapshot,
      requested: snapshot,
      effect: {
        providerId: "github",
        repository: "owner/repo",
        changeRequestId: "102",
        headSha: members.at(-1)!.coordinates!.head,
        baseRef: "main",
        targetRef: "refs/heads/main",
        strategy: "merge",
        mergePolicy: mergePolicyFor("owner/repo"),
      },
    });
    if (reserved.status !== "reserved") throw new Error("fixture must reserve native landing");
    const publish = vi.fn(async (_planId, value: DeliveryStateV1) => ({
      status: "ok" as const,
      value: { revision: 9, value },
    }));

    await expect(reconcileDeliveryExecution({
      planId: plan.planId,
      current: { revision: 8, value: reserved.state },
      observation: {
        observe: async () => ({ status: "observed" as const, value: { outcome: "not-applied" as const } }),
      },
      stateStore: { publish },
    })).resolves.toEqual({
      status: "blocked",
      reason: "native-effect-ambiguous",
      recommendedActionText: "The native effect has no persisted identity; retain the reservation and do not resubmit.",
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it("returns the observed terminal continuation after adopting a highest-member teardown", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const highest = state.members.at(-2)!;
    const snapshot = { target: state.target, members: [highest] };
    const reserved = reserveDeliveryOperation({ revision: 7, value: state }, plan, {
      operationId: "operation-highest-teardown",
      kind: "teardown",
      mode: "member",
      candidateHeads: [],
      affectedDeliverableIds: [highest.deliverableId],
      expectedStateRevision: 7,
      before: snapshot,
      requested: snapshot,
    });
    if (reserved.status !== "reserved") throw new Error("fixture must reserve teardown");
    const top = {
      status: "ready" as const,
      request: {
        binding: { providerId: "github", changeRequestId: "103" },
        repository: "owner/repo",
        headRef: "member-3",
        headSha: "6".repeat(40),
        baseRef: "main",
        state: "open" as const,
      },
    };
    const missingTopWrite = vi.fn();
    await expect(reconcileDeliveryExecution({
      planId: plan.planId,
      current: { revision: 8, value: reserved.state },
      observation: { observe: async () => ({
        status: "observed" as const,
        value: { outcome: "applied" as const, snapshot },
      }) },
      stateStore: { publish: missingTopWrite },
    })).resolves.toEqual({
      status: "blocked",
      reason: "top-observation-unavailable",
      recommendedActionText: "Top observation is unavailable; retain the highest teardown reservation.",
    });
    expect(missingTopWrite).not.toHaveBeenCalled();

    await expect(reconcileDeliveryExecution({
      planId: plan.planId,
      current: { revision: 8, value: reserved.state },
      observation: { observe: async () => ({
        status: "observed" as const,
        value: { outcome: "applied" as const, snapshot },
        continuation: { nextAction: "terminal-checkpoint" as const, top },
      }) },
      stateStore: { publish: async (_planId, value) => ({
        status: "ok" as const,
        value: { revision: 9, value },
      }) },
    })).resolves.toEqual({
      status: "applied",
      state: { revision: 9, value: { ...reserved.state, activeOperation: null } },
      nextAction: "terminal-checkpoint",
      top,
    });
  });

  it("blocks when a proven non-applied reservation cannot be cleared durably", async () => {
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
      mergePolicy,
      releaseMergeLock: false,
      stateStore: { publish: async (_planId, value) => {
        current = { revision: 8, value };
        return { status: "ok" as const, value: current };
      } },
      host: deps.host,
      readiness: deps.readiness,
    });
    if (current === null) throw new Error("fixture must reserve");
    const reservedCurrent = current as { revision: number; value: DeliveryStateV1 };
    await expect(reconcileDeliveryExecution({
      planId: plan.planId,
      current: reservedCurrent,
      observation: { observe: async () => ({ status: "observed" as const, value: { outcome: "not-applied" } }) },
      stateStore: { publish: async () => ({ status: "refused" as const, reason: "version-conflict" as const }) },
    })).resolves.toEqual({
      status: "blocked",
      reason: "retry-state-persistence-failed",
      recommendedActionText: "Retry-state persistence failed; retain and reconcile the reservation.",
    });
    expect(reservedCurrent.value.activeOperation).not.toBeNull();
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
      mergePolicy,
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
      observation: { observe: async () => ({
        status: "refused" as const,
        reason: "contribution-conflicted" as const,
        paths: ["shared.txt"],
      }) },
      stateStore: { publish: async () => { throw new Error("must retain reservation"); } },
    })).resolves.toEqual({
      status: "blocked",
      reason: "contribution-conflicted",
      paths: ["shared.txt"],
      recommendedActionText: "The reserved operation result is unavailable; retain the reservation.",
    });
    await expect(reconcileDeliveryExecution({
      planId: plan.planId,
      current,
      observation: { observe: async () => ({
        status: "refused" as const,
        reason: "observation-unavailable" as const,
      }) },
      stateStore: { publish: async () => { throw new Error("must retain reservation"); } },
    })).resolves.toEqual({
      status: "blocked",
      reason: "observation-unavailable",
      recommendedActionText: "The reserved operation result is unavailable; retain the reservation.",
    });
  });

  it("retains native pending, ambiguous, and partial observations as informative stops", async () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const state = deliveryStateFixture(plan);
    const members = state.members.slice(0, -1);
    const snapshot = { target: state.target, members };
    const reserved = reserveDeliveryOperation({ revision: 7, value: state }, plan, {
      operationId: "operation-native-recovery",
      kind: "land",
      mode: "native",
      affectedDeliverableIds: members.map((member) => member.deliverableId),
      expectedStateRevision: 7,
      before: snapshot,
      requested: snapshot,
      effect: {
        providerId: "github",
        repository: "owner/repo",
        changeRequestId: "103",
        headSha: state.members.at(-1)!.coordinates!.head,
        baseRef: "main",
        targetRef: "refs/heads/main",
        strategy: "merge",
        mergePolicy: mergePolicyFor("owner/repo"),
      },
    });
    if (reserved.status !== "reserved") throw new Error("fixture must reserve native landing");
    const current = { revision: 8, value: reserved.state };
    const cases = [
      { status: "refused" as const, reason: "native-effect-pending" as const },
      { status: "refused" as const, reason: "native-effect-ambiguous" as const },
      {
        status: "refused" as const,
        reason: "native-effect-partial" as const,
        affectedDeliverableIds: [members[0]!.deliverableId],
      },
    ];
    for (const observation of cases) {
      const publish = vi.fn();
      const result = await reconcileDeliveryExecution({
        planId: plan.planId,
        current,
        observation: { observe: async () => observation },
        stateStore: { publish },
      });
      expect(DeliveryRecoveryResultV1Schema.parse(result)).toEqual({
        ...observation,
        status: "blocked",
        recommendedActionText: "The reserved operation result is unavailable; retain the reservation.",
      });
      expect(publish).not.toHaveBeenCalled();
      expect(current.value.activeOperation).toMatchObject({
        operationId: "operation-native-recovery",
        kind: "land",
        mode: "native",
      });
    }
  });

  it("adopts only an exact host-assigned recovery result and reports persistence failure", async () => {
    const { plan, state } = boundState();
    const deps = boundaries(state);
    const records: Array<{ revision: number; value: DeliveryStateV1 }> = [];
    await prepareDeliveryLanding({
      plan,
      current: { revision: 7, value: state },
      facts: facts(state),
      selectedDeliverableId: state.members[0]!.deliverableId,
      repository: "andrewRCr/arc-framework",
      baseRef: "refs/heads/main",
      targetRef: "refs/heads/main",
      mergePolicy,
      releaseMergeLock: false,
      stateStore: { publish: async (_planId, value) => {
        const record = { revision: 8, value };
        records.push(record);
        return { status: "ok" as const, value: record };
      } },
      host: deps.host,
      readiness: deps.readiness,
    });
    const [current] = records;
    if (current === undefined || current.value.activeOperation?.kind !== "land") {
      throw new Error("fixture must reserve a landing");
    }
    const operation = current.value.activeOperation;
    const snapshot = {
      ...operation.requested,
      target: operation.requested.target === null ? null : {
        ...operation.requested.target,
        coordinates: { head: "d".repeat(40), tree: "e".repeat(40) },
      },
      members: operation.requested.members.map((member) => ({
        ...member,
        coordinates: { base: "1".repeat(40), head: "d".repeat(40), tree: "e".repeat(40) },
      })),
    };
    const exactObservation = {
      outcome: "applied" as const,
      observation: {
        kind: "land" as const,
        effect: operation.effect,
        outcome: "applied" as const,
        snapshot,
      },
    };
    const persistedRevision = current.revision + 1;
    await expect(reconcileDeliveryExecution({
      planId: plan.planId,
      current,
      observation: { observe: async () => ({
        status: "observed" as const,
        value: {
          ...exactObservation,
          observation: {
            ...exactObservation.observation,
            effect: { ...operation.effect, headSha: "f".repeat(40) },
          },
        },
      }) },
      stateStore: { publish: async () => { throw new Error("must retain reservation"); } },
    })).resolves.toEqual({
      status: "blocked",
      reason: "operation-result-ambiguous",
      recommendedActionText: "The reserved operation result is ambiguous; inspect it explicitly.",
    });

    await expect(reconcileDeliveryExecution({
      planId: plan.planId,
      current,
      observation: { observe: async () => ({ status: "observed" as const, value: exactObservation }) },
      stateStore: { publish: async (_planId, value) => ({
        status: "ok" as const,
        value: { revision: persistedRevision, value },
      }) },
    })).resolves.toMatchObject({ status: "applied", state: { value: { activeOperation: null } } });

    await expect(reconcileDeliveryExecution({
      planId: plan.planId,
      current,
      observation: { observe: async () => ({ status: "observed" as const, value: exactObservation }) },
      stateStore: { publish: async () => ({ status: "refused" as const, reason: "version-conflict" as const }) },
    })).resolves.toEqual({
      status: "blocked",
      reason: "result-persistence-failed",
      recommendedActionText: "Result persistence failed; retain and reconcile the reservation.",
    });
  });
});
