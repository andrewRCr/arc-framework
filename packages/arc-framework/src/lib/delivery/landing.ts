/** Attended preparation, application, and recovery for one ordinary delivery landing. */

import type { DeliveryHostPort } from "./host.js";
import {
  acceptDeliveryOperationResult,
  checkDeliveryOperationPrecondition,
  reconcileDeliveryOperation,
  reserveDeliveryOperation,
} from "./operation.js";
import {
  assessDeliveryMemberReadiness,
  type DeliveryPositionFactsV1,
} from "./position.js";
import type { DeliveryRevisionedRecord, DeliveryStateStore } from "./ports.js";
import type {
  DeliveryContributionProofResult,
  DeliveryContributionRefusal,
} from "./contribution-proof.js";
import type {
  DeliveryLandEffectV1,
  DeliveryOperationSnapshotV1,
  DeliveryPlanV1,
  DeliveryStateV1,
} from "./schema.js";

/** Exact transient presentation authorized by the workflow interlock. */
export interface PreparedDeliveryLanding {
  readonly operationId: string;
  readonly planId: string;
  readonly deliverableId: string;
  readonly head: string;
  readonly repository: string;
  readonly changeRequestId: string;
  readonly mergeStrategy: "merge" | "rebase" | "squash";
  readonly settledReviewState: string;
  readonly consequence: string;
  readonly releaseMergeLock: boolean;
}

/** Fresh review admission is an injected authority; delivery stores only its transient presentation. */
export interface DeliveryLandingReadinessPort {
  assess(input: {
    readonly planId: string;
    readonly deliverableId: string;
    readonly workUnitId: string;
    readonly repository: string;
    readonly changeRequestId: string;
    readonly head: string;
  }): Promise<
    | { readonly status: "ready"; readonly settledReviewState: string }
    | { readonly status: "refused" }
  >;
}

/** Merge-lock transition kept separate from unconditional readiness admission. */
export interface DeliveryLandingLockPort {
  release(input: { readonly repository: string; readonly changeRequestId: string }): Promise<
    { readonly status: "released" | "not-configured" } | { readonly status: "refused" }
  >;
}

/** Repository-derived facts acquired at each landing mutation boundary. */
export interface DeliveryLandingObservationPort {
  observeSelection(): Promise<
    | {
        readonly status: "observed";
        readonly facts: DeliveryPositionFactsV1;
        readonly snapshot: DeliveryOperationSnapshotV1;
      }
    | { readonly status: "refused" }
  >;
  proveLandedContribution(input: {
    readonly beforeTarget: NonNullable<NonNullable<DeliveryOperationSnapshotV1["target"]>["coordinates"]>;
    readonly beforeMember: NonNullable<DeliveryOperationSnapshotV1["members"][number]["coordinates"]>;
    readonly afterTarget: NonNullable<NonNullable<DeliveryOperationSnapshotV1["target"]>["coordinates"]>;
  }): Promise<DeliveryContributionProofResult>;
}

type DeliveryLandingRefusal =
  | DeliveryContributionRefusal
  | { readonly status: "refused"; readonly reason: "landing-refused" };

function landingRefused(): DeliveryLandingRefusal {
  return { status: "refused", reason: "landing-refused" };
}

/** Fresh operation observation selected from the persisted operation kind. */
export type DeliveryRecoveryObservationRefusal =
  | DeliveryContributionRefusal
  | { readonly status: "refused"; readonly reason: "observation-unavailable" };

export interface DeliveryRecoveryObservationPort {
  observe(): Promise<
    | { readonly status: "observed"; readonly value: unknown }
    | DeliveryRecoveryObservationRefusal
  >;
}

type BlockedDeliveryRecoveryObservationRefusal = DeliveryRecoveryObservationRefusal extends infer Refusal
  ? Refusal extends { readonly status: "refused" }
    ? Omit<Refusal, "status"> & { readonly status: "blocked"; readonly guidance: string }
    : never
  : never;

function memberSnapshot(state: DeliveryStateV1, deliverableId: string): DeliveryOperationSnapshotV1 | null {
  const member = state.members.find((candidate) => candidate.deliverableId === deliverableId);
  return member === undefined ? null : {
    target: state.target,
    members: [{
      deliverableId: member.deliverableId,
      ref: member.ref,
      changeRequest: member.changeRequest,
      coordinates: member.coordinates,
    }],
  };
}

