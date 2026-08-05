/** Pure reservation and reconciliation guards for one delivery operation. */

import { z } from "zod";

import { canonicalize } from "../kernel/index.js";
import { validateDeliveryPlanRecord } from "./plan.js";
import type { DeliveryRevisionedRecord } from "./ports.js";
import {
  DeliveryActiveOperationV1Schema,
  DeliveryOperationSnapshotV1Schema,
  DeliveryStateV1Schema,
  type DeliveryActiveOperationV1,
  type DeliveryOperationSnapshotV1,
  type DeliveryPlanV1,
  type DeliveryStateV1,
} from "./schema.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";

/** Caller-supplied operation intent before state-owned binding fields are added. */
export const DeliveryOperationReservationRequestV1Schema = DeliveryActiveOperationV1Schema.omit({
  stateRevision: true,
  boundPlanDigest: true,
}).extend({
  expectedStateRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
export type DeliveryOperationReservationRequestV1 = z.infer<
  typeof DeliveryOperationReservationRequestV1Schema
>;

/** Closed failures while reserving the single delivery-operation slot. */
export type ReserveDeliveryOperationFailure =
  | "state-invalid"
  | "plan-invalid"
  | "stale-state"
  | "stale-plan-binding"
  | "operation-active"
  | "operation-invalid"
  | "unknown-deliverable"
  | "member-sequence-invalid"
  | "before-state-mismatch";

/** Result of attempting to reserve one operation against exact current state. */
export type ReserveDeliveryOperationResult =
  | { readonly status: "reserved"; readonly state: DeliveryStateV1 }
  | { readonly status: "refused"; readonly reason: ReserveDeliveryOperationFailure };

/** Closed failures while comparing fresh facts with a reserved operation. */
export type CompareDeliveryOperationFailure =
  | "state-invalid"
  | "no-active-operation"
  | "operation-stale"
  | "observed-facts-invalid"
  | "before-mismatch"
  | "requested-mismatch";

/** Result of checking fresh pre-mutation facts against a reservation. */
export type CheckDeliveryOperationPreconditionResult =
  | { readonly status: "ready"; readonly operationId: string }
  | { readonly status: "blocked"; readonly reason: CompareDeliveryOperationFailure };

/** Result of checking fresh post-mutation facts and clearing an exact result. */
export type AcceptDeliveryOperationResult =
  | { readonly status: "applied"; readonly state: DeliveryStateV1 }
  | { readonly status: "blocked"; readonly reason: CompareDeliveryOperationFailure };

/** Result of reconciling a fresh observation with an interrupted operation. */
export type ReconcileDeliveryOperationResult =
  | { readonly status: "adopt"; readonly state: DeliveryStateV1 }
  | { readonly status: "retry"; readonly operationId: string }
  | {
    readonly status: "blocked";
    readonly reason: CompareDeliveryOperationFailure | "ambiguous-result";
  };

type CurrentOperationResult =
  | {
    readonly status: "valid";
    readonly state: DeliveryStateV1;
    readonly operation: DeliveryActiveOperationV1;
  }
  | { readonly status: "blocked"; readonly reason: CompareDeliveryOperationFailure };

function snapshotFromState(
  state: DeliveryStateV1,
  affectedDeliverableIds: readonly string[],
): DeliveryOperationSnapshotV1 {
  return {
    target: state.target,
    members: affectedDeliverableIds.flatMap((deliverableId) => {
      const member = state.members.find((candidate) => candidate.deliverableId === deliverableId);
      return member === undefined ? [] : [{
        deliverableId: member.deliverableId,
        ref: member.ref,
        coordinates: member.coordinates,
      }];
    }),
  };
}

function followsPlanOrder(plan: DeliveryPlanV1, deliverableIds: readonly string[]): boolean {
  const positions = new Map(plan.members.map((member, index) => [member.deliverableId, index]));
  let previous = -1;
  for (const deliverableId of deliverableIds) {
    const position = positions.get(deliverableId);
    if (position === undefined || position <= previous) return false;
    previous = position;
  }
  return true;
}

function currentOperation(
  current: DeliveryRevisionedRecord<DeliveryStateV1>,
): CurrentOperationResult {
  const parsedState = DeliveryStateV1Schema.safeParse(current.value);
  if (!parsedState.success || !Number.isSafeInteger(current.revision) || current.revision <= 0) {
    return { status: "blocked", reason: "state-invalid" };
  }
  const operation = parsedState.data.activeOperation;
  if (operation === null) return { status: "blocked", reason: "no-active-operation" };
  const affectedBytes = canonicalize(operation.affectedDeliverableIds);
  const stateOrder = parsedState.data.members
    .filter((member) => operation.affectedDeliverableIds.includes(member.deliverableId))
    .map((member) => member.deliverableId);
  if (canonicalize(stateOrder) !== affectedBytes
    || canonicalize(operation.before.members.map((member) => member.deliverableId)) !== affectedBytes
    || canonicalize(operation.requested.members.map((member) => member.deliverableId)) !== affectedBytes) {
    return { status: "blocked", reason: "state-invalid" };
  }
  if (current.revision !== operation.stateRevision + 1
    || operation.boundPlanDigest !== parsedState.data.boundPlan.planDigest
    || canonicalize(snapshotFromState(parsedState.data, operation.affectedDeliverableIds))
      !== canonicalize(operation.before)) {
    return { status: "blocked", reason: "operation-stale" };
  }
  return { status: "valid", state: parsedState.data, operation };
}

function applyRequestedSnapshot(
  state: DeliveryStateV1,
  operation: DeliveryActiveOperationV1,
): DeliveryStateV1 | null {
  const requestedByDeliverable = new Map(
    operation.requested.members.map((member) => [member.deliverableId, member]),
  );
  const parsed = DeliveryStateV1Schema.safeParse({
    ...state,
    target: operation.requested.target,
    members: state.members.map((member) => {
      const requested = requestedByDeliverable.get(member.deliverableId);
      return requested === undefined ? member : {
        ...member,
        ref: requested.ref,
        coordinates: requested.coordinates,
      };
    }),
    activeOperation: null,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Reserve one operation against an exact plan-bound state revision.
 *
 * @param current - Current state payload and store-owned revision.
 * @param plan - Current authored plan revision.
 * @param request - Caller-minted operation intent and exact snapshots.
 * @returns The state carrying the reservation or a closed refusal.
 */
export function reserveDeliveryOperation(
  current: DeliveryRevisionedRecord<DeliveryStateV1>,
  plan: DeliveryPlanV1,
  request: unknown,
): ReserveDeliveryOperationResult {
  const parsedState = DeliveryStateV1Schema.safeParse(current.value);
  if (!parsedState.success || !Number.isSafeInteger(current.revision) || current.revision <= 0) {
    return { status: "refused", reason: "state-invalid" };
  }
  if (validateDeliveryPlanRecord(plan).status === "refused") {
    return { status: "refused", reason: "plan-invalid" };
  }
  const parsedRequest = DeliveryOperationReservationRequestV1Schema.safeParse(request);
  if (!parsedRequest.success) return { status: "refused", reason: "operation-invalid" };
  if (current.revision !== parsedRequest.data.expectedStateRevision) {
    return { status: "refused", reason: "stale-state" };
  }
  if (validateDeliveryStateAgainstPlan(parsedState.data, plan).status === "refused") {
    return { status: "refused", reason: "stale-plan-binding" };
  }
  if (parsedState.data.activeOperation !== null) {
    return { status: "refused", reason: "operation-active" };
  }

  const knownDeliverables = new Set(plan.members.map((member) => member.deliverableId));
  if (parsedRequest.data.affectedDeliverableIds.some((deliverableId) => !knownDeliverables.has(deliverableId))) {
    return { status: "refused", reason: "unknown-deliverable" };
  }
  if (!followsPlanOrder(plan, parsedRequest.data.affectedDeliverableIds)) {
    return { status: "refused", reason: "member-sequence-invalid" };
  }
  const affectedBytes = canonicalize(parsedRequest.data.affectedDeliverableIds);
  if (canonicalize(parsedRequest.data.before.members.map((member) => member.deliverableId)) !== affectedBytes
    || canonicalize(parsedRequest.data.requested.members.map((member) => member.deliverableId)) !== affectedBytes) {
    return { status: "refused", reason: "member-sequence-invalid" };
  }
  if (canonicalize(snapshotFromState(parsedState.data, parsedRequest.data.affectedDeliverableIds))
    !== canonicalize(parsedRequest.data.before)) {
    return { status: "refused", reason: "before-state-mismatch" };
  }

  const reserved = DeliveryStateV1Schema.safeParse({
    ...parsedState.data,
    activeOperation: {
      operationId: parsedRequest.data.operationId,
      kind: parsedRequest.data.kind,
      affectedDeliverableIds: parsedRequest.data.affectedDeliverableIds,
      stateRevision: current.revision,
      boundPlanDigest: plan.planDigest,
      before: parsedRequest.data.before,
      requested: parsedRequest.data.requested,
    },
  });
  if (!reserved.success) return { status: "refused", reason: "operation-invalid" };
  return { status: "reserved", state: reserved.data };
}

/**
 * Check that fresh pre-mutation coordinates equal the reservation's exact source.
 *
 * @param current - Published reservation state and its store-owned revision.
 * @param observed - Fresh target and member coordinates.
 * @returns Readiness for mutation or a closed block.
 */
export function checkDeliveryOperationPrecondition(
  current: DeliveryRevisionedRecord<DeliveryStateV1>,
  observed: unknown,
): CheckDeliveryOperationPreconditionResult {
  const active = currentOperation(current);
  if (active.status === "blocked") return active;
  const parsedObserved = DeliveryOperationSnapshotV1Schema.safeParse(observed);
  if (!parsedObserved.success) return { status: "blocked", reason: "observed-facts-invalid" };
  if (canonicalize(parsedObserved.data) !== canonicalize(active.operation.before)) {
    return { status: "blocked", reason: "before-mismatch" };
  }
  return { status: "ready", operationId: active.operation.operationId };
}

/**
 * Accept only the exact requested result and produce state with the reservation cleared.
 *
 * @param current - Published reservation state and its store-owned revision.
 * @param observed - Fresh target and member coordinates after mutation.
 * @returns Applied current state or a closed block.
 */
export function acceptDeliveryOperationResult(
  current: DeliveryRevisionedRecord<DeliveryStateV1>,
  observed: unknown,
): AcceptDeliveryOperationResult {
  const active = currentOperation(current);
  if (active.status === "blocked") return active;
  const parsedObserved = DeliveryOperationSnapshotV1Schema.safeParse(observed);
  if (!parsedObserved.success) return { status: "blocked", reason: "observed-facts-invalid" };
  if (canonicalize(parsedObserved.data) !== canonicalize(active.operation.requested)) {
    return { status: "blocked", reason: "requested-mismatch" };
  }
  const next = applyRequestedSnapshot(active.state, active.operation);
  return next === null
    ? { status: "blocked", reason: "state-invalid" }
    : { status: "applied", state: next };
}

/**
 * Reconcile an interrupted operation from one fresh exact observation.
 *
 * @param current - Published reservation state and its store-owned revision.
 * @param observed - Fresh target and member coordinates after interruption.
 * @returns Exact adoption, safe retry, or an explicit block.
 */
export function reconcileDeliveryOperation(
  current: DeliveryRevisionedRecord<DeliveryStateV1>,
  observed: unknown,
): ReconcileDeliveryOperationResult {
  const active = currentOperation(current);
  if (active.status === "blocked") return active;
  const parsedObserved = DeliveryOperationSnapshotV1Schema.safeParse(observed);
  if (!parsedObserved.success) return { status: "blocked", reason: "observed-facts-invalid" };
  const observedBytes = canonicalize(parsedObserved.data);
  if (observedBytes === canonicalize(active.operation.requested)) {
    const next = applyRequestedSnapshot(active.state, active.operation);
    return next === null
      ? { status: "blocked", reason: "state-invalid" }
      : { status: "adopt", state: next };
  }
  if (observedBytes === canonicalize(active.operation.before)) {
    return { status: "retry", operationId: active.operation.operationId };
  }
  return { status: "blocked", reason: "ambiguous-result" };
}
