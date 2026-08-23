/** Exact reservation and convergence for one predecessor-changing suffix retarget. */

import { canonicalize } from "../kernel/index.js";
import {
  acceptDeliveryOperationResult,
  checkDeliveryOperationPrecondition,
  reserveDeliveryOperation,
  validateDeliveryActiveOperation,
} from "./operation.js";
import type { DeliveryRevisionedRecord, DeliveryStateStore } from "./ports.js";
import {
  DeliveryOperationSnapshotV1Schema,
  DeliveryStateV1Schema,
  type DeliveryOperationSnapshotV1,
  type DeliveryPlanV1,
  type DeliveryStateV1,
} from "./schema.js";
import type {
  DeliveryContributionProofResult,
  DeliveryContributionRefusal,
} from "./contribution-proof.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";

type StateWriter = Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;

/** One provider-assigned member coordinate change presented to the contribution arbiter. */
export interface DeliveryProviderRefreshMovement {
  readonly deliverableId: string;
  readonly before: DeliveryOperationSnapshotV1["members"][number];
  readonly after: DeliveryOperationSnapshotV1["members"][number];
}

function snapshotFor(
  state: DeliveryStateV1,
  affectedDeliverableIds: readonly string[],
): DeliveryOperationSnapshotV1 | null {
  const members = affectedDeliverableIds.map((deliverableId) => state.members
    .find((candidate) => candidate.deliverableId === deliverableId));
  if (members.some((member) => member === undefined)) return null;
  return {
    target: state.target,
    members: members.flatMap((member) => member === undefined ? [] : [{
      deliverableId: member.deliverableId,
      ref: member.ref,
      changeRequest: member.changeRequest,
      coordinates: member.coordinates,
    }]),
  };
}

function isPlannedNonterminalSuffix(
  plan: DeliveryPlanV1,
  affectedDeliverableIds: readonly string[],
): boolean {
  const nonterminal = plan.members.slice(0, -1).map(({ deliverableId }) => deliverableId);
  const start = nonterminal.length - affectedDeliverableIds.length;
  return affectedDeliverableIds.length > 0 && start >= 0
    && canonicalize(nonterminal.slice(start)) === canonicalize(affectedDeliverableIds);
}

function isPlannedNonterminalRange(
  plan: DeliveryPlanV1,
  affectedDeliverableIds: readonly string[],
): boolean {
  if (affectedDeliverableIds.length === 0) return false;
  const nonterminal = plan.members.slice(0, -1).map(({ deliverableId }) => deliverableId);
  const start = nonterminal.indexOf(affectedDeliverableIds[0] ?? "");
  return start >= 0
    && canonicalize(nonterminal.slice(start, start + affectedDeliverableIds.length))
      === canonicalize(affectedDeliverableIds);
}

function observationMatchesSubject(
  before: DeliveryOperationSnapshotV1,
  observed: DeliveryOperationSnapshotV1,
): boolean {
  if (canonicalize(observed.target) !== canonicalize(before.target)
    || observed.members.length !== before.members.length) return false;
  return before.members.every((member, index) => {
    const result = observed.members[index];
    return result !== undefined && result.deliverableId === member.deliverableId
      && result.ref === member.ref
      && canonicalize(result.changeRequest) === canonicalize(member.changeRequest)
      && result.coordinates !== null;
  });
}

function changedProviderMovements(
  before: DeliveryOperationSnapshotV1,
  observed: DeliveryOperationSnapshotV1,
): DeliveryProviderRefreshMovement[] | null {
  if (!observationMatchesSubject(before, observed)) return null;
  return before.members.flatMap((member, index) => {
    const result = observed.members[index];
    if (result === undefined || canonicalize(result.coordinates) === canonicalize(member.coordinates)) return [];
    return [{ deliverableId: member.deliverableId, before: member, after: result }];
  });
}

async function proveProviderMovements(
  movements: readonly DeliveryProviderRefreshMovement[],
  proveContribution: (
    movement: DeliveryProviderRefreshMovement,
  ) => Promise<DeliveryContributionProofResult>,
): Promise<DeliveryContributionRefusal | null> {
  for (const movement of movements) {
    const proof = await proveContribution(movement);
    if (proof.status !== "accepted") return proof;
  }
  return null;
}

