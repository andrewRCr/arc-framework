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
import type { DeliveryChainAbsorptionResult } from "./chain-absorption.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";

type StateWriter = Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;

/** One provider-assigned member coordinate change presented to the contribution arbiter. */
export interface DeliveryProviderRefreshMovement {
  readonly deliverableId: string;
  readonly before: DeliveryOperationSnapshotV1["members"][number];
  readonly after: DeliveryOperationSnapshotV1["members"][number];
}

/** One provider observation whose target movement has been established outside caller-authored input. */
export interface DeliveryProviderRefreshObservation {
  readonly snapshot: DeliveryOperationSnapshotV1;
  readonly targetMovement: "exact" | "append-only";
}

/** Fresh provider observation or the closed reason it could not be established. */
export type DeliveryProviderRefreshObservationResult =
  | { readonly status: "observed"; readonly observation: DeliveryProviderRefreshObservation }
  | {
      readonly status: "refused";
      readonly reason: "observation-unavailable" | "ambiguous-provider-movement" | "target-rewritten";
    };

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

function observationMatchesSubject(
  before: DeliveryOperationSnapshotV1,
  observed: DeliveryProviderRefreshObservation,
): boolean {
  const targetCoordinates = observed.snapshot.target?.coordinates;
  const targetMatches = targetCoordinates !== null && targetCoordinates !== undefined
    && observed.snapshot.target?.ref === before.target?.ref
    && (observed.targetMovement === "append-only"
      || canonicalize(observed.snapshot.target) === canonicalize(before.target));
  if (!targetMatches || observed.snapshot.members.length !== before.members.length) return false;
  return before.members.every((member, index) => {
    const result = observed.snapshot.members[index];
    const expectedBase = index === 0
      ? targetCoordinates.head
      : observed.snapshot.members[index - 1]?.coordinates?.head;
    return result !== undefined && result.deliverableId === member.deliverableId
      && result.ref === member.ref
      && canonicalize(result.changeRequest) === canonicalize(member.changeRequest)
      && result.coordinates !== null
      && result.coordinates.base === expectedBase;
  });
}

/** Derive every changed member after validating one exact provider-refresh subject. */
export function changedDeliveryProviderRefreshMovements(
  before: DeliveryOperationSnapshotV1,
  observed: DeliveryProviderRefreshObservation,
): DeliveryProviderRefreshMovement[] | null {
  if (!observationMatchesSubject(before, observed)) return null;
  return before.members.flatMap((member, index) => {
    const result = observed.snapshot.members[index];
    if (result === undefined || canonicalize(result.coordinates) === canonicalize(member.coordinates)) return [];
    return [{ deliverableId: member.deliverableId, before: member, after: result }];
  });
}

/** Whether the terminal top still records a predecessor older than the refreshed suffix. */
export function deliveryTerminalAbsorptionOwed(
  state: DeliveryStateV1,
  snapshot: DeliveryOperationSnapshotV1,
): boolean {
  const terminal = state.members.at(-1)?.coordinates;
  const highest = snapshot.members.at(-1)?.coordinates;
  return terminal !== null && terminal !== undefined && highest !== null && highest !== undefined
    && terminal.base !== highest.head;
}

