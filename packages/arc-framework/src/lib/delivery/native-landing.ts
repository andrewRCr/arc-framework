/** Native-stack arm selection and exact-set attended landing preparation. */

import {
  attachDeliveryOperationEffectIdentity,
  reconcileDeliveryOperation,
  reserveDeliveryOperation,
} from "./operation.js";
import type { DeliveryRevisionedRecord, DeliveryStateStore } from "./ports.js";
import type { DeliveryOperationSnapshotV1, DeliveryPlanV1, DeliveryStateV1 } from "./schema.js";
import type { DeliveryNativeStackMember, DeliveryNativeStackObservation } from "./native-stack.js";
import { deriveDeliveryPosition, type DeliveryPositionFactsV1 } from "./position.js";
import type { DeliveryHostRequestObservation } from "./host.js";
import type { DeliveryContributionEndpoints, DeliveryContributionProofResult } from "./contribution-proof.js";
import {
  reconcileReservedSuffixRetarget,
  reserveObservedSuffixRetarget,
} from "./suffix-reconciliation.js";

export interface DeliveryNativeLandingMember {
  readonly deliverableId: string;
  readonly changeRequestId: string;
  readonly headSha: string;
}

export type DeriveNativeDeliveryMemberChainResult =
  | { readonly status: "derived"; readonly members: readonly DeliveryNativeStackMember[] }
  | { readonly status: "refused"; readonly reason: "member-unbound" | "member-mismatch" };