function applyProviderObservation(
  state: DeliveryStateV1,
  observed: DeliveryOperationSnapshotV1,
): DeliveryStateV1 | null {
  const byId = new Map(observed.members.map((member) => [member.deliverableId, member]));
  const parsed = DeliveryStateV1Schema.safeParse({
    ...state,
    members: state.members.map((member) => {
      const result = byId.get(member.deliverableId);
      return result === undefined ? member : {
        ...member,
        ref: result.ref,
        changeRequest: result.changeRequest,
        coordinates: result.coordinates,
      };
    }),
    activeOperation: null,
  });
  return parsed.success ? parsed.data : null;
}

type BlockedContributionRefusal = DeliveryContributionRefusal extends infer Refusal
  ? Refusal extends { readonly status: "refused" }
    ? Omit<Refusal, "status"> & { readonly status: "blocked" }
    : never
  : never;

/** Reobserve and converge one persisted rewrite reservation through ordinary exact reconciliation. */
export async function reconcileReservedSuffixRetarget(input: {
  readonly planId: string;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly observed: unknown;
  readonly proveContribution: (
    movement: DeliveryProviderRefreshMovement,
  ) => Promise<DeliveryContributionProofResult>;
  readonly stateStore: StateWriter;
}): Promise<
  | { readonly status: "applied"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
  | { readonly status: "retryable" }
  | BlockedContributionRefusal
  | { readonly status: "blocked"; readonly reason: "ambiguous" | "state-conflict" }
> {
  const active = validateDeliveryActiveOperation(input.current);
  if (active.status !== "valid" || active.operation.kind !== "rewrite"
    || active.operation.mode !== "provider-adoption") {
    return { status: "blocked", reason: "ambiguous" };
  }
  const observed = DeliveryOperationSnapshotV1Schema.safeParse(input.observed);
  if (!observed.success) return { status: "blocked", reason: "ambiguous" };
  if (canonicalize(observed.data) === canonicalize(active.operation.before)) {
    return { status: "retryable" };
  }
  const movements = changedProviderMovements(active.operation.before, observed.data);
  if (movements === null || movements.length === 0) {
    return { status: "blocked", reason: "ambiguous" };
  }
  const refusal = await proveProviderMovements(movements, input.proveContribution);
  if (refusal !== null) return { ...refusal, status: "blocked" };
  const applied = applyProviderObservation(active.state, observed.data);
  if (applied === null) return { status: "blocked", reason: "ambiguous" };
  const persisted = await input.stateStore.publish(input.planId, applied, input.current.revision);
  return persisted.status === "ok"
    ? { status: "applied", state: persisted.value }
    : { status: "blocked", reason: "state-conflict" };
}

/** Execute one explicit suffix rewrite through lifecycle revalidation, reservation, lease, and exact adoption. */
export async function executeDeliverySuffixRewrite(input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly deliverableId: string;
  readonly requested: DeliveryOperationSnapshotV1;
  /** Selected review fixes are authorized content changes, not false equivalence claims. */
  readonly contributionMode?: "prove-equivalent" | "selected-change";
  readonly revalidateLifecycle: () => Promise<{ readonly status: "ok" | "refused" }>;
  readonly rewriteRef: (input: {
    readonly ref: string;
    readonly beforeHead: string;
    readonly requestedHead: string;
  }) => Promise<{ readonly status: "rewritten" | "adopted" | "refused" }>;
  readonly observeResult: () => Promise<DeliveryOperationSnapshotV1>;
  readonly proveContribution: () => Promise<DeliveryContributionProofResult>;
  readonly stateStore: StateWriter;
}): Promise<
  | { readonly status: "applied"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
  | DeliveryContributionRefusal
  | {
      readonly status: "refused";
      readonly reason:
        | "position-mismatch"
        | "lifecycle-contribution"
        | "reservation-refused"
        | "state-conflict"
        | "precondition-mismatch"
        | "rewrite-refused"
        | "ambiguous-result";
    }
> {
  const member = input.current.value.members.find((candidate) => candidate.deliverableId === input.deliverableId);
  const requestedMember = input.requested.members[0];
  if (canonicalize(input.requested.target) !== canonicalize(input.current.value.target)
    || member?.ref === null || member?.coordinates === null || requestedMember === undefined
    || requestedMember.deliverableId !== member?.deliverableId || requestedMember.ref !== member.ref
    || requestedMember.changeRequest?.providerId !== member.changeRequest?.providerId
    || requestedMember.changeRequest?.changeRequestId !== member.changeRequest?.changeRequestId
    || requestedMember.coordinates === null) return { status: "refused", reason: "position-mismatch" };
  if ((await input.revalidateLifecycle()).status !== "ok") {
    return { status: "refused", reason: "lifecycle-contribution" };
  }
  const before: DeliveryOperationSnapshotV1 = {
    target: input.current.value.target,
    members: [{
      deliverableId: member.deliverableId,
      ref: member.ref,
      changeRequest: member.changeRequest,
      coordinates: member.coordinates,
    }],
  };
  const reserved = reserveDeliveryOperation(input.current, input.plan, {
    operationId: crypto.randomUUID(),
    kind: "rewrite",
    mode: "review-fix",
    affectedDeliverableIds: [member.deliverableId],
    expectedStateRevision: input.current.revision,
    before,
    requested: input.requested,
  });
  if (reserved.status !== "reserved") return { status: "refused", reason: "reservation-refused" };
  const persistedReservation = await input.stateStore.publish(
    input.plan.planId, reserved.state, input.current.revision,
  );
  if (persistedReservation.status !== "ok") return { status: "refused", reason: "state-conflict" };
  if (checkDeliveryOperationPrecondition(persistedReservation.value, before).status !== "ready") {
    return { status: "refused", reason: "precondition-mismatch" };
  }
  const rewritten = await input.rewriteRef({
    ref: member.ref,
    beforeHead: member.coordinates.head,
    requestedHead: requestedMember.coordinates.head,
  });
  if (rewritten.status === "refused") return { status: "refused", reason: "rewrite-refused" };
  const observed = await input.observeResult();
  if (input.contributionMode !== "selected-change") {
    const proof = await input.proveContribution();
    if (proof.status !== "accepted") return proof;
  }
  const accepted = acceptDeliveryOperationResult(persistedReservation.value, observed);
  if (accepted.status !== "applied") return { status: "refused", reason: "ambiguous-result" };
  const persisted = await input.stateStore.publish(
    input.plan.planId, accepted.state, persistedReservation.value.revision,
  );
  return persisted.status === "ok"
    ? { status: "applied", state: persisted.value }
    : { status: "refused", reason: "state-conflict" };
}

/**
 * Execute one provider refresh under the existing rewrite reservation.
 *
 * @param input - Exact suffix subject, provider and observation boundaries, contribution arbiter, and state store
 * @returns Applied current coordinates or a typed refusal that leaves any persisted reservation recoverable
 */
export async function executeDeliveryProviderRefresh(input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly affectedDeliverableIds: readonly string[];
  readonly observeBefore: () => Promise<DeliveryOperationSnapshotV1>;
  readonly refreshProvider: () => Promise<{ readonly status: "accepted" | "refused" }>;
  readonly observeResult: () => Promise<DeliveryOperationSnapshotV1>;
  readonly proveContribution: (
    movement: DeliveryProviderRefreshMovement,
  ) => Promise<DeliveryContributionProofResult>;
  readonly stateStore: StateWriter;
}): Promise<
  | { readonly status: "applied"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
  | DeliveryContributionRefusal
  | {
      readonly status: "refused";
      readonly reason: "position-mismatch" | "reservation-refused" | "state-conflict"
        | "precondition-mismatch" | "provider-refused" | "ambiguous-result";
    }
> {
  if (!isPlannedNonterminalSuffix(input.plan, input.affectedDeliverableIds)) {
    return { status: "refused", reason: "position-mismatch" };
  }
  const before = snapshotFor(input.current.value, input.affectedDeliverableIds);
  if (before === null || before.target === null || before.target.coordinates === null
    || before.members.some((member) => member.ref === null || member.changeRequest === null
      || member.coordinates === null)) {
    return { status: "refused", reason: "position-mismatch" };
  }
  const reserved = reserveDeliveryOperation(input.current, input.plan, {
    operationId: crypto.randomUUID(),
    kind: "rewrite",
    mode: "provider-adoption",
    affectedDeliverableIds: input.affectedDeliverableIds,
    expectedStateRevision: input.current.revision,
    before,
    requested: before,
  });
  if (reserved.status !== "reserved") return { status: "refused", reason: "reservation-refused" };
  const persistedReservation = await input.stateStore.publish(
    input.plan.planId, reserved.state, input.current.revision,
  );
  if (persistedReservation.status !== "ok") return { status: "refused", reason: "state-conflict" };
  const observedBefore = await input.observeBefore();
  if (checkDeliveryOperationPrecondition(persistedReservation.value, observedBefore).status !== "ready") {
    return { status: "refused", reason: "precondition-mismatch" };
  }
  if ((await input.refreshProvider()).status !== "accepted") {
    return { status: "refused", reason: "provider-refused" };
  }
  const observed = await input.observeResult();
  const movements = changedProviderMovements(before, observed);
  if (movements === null || movements.length === 0) {
    return { status: "refused", reason: "ambiguous-result" };
  }
  const refusal = await proveProviderMovements(movements, input.proveContribution);
  if (refusal !== null) return refusal;
  const applied = applyProviderObservation(persistedReservation.value.value, observed);
  if (applied === null) return { status: "refused", reason: "ambiguous-result" };
  const persisted = await input.stateStore.publish(
    input.plan.planId, applied, persistedReservation.value.revision,
  );
  return persisted.status === "ok"
    ? { status: "applied", state: persisted.value }
    : { status: "refused", reason: "state-conflict" };
}

/**
 * Observe and adopt an externally initiated provider refresh without inventing a reservation.
 *
 * @param input - Planned member range, bounded observer, contribution arbiter, and version-checked state store
 * @returns Applied current coordinates or a typed refusal without writing intermediate state
 */
export async function adoptExternalDeliverySuffixRefresh(input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly affectedDeliverableIds: readonly string[];
  readonly observeResult: () => Promise<DeliveryOperationSnapshotV1>;
  readonly proveContribution: (
    movement: DeliveryProviderRefreshMovement,
  ) => Promise<DeliveryContributionProofResult>;
  readonly stateStore: StateWriter;
}): Promise<
  | { readonly status: "applied"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
  | DeliveryContributionRefusal
  | {
      readonly status: "refused";
      readonly reason: "position-mismatch" | "operation-active" | "ambiguous-result" | "state-conflict";
    }
> {
  if (input.current.value.activeOperation !== null) {
    return { status: "refused", reason: "operation-active" };
  }
  if (!isPlannedNonterminalRange(input.plan, input.affectedDeliverableIds)
    || validateDeliveryStateAgainstPlan(input.current.value, input.plan).status === "refused") {
    return { status: "refused", reason: "position-mismatch" };
  }
  const before = snapshotFor(input.current.value, input.affectedDeliverableIds);
  if (before === null || before.target === null || before.target.coordinates === null
    || before.members.some((member) => member.ref === null || member.changeRequest === null
      || member.coordinates === null)) {
    return { status: "refused", reason: "position-mismatch" };
  }
  const observed = await input.observeResult();
  const movements = changedProviderMovements(before, observed);
  if (movements === null || movements.length === 0) {
    return { status: "refused", reason: "ambiguous-result" };
  }
  const refusal = await proveProviderMovements(movements, input.proveContribution);
  if (refusal !== null) return refusal;
  const applied = applyProviderObservation(input.current.value, observed);
  if (applied === null) return { status: "refused", reason: "ambiguous-result" };
  const persisted = await input.stateStore.publish(input.plan.planId, applied, input.current.revision);
  return persisted.status === "ok"
    ? { status: "applied", state: persisted.value }
    : { status: "refused", reason: "state-conflict" };
}
