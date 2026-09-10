/** Pure reservation and reconciliation guards for one delivery operation. */

import { z } from "zod";

import { canonicalize } from "../kernel/index.js";
import { validateDeliveryPlanRecord } from "./plan.js";
import type { DeliveryRevisionedRecord } from "./ports.js";
import {
  DeliveryCanonicalDigestSchema,
  DeliveryCandidateCleanupHeadV1Schema,
  DeliveryLandEffectV1Schema,
  DeliveryHostEffectIdentityV1Schema,
  DeliveryOperationCommonV1Schema,
  DeliveryOperationSnapshotV1Schema,
  DeliveryPendingReviewFixVerificationV1Schema,
  DeliveryPublishEffectV1Schema,
  DeliveryStateV1Schema,
  DeliveryTerminalAuthoringMovementV1Schema,
  DeliveryTopRemedyEffectV1Schema,
  type DeliveryActiveOperationV1,
  type DeliveryOperationSnapshotV1,
  type DeliveryPlanV1,
  type DeliveryStateV1,
} from "./schema.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";

/** Caller-supplied operation intent before state-owned binding fields are added. */
const reservationFields = {
  expectedStateRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
};
export const DeliveryOperationReservationRequestV1Schema = z.discriminatedUnion("kind", [
  DeliveryOperationCommonV1Schema.omit({ stateRevision: true, boundPlanDigest: true })
    .extend({ ...reservationFields, kind: z.literal("materialize") }),
  DeliveryOperationCommonV1Schema.omit({ stateRevision: true, boundPlanDigest: true })
    .extend({
      ...reservationFields,
      kind: z.literal("rewrite"),
      mode: z.enum(["review-fix", "selected-change", "provider-adoption", "provider-refresh"]),
      supersedePendingReviewFixVerification: DeliveryPendingReviewFixVerificationV1Schema.optional(),
      terminalAuthoringMovement: DeliveryTerminalAuthoringMovementV1Schema.optional(),
      reviewFixSelectedDeliverableId: DeliveryCanonicalDigestSchema.optional(),
      reviewFixVerificationDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1).optional(),
    }),
  DeliveryOperationCommonV1Schema.omit({ stateRevision: true, boundPlanDigest: true })
    .extend({
      ...reservationFields,
      kind: z.literal("teardown"),
      mode: z.enum(["member", "closeout-residue"]),
      candidateHeads: z.array(DeliveryCandidateCleanupHeadV1Schema).refine(
        (heads) => new Set(heads.map(({ deliverableId }) => deliverableId)).size === heads.length,
        "candidate cleanup heads must be distinct",
      ),
    }),
  DeliveryOperationCommonV1Schema.omit({ stateRevision: true, boundPlanDigest: true })
    .extend({ ...reservationFields, kind: z.literal("publish"), effect: DeliveryPublishEffectV1Schema }),
  DeliveryOperationCommonV1Schema.omit({ stateRevision: true, boundPlanDigest: true })
    .extend({
      ...reservationFields,
      kind: z.literal("land"),
      mode: z.enum(["sequential", "native"]),
      nativeArm: z.enum(["linked-single", "linked-atomic"]).nullable(),
      effect: DeliveryLandEffectV1Schema,
    }),
  DeliveryOperationCommonV1Schema.omit({ stateRevision: true, boundPlanDigest: true })
    .extend({ ...reservationFields, kind: z.literal("top-remedy"), effect: DeliveryTopRemedyEffectV1Schema }),
]);
export type DeliveryOperationReservationRequestV1 = z.infer<
  typeof DeliveryOperationReservationRequestV1Schema
>;