/** Derive the exact host chain from ordered selection plus current bound state. */
export function deriveNativeDeliveryMemberChain(input: {
  readonly state: DeliveryStateV1;
  readonly selectedMembers: readonly DeliveryNativeLandingMember[];
  readonly repository: string;
  readonly baseRef: string;
}): DeriveNativeDeliveryMemberChainResult {
  const members: DeliveryNativeStackMember[] = [];
  const seen = new Set<string>();
  for (const selected of input.selectedMembers) {
    const matches = input.state.members.filter((member) => member.deliverableId === selected.deliverableId);
    const bound = matches[0];
    if (matches.length !== 1 || bound?.ref === null || bound?.ref === undefined
      || bound.coordinates === null || bound.changeRequest === null) {
      return { status: "refused", reason: "member-unbound" };
    }
    if (seen.has(selected.deliverableId)
      || selected.changeRequestId !== bound.changeRequest.changeRequestId
      || selected.headSha !== bound.coordinates.head) {
      return { status: "refused", reason: "member-mismatch" };
    }
    seen.add(selected.deliverableId);
    members.push({
      deliverableId: bound.deliverableId,
      changeRequestId: bound.changeRequest.changeRequestId,
      headRef: bound.ref.replace(/^refs\/heads\//u, ""),
      headSha: bound.coordinates.head,
      baseRef: members.at(-1)?.headRef ?? input.baseRef.replace(/^refs\/heads\//u, ""),
      headRepository: input.repository,
    });
  }
  return { status: "derived", members };
}

export interface DeliveryNativeMergeRequest {
  readonly repository: string;
  readonly topChangeRequestId: string;
  readonly topHeadSha: string;
  readonly mergeAction: "direct_merge";
  readonly mergeMethod: "merge";
}

export type DeliveryNativeMergeSubmission =
  | { readonly status: "submitted" | "existing"; readonly effectIdentity: string }
  | { readonly status: "merged" }
  | { readonly status: "enqueued" }
  | { readonly status: "refused"; readonly reason: "malformed" | "unavailable" | "unsupported" };

export type DeliveryNativeMergeObservation =
  | { readonly status: "pending" | "merged" | "enqueued" | "failed" }
  | { readonly status: "refused"; readonly reason: "expired" | "malformed" | "unavailable" };

export interface DeliveryNativeMergeHostPort {
  submitNativeMerge(input: DeliveryNativeMergeRequest): Promise<DeliveryNativeMergeSubmission>;
  observeNativeMerge(input: DeliveryNativeMergeRequest & { readonly effectIdentity: string }): Promise<DeliveryNativeMergeObservation>;
}

export type DeliveryNativeLandingSelection =
  | {
    readonly status: "selected";
    readonly arm: "unlinked" | "linked-single" | "linked-atomic";
    readonly members: readonly DeliveryNativeLandingMember[];
    readonly recommendedActionText: string;
  }
  | { readonly status: "downgrade-required"; readonly reason: string; readonly recommendedActionText: string }
  | { readonly status: "blocked"; readonly reason: string; readonly recommendedActionText: string };

/** Select an arm only after exact plan-ordered facts have been supplied and freshly observed. */
export function selectNativeDeliveryLandingArm(input: {
  readonly plan: DeliveryPlanV1;
  readonly landedPrefix: readonly string[];
  readonly observation: DeliveryNativeStackObservation;
  readonly mergeStrategy: "merge" | "rebase" | "squash";
  readonly mergeAction: "direct" | "queue";
  readonly explicitAtomic: boolean;
  readonly members: readonly DeliveryNativeLandingMember[];
}): DeliveryNativeLandingSelection {
  const plannedPrefix = input.plan.members.slice(0, input.landedPrefix.length).map((member) => member.deliverableId);
  if (JSON.stringify(plannedPrefix) !== JSON.stringify(input.landedPrefix)) {
    return { status: "blocked", reason: "landed-prefix-mismatch", recommendedActionText: "Refresh delivery position before selecting a native landing arm." };
  }
  const expected = input.plan.members.slice(input.landedPrefix.length, -1);
  if (expected.length === 0) {
    return { status: "blocked", reason: "no-nonterminal-remainder", recommendedActionText: "Continue to ordinary terminal integration." };
  }
  if (input.members.length !== expected.length || input.members.some((member, index) => (
    member.deliverableId !== expected[index]?.deliverableId
  ))) {
    return { status: "blocked", reason: "member-set-mismatch", recommendedActionText: "Refresh the complete exact non-terminal remainder." };
  }
  const first = input.members[0];
  if (first === undefined) {
    return { status: "blocked", reason: "member-set-mismatch", recommendedActionText: "Refresh the complete exact non-terminal remainder." };
  }
  if (input.observation.status === "unregistered") {
    return { status: "selected", arm: "unlinked", members: [first], recommendedActionText: "Continue through the complete sequential unlinked executor." };
  }
  if (input.observation.status !== "registered") {
    return {
      status: "blocked",
      reason: input.observation.status,
      recommendedActionText: "Restore authoritative native-stack observation before selecting any landing arm.",
    };
  }
  if (input.mergeStrategy !== "merge") {
    return {
      status: "downgrade-required",
      reason: "merge-strategy-unsupported",
      recommendedActionText: "Unlink the registered stack and confirm a fresh unregistered observation before sequential delivery.",
    };
  }
  if (!input.explicitAtomic) {
    return { status: "selected", arm: "linked-single", members: [first], recommendedActionText: "Prepare one exact bottom-member asynchronous landing." };
  }
  if (input.mergeAction === "queue") {
    return {
      status: "downgrade-required", reason: "queue-not-atomic",
      recommendedActionText: "Unlink and continue sequentially; merge queues may split the remaining prefix.",
    };
  }
  return { status: "selected", arm: "linked-atomic", members: input.members, recommendedActionText: "Prepare the exact complete non-terminal remainder for one attended atomic effect." };
}

export type PrepareNativeDeliveryLandingResult =
  | { readonly status: "prepared"; readonly members: readonly DeliveryNativeLandingMember[]; readonly consequence: string }
  | { readonly status: "blocked"; readonly reason: "member-not-ready"; readonly recommendedActionText: string };

/** Independently admit every selected exact head before rendering one attended consequence. */
export async function prepareNativeDeliveryLanding(
  selection: Extract<DeliveryNativeLandingSelection, { status: "selected" }> | {
    readonly arm: "linked-single" | "linked-atomic";
    readonly members: readonly DeliveryNativeLandingMember[];
  },
  dependencies: {
    readonly readiness: (member: DeliveryNativeLandingMember) => Promise<{ readonly status: "ready" | "refused" }>;
  },
): Promise<PrepareNativeDeliveryLandingResult> {
  for (const member of selection.members) {
    if ((await dependencies.readiness(member)).status !== "ready") {
      return { status: "blocked", reason: "member-not-ready", recommendedActionText: "Restore readiness and merge lock for every exact selected head before preparing again." };
    }
  }
  const consequence = selection.arm === "linked-atomic"
    ? "Atomically land the displayed complete non-terminal remainder. A residual race remains between final observation and the host prefix snapshot."
    : "Land only the displayed bottom member at its exact head.";
  return { status: "prepared", members: selection.members, consequence };
}

export type ReserveNativeDeliveryLandingResult =
  | { readonly status: "prepared"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1>; readonly operationId: string; readonly members: readonly DeliveryNativeLandingMember[]; readonly consequence: string }
  | { readonly status: "blocked"; readonly reason: string; readonly recommendedActionText: string };

/** Reserve one exact singleton or complete-remainder land effect after set-wide readiness. */
export async function reserveNativeDeliveryLanding(input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly operationId: string;
  readonly selection: Extract<DeliveryNativeLandingSelection, { status: "selected" }>;
  readonly facts: DeliveryPositionFactsV1;
  readonly repository: string;
  readonly baseRef: string;
  readonly targetRef: string;
}, dependencies: {
  readonly readiness: (member: DeliveryNativeLandingMember) => Promise<{ readonly status: "ready" | "refused" }>;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;
}): Promise<ReserveNativeDeliveryLandingResult> {
  if (input.selection.arm === "unlinked") {
    return { status: "blocked", reason: "unlinked-arm", recommendedActionText: "Use the complete ordinary sequential landing service." };
  }
  const position = deriveDeliveryPosition(input.plan, input.current.value, input.facts);
  if (position.status !== "derived" || position.position.firstUnlanded === null) {
    return { status: "blocked", reason: "position-mismatch", recommendedActionText: "Refresh delivery position before reserving a native effect." };
  }
  const landedCount = input.facts.landedDeliverableIds.length;
  const expectedIds = input.selection.arm === "linked-atomic"
    ? input.plan.members.slice(landedCount, -1).map((member) => member.deliverableId)
    : [position.position.firstUnlanded];
  const selectedIds = input.selection.members.map((member) => member.deliverableId);
  if (JSON.stringify(selectedIds) !== JSON.stringify(expectedIds)) {
    return { status: "blocked", reason: "member-set-mismatch", recommendedActionText: "Refresh the exact plan-ordered non-terminal remainder." };
  }
  const prepared = await prepareNativeDeliveryLanding(input.selection, { readiness: dependencies.readiness });
  if (prepared.status === "blocked") return prepared;
  const ids = input.selection.members.map((member) => member.deliverableId);
  const stateMembers = ids.map((id) => input.current.value.members.find((member) => member.deliverableId === id));
  const boundMembers: DeliveryOperationSnapshotV1["members"] = [];
  for (const member of stateMembers) {
    if (member === undefined || member.coordinates === null || member.changeRequest === null) {
      return { status: "blocked", reason: "member-unbound", recommendedActionText: "Materialize and publish every exact selected member before landing." };
    }
    boundMembers.push({
      deliverableId: member.deliverableId,
      ref: member.ref,
      changeRequest: member.changeRequest,
      coordinates: member.coordinates,
    });
  }
  const snapshot: DeliveryOperationSnapshotV1 = { target: input.current.value.target, members: boundMembers };
  const top = input.selection.members.at(-1);
  if (top === undefined) {
    return { status: "blocked", reason: "member-set-mismatch", recommendedActionText: "Refresh the complete exact non-terminal remainder." };
  }
  const reserved = reserveDeliveryOperation(input.current, input.plan, {
    operationId: input.operationId,
    kind: "land",
    mode: "native",
    affectedDeliverableIds: ids,
    expectedStateRevision: input.current.revision,
    before: snapshot,
    requested: snapshot,
    effect: {
      providerId: "github", repository: input.repository,
      changeRequestId: top.changeRequestId, headSha: top.headSha,
      baseRef: input.baseRef, targetRef: input.targetRef, strategy: "merge",
    },
  });
  if (reserved.status === "refused") {
    return { status: "blocked", reason: reserved.reason, recommendedActionText: "Refresh state before reserving the selected native effect." };
  }
  const published = await dependencies.stateStore.publish(input.plan.planId, reserved.state, input.current.revision);
  return published.status === "ok"
    ? { status: "prepared", state: published.value, operationId: input.operationId, members: input.selection.members, consequence: prepared.consequence }
    : { status: "blocked", reason: "state-conflict", recommendedActionText: "Re-read state before preparing again." };
}

export type SubmitReservedNativeDeliveryMergeResult =
  | { readonly status: "pending"; readonly effectIdentity: string; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
  | { readonly status: "applied"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
  | { readonly status: "blocked"; readonly reason: string; readonly recommendedActionText: string };

/** Submit one already-reserved native effect and immediately CAS-attach the host identity. */
export async function submitReservedNativeDeliveryMerge(input: {
  readonly planId: string;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly operationId: string;
  readonly request: DeliveryNativeMergeRequest;
}, dependencies: {
  readonly host: DeliveryNativeMergeHostPort;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;
  readonly reobserveSelection: () => Promise<{ readonly status: "exact" | "refused" }>;
  readonly revalidate: (deliverableId: string, headSha: string) => Promise<{ readonly status: "ready" | "refused" }>;
  readonly releaseLock: (deliverableId: string) => Promise<{ readonly status: "released" | "not-configured" | "refused" }>;
  readonly observeEffect: () => Promise<DeliveryNativeEffectFacts>;
}): Promise<SubmitReservedNativeDeliveryMergeResult> {
  const operation = input.current.value.activeOperation;
  if (operation === null || operation.kind !== "land" || operation.mode !== "native"
    || operation.operationId !== input.operationId
    || operation.effect.repository !== input.request.repository
    || operation.effect.changeRequestId !== input.request.topChangeRequestId
    || operation.effect.headSha !== input.request.topHeadSha || operation.effect.strategy !== "merge") {
    return { status: "blocked", reason: "reservation-mismatch", recommendedActionText: "Refresh the exact reserved member set before submission." };
  }
  if (operation.effectIdentity !== null) {
    return { status: "pending", effectIdentity: operation.effectIdentity.effectId, state: input.current };
  }
  if ((await dependencies.reobserveSelection()).status !== "exact") {
    return { status: "blocked", reason: "native-stack-moved", recommendedActionText: "Reobserve the exact selected stack before returning to prepare." };
  }
  for (const member of operation.before.members) {
    if (member.coordinates === null
      || (await dependencies.revalidate(member.deliverableId, member.coordinates.head)).status !== "ready"
      || (await dependencies.releaseLock(member.deliverableId)).status === "refused") {
      return { status: "blocked", reason: "fresh-set-refused", recommendedActionText: "Re-hold any released locks and return to prepare; the approval cannot be reused." };
    }
  }
  const submitted = await dependencies.host.submitNativeMerge(input.request);
  if (submitted.status === "enqueued") {
    return { status: "blocked", reason: "queue-not-atomic", recommendedActionText: "Unlink and continue sequentially; queued grouping is not the authorized atomic effect." };
  }
  if (submitted.status === "merged") {
    const facts = await dependencies.observeEffect();
    if (facts.outcome !== "all-landed") {
      return {
        status: "blocked",
        reason: facts.outcome === "none-landed" ? "submission-before-persist-unresolved" : facts.outcome,
        recommendedActionText: "Keep the reservation and resolve the completed-or-nonapplied effect from fresh facts; do not submit again.",
      };
    }
    const reconciled = reconcileDeliveryOperation(input.current, {
      outcome: "applied",
      observation: { kind: "land", effect: operation.effect, outcome: "applied", snapshot: facts.snapshot },
    });
    if (reconciled.status !== "adopt") {
      return { status: "blocked", reason: "ambiguous-result", recommendedActionText: "Keep the reservation and reconcile the immediate host result explicitly." };
    }
    const published = await dependencies.stateStore.publish(input.planId, reconciled.state, input.current.revision);
    return published.status === "ok"
      ? { status: "applied", state: published.value }
      : { status: "blocked", reason: "state-conflict", recommendedActionText: "Re-read state before adopting the immediate host result." };
  }
  if (submitted.status === "refused") {
    return { status: "blocked", reason: submitted.reason, recommendedActionText: "Keep the reservation and reobserve before any retry." };
  }
  const attached = attachDeliveryOperationEffectIdentity(input.current, input.operationId, {
    providerId: "github", effectId: submitted.effectIdentity,
  });
  if (attached.status === "refused") {
    return { status: "blocked", reason: attached.reason, recommendedActionText: "Reconcile the active operation before submitting again." };
  }
  const published = await dependencies.stateStore.publish(input.planId, attached.state, input.current.revision);
  return published.status === "ok"
    ? { status: "pending", effectIdentity: submitted.effectIdentity, state: published.value }
    : { status: "blocked", reason: "state-conflict", recommendedActionText: "Re-read state and adopt the existing host request by its returned identity." };
}

export type DeliveryNativeEffectFacts =
  | { readonly outcome: "all-landed"; readonly snapshot: DeliveryOperationSnapshotV1 }
  | { readonly outcome: "none-landed" }
  | { readonly outcome: "partial-landed"; readonly affectedDeliverableIds: readonly string[] }
  | { readonly outcome: "ambiguous" };

export type ReconcileReservedNativeDeliveryMergeResult =
  | { readonly status: "pending"; readonly recommendedActionText: string }
  | { readonly status: "applied"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
  | { readonly status: "retryable"; readonly recommendedActionText: string }
  | { readonly status: "blocked"; readonly reason: string; readonly recommendedActionText: string };

/** Poll one persisted identity and reconcile only a complete exact authoritative result. */
export async function reconcileReservedNativeDeliveryMerge(input: {
  readonly planId: string;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly request: DeliveryNativeMergeRequest;
}, dependencies: {
  readonly host: DeliveryNativeMergeHostPort;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;
  readonly observeEffect: () => Promise<DeliveryNativeEffectFacts>;
}): Promise<ReconcileReservedNativeDeliveryMergeResult> {
  const operation = input.current.value.activeOperation;
  if (operation === null || operation.kind !== "land" || operation.mode !== "native"
    || operation.effectIdentity === null) {
    return { status: "blocked", reason: "effect-identity-missing", recommendedActionText: "Resolve submission-before-persist from fresh host facts; do not submit again." };
  }
  if (operation.effect.repository !== input.request.repository
    || operation.effect.changeRequestId !== input.request.topChangeRequestId
    || operation.effect.headSha !== input.request.topHeadSha
    || operation.effect.strategy !== input.request.mergeMethod) {
    return { status: "blocked", reason: "reservation-mismatch", recommendedActionText: "Poll only the exact effect bound to the active reservation." };
  }
  const polled = await dependencies.host.observeNativeMerge({
    ...input.request, effectIdentity: operation.effectIdentity.effectId,
  });
  if (polled.status === "pending") {
    return { status: "pending", recommendedActionText: "Keep the reservation and poll the persisted asynchronous effect identity." };
  }
  if (polled.status !== "merged") {
    return { status: "blocked", reason: polled.status === "refused" ? polled.reason : polled.status, recommendedActionText: "Keep the reservation and resolve the native effect before further landing." };
  }
  const facts = await dependencies.observeEffect();
  if (facts.outcome === "none-landed") {
    return { status: "retryable", recommendedActionText: "Return to prepare and obtain a new interlock before retrying the authoritatively non-applied effect." };
  }
  if (facts.outcome !== "all-landed") {
    return { status: "blocked", reason: facts.outcome, recommendedActionText: "Keep the reservation; partial or ambiguous native effects require explicit recovery." };
  }
  const reconciled = reconcileDeliveryOperation(input.current, {
    outcome: "applied",
    observation: { kind: "land", effect: operation.effect, outcome: "applied", snapshot: facts.snapshot },
  });
  if (reconciled.status !== "adopt") {
    return {
      status: "blocked",
      reason: reconciled.status === "blocked" ? reconciled.reason : "unexpected-retry",
      recommendedActionText: "The observed result does not equal the exact authorized member set.",
    };
  }
  const published = await dependencies.stateStore.publish(input.planId, reconciled.state, input.current.revision);
  return published.status === "ok"
    ? { status: "applied", state: published.value }
    : { status: "blocked", reason: "state-conflict", recommendedActionText: "Re-read state; never overwrite a competing reconciliation." };
}

export type ReconcileLinkedNativeDeliverySuffixResult =
  | { readonly status: "applied"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
  | { readonly status: "blocked"; readonly reason: string; readonly recommendedActionText: string };

/** Reconcile the single next-member retarget through the existing contribution-proven rewrite path. */
export async function reconcileLinkedNativeDeliverySuffix(input: {
  readonly plan: DeliveryPlanV1;
  readonly before: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly landed: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly repository: string;
  readonly protectedTargetRef: string;
}, dependencies: {
  readonly observeRequest: (binding: NonNullable<DeliveryStateV1["members"][number]["changeRequest"]>) => Promise<DeliveryHostRequestObservation>;
  readonly observeRef: (ref: string) => Promise<{ readonly head: string; readonly tree: string } | null>;
  readonly proveContribution: (endpoints: DeliveryContributionEndpoints) => Promise<DeliveryContributionProofResult>;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;
}): Promise<ReconcileLinkedNativeDeliverySuffixResult> {
  const operation = input.before.value.activeOperation;
  const landedId = operation?.kind === "land" && operation.mode === "native"
    && operation.affectedDeliverableIds.length === 1
    ? operation.affectedDeliverableIds[0]
    : undefined;
  const landedIndex = landedId === undefined
    ? -1
    : input.plan.members.findIndex((member) => member.deliverableId === landedId);
  if (landedIndex < 0 || landedIndex >= input.plan.members.length - 2) {
    return { status: "applied", state: input.landed };
  }
  const next = input.landed.value.members[landedIndex + 1];
  const oldNext = input.before.value.members[landedIndex + 1];
  const oldPredecessor = operation?.kind === "land" && operation.mode === "native"
    ? operation.before.members[0]?.coordinates
    : null;
  const target = input.landed.value.target;
  if (next?.ref === null || next?.ref === undefined || next.changeRequest === null || oldNext?.coordinates === null
    || oldNext?.coordinates === undefined || oldPredecessor === null || oldPredecessor === undefined
    || target === null || target.coordinates === null) {
    return { status: "blocked", reason: "suffix-position-unavailable", recommendedActionText: "Keep the landed state and reconcile the first remaining member explicitly." };
  }
  const [observedRequest, observedRef] = await Promise.all([
    dependencies.observeRequest(next.changeRequest),
    dependencies.observeRef(next.ref),
  ]);
  if (observedRequest.status !== "observed" || observedRef === null
    || observedRequest.request.state !== "open"
    || observedRequest.request.repository !== input.repository
    || observedRequest.request.headRepository !== input.repository
    || observedRequest.request.headRef !== next.ref.replace(/^refs\/heads\//u, "")
    || observedRequest.request.headSha !== observedRef.head
    || observedRequest.request.baseRef !== input.protectedTargetRef.replace(/^refs\/heads\//u, "")) {
    return { status: "blocked", reason: "suffix-request-mismatch", recommendedActionText: "Keep the landed state and reobserve the first remaining request before review." };
  }
  const moved = {
    deliverableId: next.deliverableId,
    ref: next.ref,
    changeRequest: next.changeRequest,
    coordinates: { base: target.coordinates.head, head: observedRef.head, tree: observedRef.tree },
  };
  const facts: DeliveryPositionFactsV1 = {
    target,
    members: input.landed.value.members.map((member, index) => index === landedIndex + 1 ? moved : ({
      deliverableId: member.deliverableId,
      ref: member.ref,
      changeRequest: member.changeRequest,
      coordinates: member.coordinates,
    })),
    landedDeliverableIds: input.plan.members.slice(0, landedIndex + 1).map((member) => member.deliverableId),
  };
  const contribution: DeliveryContributionEndpoints = {
    before: {
      predecessor: { head: oldPredecessor.head, tree: oldPredecessor.tree },
      member: { head: oldNext.coordinates.head, tree: oldNext.coordinates.tree },
    },
    after: {
      predecessor: { head: target.coordinates.head, tree: target.coordinates.tree },
      member: { head: observedRef.head, tree: observedRef.tree },
    },
  };
  const reserved = await reserveObservedSuffixRetarget({
    plan: input.plan,
    current: input.landed,
    facts,
    repository: input.repository,
    protectedTargetRef: input.protectedTargetRef,
    host: { readRequest: (_repository, binding) => dependencies.observeRequest(binding) },
    proveContribution: () => dependencies.proveContribution(contribution),
    stateStore: dependencies.stateStore,
  });
  if (reserved.status !== "reserved") {
    return { status: "blocked", reason: reserved.reason, recommendedActionText: "Keep the landed state and resolve the recognized suffix retarget before review." };
  }
  const settled = await reconcileReservedSuffixRetarget({
    planId: input.plan.planId,
    current: reserved.state,
    observed: reserved.state.value.activeOperation?.requested,
    proveContribution: () => dependencies.proveContribution(contribution),
    stateStore: dependencies.stateStore,
  });
  return settled.status === "applied"
    ? { status: "applied", state: settled.state }
    : { status: "blocked", reason: settled.status === "blocked" ? settled.reason : "suffix-retry", recommendedActionText: "Settle the recognized suffix retarget before new-head review." };
}