async function exactOpenRequest(input: {
  readonly host: DeliveryHostPort;
  readonly repository: string;
  readonly member: DeliveryStateV1["members"][number];
  readonly baseRef: string;
}): Promise<{ readonly status: "exact"; readonly changeRequestId: string } | { readonly status: "refused" }> {
  if (input.member.changeRequest === null || input.member.ref === null || input.member.coordinates === null) {
    return { status: "refused" };
  }
  const observed = await input.host.readRequest(input.repository, input.member.changeRequest);
  return observed.status === "observed"
    && observed.request.state === "open"
    && observed.request.repository === input.repository
    && observed.request.headRepository === input.repository
    && observed.request.headRef === input.member.ref.replace(/^refs\/heads\//u, "")
    && observed.request.headSha === input.member.coordinates.head
    && observed.request.baseRef === input.baseRef.replace(/^refs\/heads\//u, "")
    ? { status: "exact", changeRequestId: observed.request.binding.changeRequestId }
    : { status: "refused" };
}

/** Prepare one exact non-terminal landing without releasing a lock or merging. */
export async function prepareDeliveryLanding(input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly facts: DeliveryPositionFactsV1;
  readonly selectedDeliverableId: string;
  readonly repository: string;
  readonly baseRef: string;
  readonly targetRef: string;
  readonly mergeStrategy: "merge" | "rebase" | "squash";
  readonly releaseMergeLock: boolean;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;
  readonly host: DeliveryHostPort;
  readonly readiness: DeliveryLandingReadinessPort;
}): Promise<{ readonly status: "prepared"; readonly presentation: PreparedDeliveryLanding } | {
  readonly status: "refused";
}> {
  const memberIndex = input.plan.members.findIndex((member) => member.deliverableId === input.selectedDeliverableId);
  if (memberIndex < 0 || memberIndex === input.plan.members.length - 1) return { status: "refused" };
  if (assessDeliveryMemberReadiness(
    input.plan, input.current.value, input.facts, input.selectedDeliverableId,
  ).status !== "ready") return { status: "refused" };
  const member = input.current.value.members[memberIndex];
  if (member === undefined) return { status: "refused" };
  const request = await exactOpenRequest({
    host: input.host,
    repository: input.repository,
    member,
    baseRef: input.baseRef,
  });
  if (request.status !== "exact" || member.coordinates === null || member.changeRequest === null) {
    return { status: "refused" };
  }
  const readiness = await input.readiness.assess({
    planId: input.plan.planId,
    deliverableId: member.deliverableId,
    workUnitId: input.plan.workUnitId,
    repository: input.repository,
    changeRequestId: request.changeRequestId,
    head: member.coordinates.head,
  });
  if (readiness.status !== "ready") return { status: "refused" };
  const before = memberSnapshot(input.current.value, member.deliverableId);
  if (before === null) return { status: "refused" };
  const effect: DeliveryLandEffectV1 = {
    providerId: member.changeRequest.providerId,
    repository: input.repository,
    changeRequestId: request.changeRequestId,
    headSha: member.coordinates.head,
    baseRef: input.baseRef.replace(/^refs\/heads\//u, ""),
    targetRef: input.targetRef,
    strategy: input.mergeStrategy,
  };
  const operationId = crypto.randomUUID();
  const requested = {
    ...before,
    target: before.target === null ? null : { ...before.target, ref: input.targetRef },
  };
  const reserved = reserveDeliveryOperation(input.current, input.plan, {
    operationId,
    kind: "land",
    affectedDeliverableIds: [member.deliverableId],
    expectedStateRevision: input.current.revision,
    before,
    requested,
    effect,
  });
  if (reserved.status !== "reserved") return { status: "refused" };
  const persisted = await input.stateStore.publish(input.plan.planId, reserved.state, input.current.revision);
  if (persisted.status !== "ok") return { status: "refused" };
  return {
    status: "prepared",
    presentation: {
      operationId,
      planId: input.plan.planId,
      deliverableId: member.deliverableId,
      head: member.coordinates.head,
      repository: input.repository,
      changeRequestId: request.changeRequestId,
      mergeStrategy: input.mergeStrategy,
      settledReviewState: readiness.settledReviewState,
      consequence: `Merge delivery member ${member.deliverableId} at exact head ${member.coordinates.head}.`,
      releaseMergeLock: input.releaseMergeLock,
    },
  };
}

/** Apply one previously prepared exact landing after workflow authorization. */
export async function applyDeliveryLanding(input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly approved: PreparedDeliveryLanding;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;
  readonly host: DeliveryHostPort;
  readonly readiness: DeliveryLandingReadinessPort;
  readonly lock: DeliveryLandingLockPort;
  readonly observation: DeliveryLandingObservationPort;
}): Promise<{ readonly status: "landed"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> } | {
  readonly status: "refused";
  readonly reason: "landing-refused";
} | DeliveryContributionRefusal> {
  const operation = input.current.value.activeOperation;
  if (operation?.kind !== "land" || operation.operationId !== input.approved.operationId
    || operation.affectedDeliverableIds[0] !== input.approved.deliverableId
    || operation.effect.headSha !== input.approved.head
    || operation.effect.repository !== input.approved.repository
    || operation.effect.changeRequestId !== input.approved.changeRequestId
    || operation.effect.strategy !== input.approved.mergeStrategy) return landingRefused();
  const member = input.current.value.members.find((candidate) => candidate.deliverableId === input.approved.deliverableId);
  if (member === undefined || member.coordinates === null) return landingRefused();
  const memberHead = member.coordinates.head;
  const stateWithoutReservation = { ...input.current.value, activeOperation: null };
  const observeReady = async (): Promise<boolean> => {
    const fresh = await input.observation.observeSelection();
    return fresh.status === "observed"
      && assessDeliveryMemberReadiness(
        input.plan, stateWithoutReservation, fresh.facts, member.deliverableId,
      ).status === "ready"
      && checkDeliveryOperationPrecondition(input.current, fresh.snapshot).status === "ready"
      && (await exactOpenRequest({
        host: input.host,
        repository: input.approved.repository,
        member,
        baseRef: `refs/heads/${operation.effect.baseRef}`,
      })).status === "exact"
      && (await input.readiness.assess({
        planId: input.plan.planId,
        deliverableId: member.deliverableId,
        workUnitId: input.plan.workUnitId,
        repository: input.approved.repository,
        changeRequestId: input.approved.changeRequestId,
        head: memberHead,
      })).status === "ready";
  };
  if (!(await observeReady())) return landingRefused();
  if (input.approved.releaseMergeLock
    && (await input.lock.release({
      repository: input.approved.repository,
      changeRequestId: input.approved.changeRequestId,
    })).status === "refused") return landingRefused();
  if (!(await observeReady())) return landingRefused();
  if ((await input.host.mergeRequest(operation.effect)).status !== "submitted") return landingRefused();
  const merged = member.changeRequest === null
    ? { status: "refused" as const }
    : await input.host.readRequest(input.approved.repository, member.changeRequest);
  if (merged.status !== "observed" || merged.request.state !== "merged"
    || merged.request.repository !== operation.effect.repository
    || merged.request.headRepository !== operation.effect.repository
    || merged.request.binding.changeRequestId !== operation.effect.changeRequestId
    || member.ref === null || merged.request.headRef !== member.ref.replace(/^refs\/heads\//u, "")
    || merged.request.headSha !== operation.effect.headSha
    || merged.request.baseRef !== operation.effect.baseRef) return landingRefused();
  const target = await input.host.observeTarget(input.approved.repository, operation.effect.targetRef);
  if (target.status !== "observed") return landingRefused();
  const memberCoordinates = member.coordinates;
  const beforeTarget = operation.before.target?.coordinates;
  if (beforeTarget === null || beforeTarget === undefined) return landingRefused();
  const proof = await input.observation.proveLandedContribution({
    beforeTarget,
    beforeMember: memberCoordinates,
    afterTarget: target.coordinates,
  });
  if (proof.status !== "accepted") return proof;
  const observed: DeliveryOperationSnapshotV1 = {
    target: { ref: operation.effect.targetRef, coordinates: target.coordinates },
    members: operation.before.members,
  };
  const accepted = acceptDeliveryOperationResult(input.current, {
    kind: "land",
    effect: operation.effect,
    outcome: "applied",
    snapshot: observed,
  });
  if (accepted.status !== "applied") return landingRefused();
  const persisted = await input.stateStore.publish(input.plan.planId, accepted.state, input.current.revision);
  return persisted.status === "ok" ? { status: "landed", state: persisted.value } : landingRefused();
}

/** Reconcile one interrupted operation; an attended land retry always routes back to prepare. */
export async function reconcileDeliveryExecution(input: {
  readonly planId: string;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly observation: DeliveryRecoveryObservationPort;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;
}): Promise<
  | {
      readonly status: "applied";
      readonly state: DeliveryRevisionedRecord<DeliveryStateV1>;
      readonly nextAction: "read-position";
    }
  | { readonly status: "retryable"; readonly guidance: string }
  | BlockedDeliveryRecoveryObservationRefusal
  | {
      readonly status: "blocked";
      readonly reason:
        | "retry-state-persistence-failed"
        | "operation-result-ambiguous"
        | "result-persistence-failed";
      readonly guidance: string;
    }
> {
  const observed = await input.observation.observe();
  if (observed.status !== "observed") {
    return {
      ...observed,
      status: "blocked",
      guidance: "The reserved operation result is unavailable; retain the reservation.",
    };
  }
  const reconciled = reconcileDeliveryOperation(input.current, observed.value);
  if (reconciled.status === "retry") {
    const cleared = await input.stateStore.publish(input.planId, {
      ...input.current.value,
      activeOperation: null,
    }, input.current.revision);
    if (cleared.status !== "ok") {
      return {
        status: "blocked",
        reason: "retry-state-persistence-failed",
        guidance: "Retry-state persistence failed; retain and reconcile the reservation.",
      };
    }
    return {
      status: "retryable",
      guidance: input.current.value.activeOperation?.kind === "land"
        ? "Prepare the exact landing again and re-fire its integration interlock."
        : "Retry the exact reserved mutation after revalidation.",
    };
  }
  if (reconciled.status !== "adopt") {
    return {
      status: "blocked",
      reason: "operation-result-ambiguous",
      guidance: "The reserved operation result is ambiguous; inspect it explicitly.",
    };
  }
  const persisted = await input.stateStore.publish(input.planId, reconciled.state, input.current.revision);
  return persisted.status === "ok"
    ? { status: "applied", state: persisted.value, nextAction: "read-position" }
    : {
        status: "blocked",
        reason: "result-persistence-failed",
        guidance: "Result persistence failed; retain and reconcile the reservation.",
      };
}