const DeliveryHostAssignedObservationV1Schema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("publish"),
    effect: DeliveryPublishEffectV1Schema,
    outcome: z.literal("applied"),
    snapshot: DeliveryOperationSnapshotV1Schema,
  }),
  z.strictObject({
    kind: z.literal("land"),
    effect: DeliveryLandEffectV1Schema,
    outcome: z.literal("applied"),
    snapshot: DeliveryOperationSnapshotV1Schema,
  }),
  z.strictObject({
    kind: z.literal("top-remedy"),
    effect: DeliveryTopRemedyEffectV1Schema,
    outcome: z.literal("applied"),
    snapshot: DeliveryOperationSnapshotV1Schema,
  }),
]);

const DeliveryHostReconciliationObservationV1Schema = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.literal("applied"),
    observation: DeliveryHostAssignedObservationV1Schema,
  }),
  z.strictObject({ outcome: z.literal("not-applied") }),
  z.strictObject({ outcome: z.literal("ambiguous") }),
]);
const DeliveryTeardownReconciliationObservationV1Schema = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.literal("applied"),
    snapshot: DeliveryOperationSnapshotV1Schema,
  }),
  z.strictObject({ outcome: z.literal("not-applied") }),
  z.strictObject({ outcome: z.literal("ambiguous") }),
]);
/** Host-assigned observation used to reconcile an interrupted publish or land. */
export type DeliveryHostReconciliationObservationV1 = z.infer<
  typeof DeliveryHostReconciliationObservationV1Schema
>;
/** Physical outcome used when teardown intentionally retains its exact logical snapshot. */
export type DeliveryTeardownReconciliationObservationV1 = z.infer<
  typeof DeliveryTeardownReconciliationObservationV1Schema
>;
/** Exact observation accepted by delivery-operation reconciliation. */
export type DeliveryOperationReconciliationObservationV1 =
  | DeliveryOperationSnapshotV1
  | DeliveryHostReconciliationObservationV1
  | DeliveryTeardownReconciliationObservationV1;

/** Closed failures while reserving the single delivery-operation slot. */
export type ReserveDeliveryOperationFailure =
  | "state-invalid"
  | "plan-invalid"
  | "stale-state"
  | "stale-plan-binding"
  | "operation-active"
  | "pending-review-fix-verification"
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

/** Result of validating the state-owned active operation against its published revision. */
export type ValidateDeliveryActiveOperationResult =
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
        changeRequest: member.changeRequest,
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

function terminalAuthoringMovementMatchesState(
  state: DeliveryStateV1,
  movement: z.infer<typeof DeliveryTerminalAuthoringMovementV1Schema>,
): boolean {
  const terminal = state.members.at(-1);
  // Position observation proves an intermediate publication lease is append-only; settlement
  // revalidates that exact lease through the host CAS. State binding owns only the H0 -> H2 span.
  return terminal !== undefined && terminal.deliverableId === movement.deliverableId
    && terminal.coordinates !== null
    && canonicalize(terminal.coordinates) === canonicalize(movement.before)
    && movement.after.base === movement.before.base
    && movement.after.head !== movement.before.head;
}

function reviewFixSelectionMatchesState(
  state: DeliveryStateV1,
  operation: {
    readonly mode: "selected-change" | "review-fix" | "provider-refresh" | "provider-adoption";
    readonly affectedDeliverableIds: readonly string[];
    readonly reviewFixSelectedDeliverableId?: string;
    readonly reviewFixVerificationDeliverableIds?: readonly string[];
  },
): boolean {
  if (operation.reviewFixSelectedDeliverableId === undefined) {
    return operation.reviewFixVerificationDeliverableIds === undefined;
  }
  if (operation.reviewFixVerificationDeliverableIds === undefined) return false;
  const selectedIndex = state.members.findIndex(
    ({ deliverableId }) => deliverableId === operation.reviewFixSelectedDeliverableId,
  );
  const verificationIds = operation.reviewFixVerificationDeliverableIds;
  const stateOrder = state.members
    .filter(({ deliverableId }) => verificationIds.includes(deliverableId))
    .map(({ deliverableId }) => deliverableId);
  const validSelection = selectedIndex >= 0
    && selectedIndex < state.members.length - 1
    && verificationIds.includes(operation.reviewFixSelectedDeliverableId)
    && new Set(verificationIds).size === verificationIds.length
    && canonicalize(stateOrder) === canonicalize(verificationIds);
  if (!validSelection) return false;
  if (operation.mode === "review-fix") return true;
  return (operation.mode === "provider-refresh" || operation.mode === "provider-adoption")
    && operation.affectedDeliverableIds.includes(operation.reviewFixSelectedDeliverableId)
    && verificationIds.every((deliverableId) => operation.affectedDeliverableIds.includes(deliverableId));
}