/** Prove each changed provider-refresh member through the shared contribution arbiter. */
export async function proveDeliveryProviderRefreshMovements(
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

function applyProviderSettlement(
  state: DeliveryStateV1,
  observed: DeliveryProviderRefreshObservation,
  terminalCoordinates: NonNullable<DeliveryStateV1["members"][number]["coordinates"]>,
): DeliveryStateV1 | null {
  const byId = new Map(observed.snapshot.members.map((member) => [member.deliverableId, member]));
  const parsed = DeliveryStateV1Schema.safeParse({
    ...state,
    target: observed.snapshot.target,
    members: state.members.map((member, index) => {
      if (index === state.members.length - 1) return { ...member, coordinates: terminalCoordinates };
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

type ProviderAdoptionBlockedResult =
  | BlockedContributionRefusal
  | {
      readonly status: "blocked";
      readonly reason: string;
      readonly paths?: readonly string[];
    };

export interface ProviderAdoptionSettlementDependencies {
  readonly observeResult: () => Promise<DeliveryProviderRefreshObservationResult>;
  readonly proveContribution: (
    movement: DeliveryProviderRefreshMovement,
  ) => Promise<DeliveryContributionProofResult>;
  readonly absorbTop: (input: {
    readonly topRef: string;
    readonly top: { readonly head: string; readonly tree: string };
    readonly highestMember: { readonly head: string; readonly tree: string };
  }) => Promise<DeliveryChainAbsorptionResult>;
  readonly publishTop: (input: {
    readonly ref: string;
    readonly beforeHead: string;
    readonly requestedHead: string;
  }) => Promise<
    | { readonly status: "published" | "adopted" }
    | { readonly status: "refused"; readonly reason: "collision" | "malformed" | "unavailable" }
  >;
  readonly rewriteLocalRef: (input: {
    readonly ref: string;
    readonly beforeHead: string;
    readonly requestedHead: string;
  }) => Promise<
    | { readonly status: "rewritten" | "adopted" }
    | { readonly status: "refused"; readonly reason?: string }
  >;
  readonly cleanupPreparedCandidates?: () => Promise<
    | { readonly status: "cleaned" }
    | { readonly status: "refused"; readonly reason: string }
  >;
  readonly stateStore: StateWriter;
}

/** Reobserve and finish one persisted post-observation provider-adoption reservation. */
export async function settleReservedDeliverySuffixRefresh(input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
} & ProviderAdoptionSettlementDependencies): Promise<
  | { readonly status: "applied"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
  | ProviderAdoptionBlockedResult
> {
  const active = validateDeliveryActiveOperation(input.current);
  if (active.status !== "valid" || active.operation.kind !== "rewrite"
    || (active.operation.mode !== "provider-adoption" && active.operation.mode !== "provider-refresh")
    || !isPlannedNonterminalSuffix(input.plan, active.operation.affectedDeliverableIds)
    || validateDeliveryStateAgainstPlan(active.state, input.plan).status === "refused") {
    return { status: "blocked", reason: "ambiguous" };
  }
  const requested = DeliveryOperationSnapshotV1Schema.safeParse(active.operation.requested);
  if (!requested.success) {
    return { status: "blocked", reason: "ambiguous" };
  }
  const fresh = await input.observeResult();
  if (fresh.status === "refused") return { status: "blocked", reason: fresh.reason };
  const freshObservation = fresh.observation;
  const observed = DeliveryOperationSnapshotV1Schema.safeParse(freshObservation.snapshot);
  if (!observed.success) return { status: "blocked", reason: "ambiguous" };
  const observation = { ...freshObservation, snapshot: observed.data };
  if (canonicalize(observation.snapshot) !== canonicalize(requested.data)) {
    return { status: "blocked", reason: "ambiguous" };
  }
  const movements = changedDeliveryProviderRefreshMovements(active.operation.before, observation);
  if (movements === null || (movements.length === 0
    && !deliveryTerminalAbsorptionOwed(active.state, observation.snapshot))) {
    return { status: "blocked", reason: "ambiguous" };
  }
  const refusal = await proveDeliveryProviderRefreshMovements(movements, input.proveContribution);
  if (refusal !== null) return { ...refusal, status: "blocked" };

  for (const movement of movements) {
    if (movement.before.ref === null || movement.after.ref !== movement.before.ref
      || movement.before.coordinates === null || movement.after.coordinates === null) {
      return { status: "blocked", reason: "local-ref-subject-mismatch" };
    }
    if (movement.before.coordinates.head === movement.after.coordinates.head) continue;
    const rewritten = await input.rewriteLocalRef({
      ref: movement.before.ref,
      beforeHead: movement.before.coordinates.head,
      requestedHead: movement.after.coordinates.head,
    });
    if (rewritten.status === "refused") {
      return { status: "blocked", reason: `local-ref-${rewritten.reason ?? "refused"}` };
    }
  }

  const terminal = active.state.members.at(-1);
  const highestMember = observation.snapshot.members.at(-1);
  if (terminal?.ref === null || terminal?.ref === undefined || terminal.coordinates === null
    || highestMember?.coordinates === null || highestMember?.coordinates === undefined) {
    return { status: "blocked", reason: "terminal-top-unavailable" };
  }
  let terminalCoordinates = terminal.coordinates;
  if (terminalCoordinates.base !== highestMember.coordinates.head) {
    const absorbed = await input.absorbTop({
      topRef: terminal.ref,
      top: { head: terminalCoordinates.head, tree: terminalCoordinates.tree },
      highestMember: {
        head: highestMember.coordinates.head,
        tree: highestMember.coordinates.tree,
      },
    });
    if (absorbed.status !== "absorbed") {
      return {
        status: "blocked",
        reason: absorbed.reason,
        ...(absorbed.paths === undefined ? {} : { paths: absorbed.paths }),
      };
    }
    const published = await input.publishTop({
      ref: terminal.ref,
      beforeHead: terminalCoordinates.head,
      requestedHead: absorbed.head,
    });
    if (published.status === "refused") {
      return { status: "blocked", reason: `top-publish-${published.reason}` };
    }
    terminalCoordinates = {
      base: highestMember.coordinates.head,
      head: absorbed.head,
      tree: absorbed.tree,
    };
  }
  if (active.operation.mode === "provider-refresh") {
    if (input.cleanupPreparedCandidates === undefined) {
      return { status: "blocked", reason: "candidate-cleanup-unavailable" };
    }
    const cleaned = await input.cleanupPreparedCandidates();
    if (cleaned.status === "refused") {
      return { status: "blocked", reason: `candidate-cleanup-${cleaned.reason}` };
    }
  }
  const applied = applyProviderSettlement(active.state, observation, terminalCoordinates);
  if (applied === null || validateDeliveryStateAgainstPlan(applied, input.plan).status === "refused") {
    return { status: "blocked", reason: "ambiguous" };
  }
  const persisted = await input.stateStore.publish(
    input.plan.planId,
    applied,
    input.current.revision,
  );
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
  readonly operationMode?: "review-fix" | "selected-change";
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
    mode: input.operationMode ?? "review-fix",
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
 * Observe and prove an external provider refresh, then reserve and settle ARC's top adoption.
 *
 * @param input - Planned suffix, bounded observers, contribution arbiter, top boundaries, and state store
 * @returns Applied suffix and terminal coordinates, or a refusal before/after the settlement reservation
 */
export async function adoptExternalDeliverySuffixRefresh(input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly affectedDeliverableIds: readonly string[];
} & ProviderAdoptionSettlementDependencies): Promise<
  | { readonly status: "applied"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
  | DeliveryContributionRefusal
  | ProviderAdoptionBlockedResult
  | {
      readonly status: "refused";
      readonly reason:
        | "position-mismatch"
        | "operation-active"
        | "ambiguous-result"
        | "reservation-refused"
        | "state-conflict"
        | "observation-unavailable"
        | "ambiguous-provider-movement"
        | "target-rewritten";
    }
> {
  if (input.current.value.activeOperation !== null) {
    return { status: "refused", reason: "operation-active" };
  }
  if (!isPlannedNonterminalSuffix(input.plan, input.affectedDeliverableIds)
    || validateDeliveryStateAgainstPlan(input.current.value, input.plan).status === "refused") {
    return { status: "refused", reason: "position-mismatch" };
  }
  const before = snapshotFor(input.current.value, input.affectedDeliverableIds);
  if (before === null || before.target === null || before.target.coordinates === null
    || before.members.some((member) => member.ref === null || member.changeRequest === null
      || member.coordinates === null)) {
    return { status: "refused", reason: "position-mismatch" };
  }
  const initial = await input.observeResult();
  if (initial.status === "refused") return initial;
  const initialObservation = initial.observation;
  const parsed = DeliveryOperationSnapshotV1Schema.safeParse(initialObservation.snapshot);
  if (!parsed.success) return { status: "refused", reason: "ambiguous-result" };
  const observed = { ...initialObservation, snapshot: parsed.data };
  const movements = changedDeliveryProviderRefreshMovements(before, observed);
  if (movements === null || (movements.length === 0
    && !deliveryTerminalAbsorptionOwed(input.current.value, observed.snapshot))) {
    return { status: "refused", reason: "ambiguous-result" };
  }
  const refusal = await proveDeliveryProviderRefreshMovements(movements, input.proveContribution);
  if (refusal !== null) return refusal;
  const reserved = reserveDeliveryOperation(input.current, input.plan, {
    operationId: crypto.randomUUID(),
    kind: "rewrite",
    mode: "provider-adoption",
    affectedDeliverableIds: input.affectedDeliverableIds,
    expectedStateRevision: input.current.revision,
    before,
    requested: observed.snapshot,
  });
  if (reserved.status !== "reserved") return { status: "refused", reason: "reservation-refused" };
  const persistedReservation = await input.stateStore.publish(
    input.plan.planId,
    reserved.state,
    input.current.revision,
  );
  if (persistedReservation.status !== "ok") return { status: "refused", reason: "state-conflict" };
  return settleReservedDeliverySuffixRefresh({
    plan: input.plan,
    current: persistedReservation.value,
    observeResult: input.observeResult,
    proveContribution: input.proveContribution,
    absorbTop: input.absorbTop,
    publishTop: input.publishTop,
    rewriteLocalRef: input.rewriteLocalRef,
    stateStore: input.stateStore,
  });
}