function clearDeliveryOperationReservation(state: DeliveryStateV1): DeliveryStateV1 | null {
  const operation = state.activeOperation;
  const selectedDeliverableId = operation?.kind === "rewrite" && operation.mode === "review-fix"
    ? operation.reviewFixSelectedDeliverableId
    : undefined;
  const memberDeliverableIds = operation?.kind === "rewrite" && operation.mode === "review-fix"
    ? operation.reviewFixVerificationDeliverableIds
    : undefined;
  if ((selectedDeliverableId === undefined) !== (memberDeliverableIds === undefined)) return null;
  const parsed = DeliveryStateV1Schema.safeParse({
    ...state,
    activeOperation: null,
    pendingReviewFixVerification: selectedDeliverableId === undefined
      || memberDeliverableIds === undefined
      ? state.pendingReviewFixVerification
      : { selectedDeliverableId, memberDeliverableIds },
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Project the cleared state for one validated retryable reservation.
 *
 * @param current - Published reservation state and its store-owned revision
 * @returns Cleared state with any carried rematerialization verification restored, or null when invalid
 */
export function projectDeliveryOperationRetryState(
  current: DeliveryRevisionedRecord<DeliveryStateV1>,
): DeliveryStateV1 | null {
  const active = validateDeliveryActiveOperation(current);
  return active.status === "valid" ? clearDeliveryOperationReservation(active.state) : null;
}

/**
 * Validate the one active operation carried by a published state revision.
 *
 * @param current - Published delivery state and its store-owned revision.
 * @returns The validated operation and state, or a closed comparison failure.
 */
export function validateDeliveryActiveOperation(
  current: DeliveryRevisionedRecord<DeliveryStateV1>,
): ValidateDeliveryActiveOperationResult {
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
  if (operation.kind === "teardown") {
    const candidateIds = operation.candidateHeads.map(({ deliverableId }) => deliverableId);
    const allStateIds = parsedState.data.members.map(({ deliverableId }) => deliverableId);
    if ((operation.mode === "member"
      && (operation.affectedDeliverableIds.length !== 1 || candidateIds.length !== 0))
      || (operation.mode === "closeout-residue"
        && (canonicalize(operation.affectedDeliverableIds) !== canonicalize(allStateIds)
          || canonicalize(candidateIds) !== canonicalize(allStateIds)))) {
      return { status: "blocked", reason: "state-invalid" };
    }
  }
  if (operation.kind === "rewrite" && operation.terminalAuthoringMovement !== undefined
    && ((operation.mode !== "provider-refresh" && operation.mode !== "provider-adoption")
      || !terminalAuthoringMovementMatchesState(parsedState.data, operation.terminalAuthoringMovement))) {
    return { status: "blocked", reason: "state-invalid" };
  }
  if (operation.kind === "rewrite" && !reviewFixSelectionMatchesState(parsedState.data, operation)) {
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

function applyObservedSnapshot(
  state: DeliveryStateV1,
  observed: DeliveryOperationSnapshotV1,
): DeliveryStateV1 | null {
  const observedByDeliverable = new Map(
    observed.members.map((member) => [member.deliverableId, member]),
  );
  return clearDeliveryOperationReservation({
    ...state,
    target: observed.target,
    members: state.members.map((member) => {
      const result = observedByDeliverable.get(member.deliverableId);
      return result === undefined ? member : {
        ...member,
        ref: result.ref,
        changeRequest: result.changeRequest,
        coordinates: result.coordinates,
      };
    }),
  });
}

function matchesHostAssignedResult(
  operation: DeliveryActiveOperationV1,
  observed: DeliveryOperationSnapshotV1,
): boolean {
  if (operation.kind === "publish") {
    if (observed.members.some((member) => member.changeRequest === null)) return false;
    const stableObservation = {
      ...observed,
      members: observed.members.map((member, index) => ({
        ...member,
        changeRequest: operation.requested.members[index]?.changeRequest ?? null,
      })),
    };
    return canonicalize(stableObservation) === canonicalize(operation.requested);
  }
  if (operation.kind === "land") {
    if (operation.requested.target === null || observed.target === null || observed.target.coordinates === null
      || observed.members.some((member) => member.coordinates === null)) return false;
    const stableObservation = {
      ...observed,
      target: {
        ...observed.target,
        coordinates: operation.requested.target.coordinates,
      },
      members: observed.members.map((member, index) => ({
        ...member,
        coordinates: operation.requested.members[index]?.coordinates ?? null,
      })),
    };
    return canonicalize(stableObservation) === canonicalize(operation.requested);
  }
  return canonicalize(observed) === canonicalize(operation.requested);
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
  const pendingVerification = parsedState.data.pendingReviewFixVerification;
  const rewriteRequest = parsedRequest.data.kind === "rewrite" ? parsedRequest.data : null;
  const explicitPendingVerificationSupersession = rewriteRequest?.supersedePendingReviewFixVerification;
  if (explicitPendingVerificationSupersession !== undefined
    && (rewriteRequest === null || rewriteRequest.mode !== "review-fix" || pendingVerification === null)) {
    return { status: "refused", reason: "operation-invalid" };
  }
  const supersedesSelectedChangeVerification = pendingVerification !== null
    && rewriteRequest !== null
    && rewriteRequest.mode === "selected-change"
    && canonicalize(rewriteRequest.affectedDeliverableIds)
      === canonicalize(pendingVerification.memberDeliverableIds)
    && rewriteRequest.affectedDeliverableIds.length === 1
    && rewriteRequest.affectedDeliverableIds[0] === pendingVerification.selectedDeliverableId;
  const supersedesExactPendingVerification = pendingVerification !== null
    && explicitPendingVerificationSupersession !== undefined
    && canonicalize(explicitPendingVerificationSupersession) === canonicalize(pendingVerification);
  const carriesReviewFixContinuation = rewriteRequest?.mode === "review-fix"
    && (rewriteRequest.reviewFixSelectedDeliverableId !== undefined
      || rewriteRequest.reviewFixVerificationDeliverableIds !== undefined);
  if (carriesReviewFixContinuation && explicitPendingVerificationSupersession === undefined) {
    return { status: "refused", reason: "operation-invalid" };
  }
  if (supersedesExactPendingVerification && rewriteRequest !== null
    && (rewriteRequest.reviewFixSelectedDeliverableId !== pendingVerification.selectedDeliverableId
      || canonicalize(rewriteRequest.reviewFixVerificationDeliverableIds)
        !== canonicalize(pendingVerification.memberDeliverableIds))) {
    return { status: "refused", reason: "operation-invalid" };
  }
  const supersedesPendingVerification = supersedesSelectedChangeVerification
    || supersedesExactPendingVerification;
  if (pendingVerification !== null && !supersedesPendingVerification) {
    return { status: "refused", reason: "pending-review-fix-verification" };
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
  if (parsedRequest.data.kind === "teardown") {
    const candidateIds = parsedRequest.data.candidateHeads.map(({ deliverableId }) => deliverableId);
    if (parsedRequest.data.mode === "member") {
      if (parsedRequest.data.affectedDeliverableIds.length !== 1 || candidateIds.length !== 0) {
        return { status: "refused", reason: "operation-invalid" };
      }
    } else {
      const allIds = plan.members.map(({ deliverableId }) => deliverableId);
      if (canonicalize(parsedRequest.data.affectedDeliverableIds) !== canonicalize(allIds)
        || canonicalize(candidateIds) !== canonicalize(allIds)) {
        return { status: "refused", reason: "operation-invalid" };
      }
    }
  }
  if (parsedRequest.data.kind === "land"
    && ((parsedRequest.data.mode === "native") !== (parsedRequest.data.nativeArm !== null))) {
    return { status: "refused", reason: "operation-invalid" };
  }
  if (parsedRequest.data.kind === "rewrite" && parsedRequest.data.terminalAuthoringMovement !== undefined
    && ((parsedRequest.data.mode !== "provider-refresh" && parsedRequest.data.mode !== "provider-adoption")
      || !terminalAuthoringMovementMatchesState(
        parsedState.data,
        parsedRequest.data.terminalAuthoringMovement,
      ))) {
    return { status: "refused", reason: "operation-invalid" };
  }
  if (parsedRequest.data.kind === "rewrite") {
    if (!reviewFixSelectionMatchesState(parsedState.data, parsedRequest.data)) {
      return { status: "refused", reason: "operation-invalid" };
    }
  }
  if (canonicalize(snapshotFromState(parsedState.data, parsedRequest.data.affectedDeliverableIds))
    !== canonicalize(parsedRequest.data.before)) {
    return { status: "refused", reason: "before-state-mismatch" };
  }

  const reserved = DeliveryStateV1Schema.safeParse({
    ...parsedState.data,
    pendingReviewFixVerification: supersedesPendingVerification
      ? null
      : parsedState.data.pendingReviewFixVerification,
    activeOperation: {
      operationId: parsedRequest.data.operationId,
      kind: parsedRequest.data.kind,
      affectedDeliverableIds: parsedRequest.data.affectedDeliverableIds,
      stateRevision: current.revision,
      boundPlanDigest: plan.planDigest,
      before: parsedRequest.data.before,
      requested: parsedRequest.data.requested,
      ...(parsedRequest.data.kind === "rewrite" || parsedRequest.data.kind === "land"
        || parsedRequest.data.kind === "teardown"
        ? { mode: parsedRequest.data.mode }
        : {}),
      ...(parsedRequest.data.kind === "rewrite"
        && parsedRequest.data.terminalAuthoringMovement !== undefined
        ? { terminalAuthoringMovement: parsedRequest.data.terminalAuthoringMovement }
        : {}),
      ...(parsedRequest.data.kind === "rewrite"
        && parsedRequest.data.reviewFixSelectedDeliverableId !== undefined
        ? { reviewFixSelectedDeliverableId: parsedRequest.data.reviewFixSelectedDeliverableId }
        : {}),
      ...(parsedRequest.data.kind === "rewrite"
        && parsedRequest.data.reviewFixVerificationDeliverableIds !== undefined
        ? { reviewFixVerificationDeliverableIds: parsedRequest.data.reviewFixVerificationDeliverableIds }
        : {}),
      ...(parsedRequest.data.kind === "teardown"
        ? { candidateHeads: parsedRequest.data.candidateHeads }
        : {}),
      ...(parsedRequest.data.kind === "publish" || parsedRequest.data.kind === "land"
        || parsedRequest.data.kind === "top-remedy"
        ? { effect: parsedRequest.data.effect }
        : {}),
      ...(parsedRequest.data.kind === "land" ? { effectIdentity: null } : {}),
      ...(parsedRequest.data.kind === "land"
        ? {
            native: parsedRequest.data.nativeArm === null
              ? null
              : { arm: parsedRequest.data.nativeArm, phase: "prepared" as const },
          }
        : {}),
    },
  });
  if (!reserved.success) return { status: "refused", reason: "operation-invalid" };
  return { status: "reserved", state: reserved.data };
}

export type AttachDeliveryOperationEffectIdentityResult =
  | { readonly status: "attached" | "already-attached"; readonly state: DeliveryStateV1 }
  | { readonly status: "refused"; readonly reason: "state-invalid" | "operation-stale" | "wrong-operation" | "identity-invalid" | "identity-conflict" };

export type BeginNativeDeliverySubmissionResult =
  | { readonly status: "begun"; readonly state: DeliveryStateV1 }
  | {
      readonly status: "refused";
      readonly reason: "state-invalid" | "operation-stale" | "wrong-operation" | "already-submitting";
    };

/** Advance one exact prepared native reservation to submitting before provider access. */
export function beginNativeDeliverySubmission(
  current: DeliveryRevisionedRecord<DeliveryStateV1>,
  operationId: string,
): BeginNativeDeliverySubmissionResult {
  const active = validateDeliveryActiveOperation(current);
  if (active.status === "blocked") {
    return { status: "refused", reason: active.reason === "state-invalid" ? "state-invalid" : "operation-stale" };
  }
  if (active.operation.kind !== "land" || active.operation.mode !== "native"
    || active.operation.native === null || active.operation.operationId !== operationId) {
    return { status: "refused", reason: "wrong-operation" };
  }
  if (active.operation.native.phase !== "prepared" || active.operation.effectIdentity !== null) {
    return { status: "refused", reason: "already-submitting" };
  }
  const parsed = DeliveryStateV1Schema.safeParse({
    ...active.state,
    activeOperation: {
      ...active.operation,
      stateRevision: current.revision,
      native: { ...active.operation.native, phase: "submitting" },
    },
  });
  return parsed.success
    ? { status: "begun", state: parsed.data }
    : { status: "refused", reason: "state-invalid" };
}

/** Attach one provider-assigned async identity to the existing land reservation. */
export function attachDeliveryOperationEffectIdentity(
  current: DeliveryRevisionedRecord<DeliveryStateV1>,
  operationId: string,
  identity: unknown,
): AttachDeliveryOperationEffectIdentityResult {
  const active = validateDeliveryActiveOperation(current);
  if (active.status === "blocked") {
    return { status: "refused", reason: active.reason === "state-invalid" ? "state-invalid" : "operation-stale" };
  }
  if (active.operation.kind !== "land" || active.operation.mode !== "native"
    || active.operation.native?.phase !== "submitting"
    || active.operation.operationId !== operationId) {
    return { status: "refused", reason: "wrong-operation" };
  }
  const parsedIdentity = DeliveryHostEffectIdentityV1Schema.safeParse(identity);
  if (!parsedIdentity.success) return { status: "refused", reason: "identity-invalid" };
  if (active.operation.effectIdentity !== null) {
    return canonicalize(active.operation.effectIdentity) === canonicalize(parsedIdentity.data)
      ? { status: "already-attached", state: active.state }
      : { status: "refused", reason: "identity-conflict" };
  }
  const parsed = DeliveryStateV1Schema.safeParse({
    ...active.state,
    activeOperation: {
      ...active.operation,
      stateRevision: current.revision,
      effectIdentity: parsedIdentity.data,
    },
  });
  return parsed.success
    ? { status: "attached", state: parsed.data }
    : { status: "refused", reason: "state-invalid" };
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
  const active = validateDeliveryActiveOperation(current);
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
  const active = validateDeliveryActiveOperation(current);
  if (active.status === "blocked") return active;
  const hostAssigned = active.operation.kind === "publish" || active.operation.kind === "land"
    || active.operation.kind === "top-remedy";
  const parsedHost = hostAssigned ? DeliveryHostAssignedObservationV1Schema.safeParse(observed) : null;
  if (hostAssigned && (parsedHost === null || !parsedHost.success
    || parsedHost.data.kind !== active.operation.kind
    || canonicalize(parsedHost.data.effect) !== canonicalize(active.operation.effect))) {
    return { status: "blocked", reason: "requested-mismatch" };
  }
  const parsedObserved = DeliveryOperationSnapshotV1Schema.safeParse(
    parsedHost?.success === true ? parsedHost.data.snapshot : observed,
  );
  if (!parsedObserved.success) return { status: "blocked", reason: "observed-facts-invalid" };
  if (!matchesHostAssignedResult(active.operation, parsedObserved.data)) {
    return { status: "blocked", reason: "requested-mismatch" };
  }
  const next = applyObservedSnapshot(active.state, parsedObserved.data);
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
  const active = validateDeliveryActiveOperation(current);
  if (active.status === "blocked") return active;
  if (active.operation.kind === "teardown") {
    const parsedTeardown = DeliveryTeardownReconciliationObservationV1Schema.safeParse(observed);
    if (!parsedTeardown.success) return { status: "blocked", reason: "observed-facts-invalid" };
    if (parsedTeardown.data.outcome === "not-applied") {
      return { status: "retry", operationId: active.operation.operationId };
    }
    if (parsedTeardown.data.outcome === "ambiguous") {
      return { status: "blocked", reason: "ambiguous-result" };
    }
    if (canonicalize(parsedTeardown.data.snapshot) !== canonicalize(active.operation.requested)) {
      return { status: "blocked", reason: "ambiguous-result" };
    }
    const next = applyObservedSnapshot(active.state, parsedTeardown.data.snapshot);
    return next === null
      ? { status: "blocked", reason: "state-invalid" }
      : { status: "adopt", state: next };
  }
  const hostAssigned = active.operation.kind === "publish" || active.operation.kind === "land"
    || active.operation.kind === "top-remedy";
  if (hostAssigned) {
    const parsedHost = DeliveryHostReconciliationObservationV1Schema.safeParse(observed);
    if (!parsedHost.success) return { status: "blocked", reason: "observed-facts-invalid" };
    if (parsedHost.data.outcome === "not-applied") {
      return { status: "retry", operationId: active.operation.operationId };
    }
    if (parsedHost.data.outcome === "ambiguous") return { status: "blocked", reason: "ambiguous-result" };
    return acceptHostReconciliation(active, parsedHost.data.observation);
  }
  const parsedObserved = DeliveryOperationSnapshotV1Schema.safeParse(observed);
  if (!parsedObserved.success) return { status: "blocked", reason: "observed-facts-invalid" };
  const observedBytes = canonicalize(parsedObserved.data);
  if (matchesHostAssignedResult(active.operation, parsedObserved.data)) {
    const next = applyObservedSnapshot(active.state, parsedObserved.data);
    return next === null
      ? { status: "blocked", reason: "state-invalid" }
      : { status: "adopt", state: next };
  }
  if (observedBytes === canonicalize(active.operation.before)) {
    return { status: "retry", operationId: active.operation.operationId };
  }
  return { status: "blocked", reason: "ambiguous-result" };
}

function acceptHostReconciliation(
  active: Extract<ValidateDeliveryActiveOperationResult, { readonly status: "valid" }>,
  observed: z.infer<typeof DeliveryHostAssignedObservationV1Schema>,
): ReconcileDeliveryOperationResult {
  if ((active.operation.kind !== "publish" && active.operation.kind !== "land"
      && active.operation.kind !== "top-remedy")
    || observed.kind !== active.operation.kind
    || canonicalize(observed.effect) !== canonicalize(active.operation.effect)
    || !matchesHostAssignedResult(active.operation, observed.snapshot)) {
    return { status: "blocked", reason: "ambiguous-result" };
  }
  const next = applyObservedSnapshot(active.state, observed.snapshot);
  return next === null
    ? { status: "blocked", reason: "state-invalid" }
    : { status: "adopt", state: next };
}
