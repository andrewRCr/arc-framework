/** Native-stack arm selection and exact-set attended landing preparation. */

import {
  attachDeliveryOperationEffectIdentity,
  beginNativeDeliverySettlement,
  beginNativeDeliverySubmission,
  reconcileDeliveryOperation,
  reserveDeliveryOperation,
} from "./operation.js";
import type { DeliveryRevisionedRecord, DeliveryStateStore } from "./ports.js";
import type {
  DeliveryLandEffectV1,
  DeliveryMemberCoordinatesV1,
  DeliveryMergePolicyBindingV1,
  DeliveryNativeObservedSuffixMemberV1,
  DeliveryOperationSnapshotV1,
  DeliveryPlanV1,
  DeliveryStateV1,
} from "./schema.js";
import {
  deriveDeliveryNativeTarget,
  type DeliveryNativeStackMember,
  type DeliveryNativeStackObservation,
} from "./native-stack.js";
import { deriveDeliveryPosition, type DeliveryPositionFactsV1 } from "./position.js";
import type { DeliveryHostRequestObservation } from "./host.js";
import type {
  DeliveryContributionCoordinate,
  DeliveryContributionEndpoints,
  DeliveryContributionProofResult,
  DeliveryContributionRefusal,
} from "./contribution-proof.js";
import {
  collectDeliveryProviderRefreshConflicts,
  type DeliveryProviderConflictResolutionInput,
  type DeliveryProviderExternalRefRestoration,
  type DeliveryProviderRefreshConflict,
  type DeliveryTerminalConflictPreparation,
} from "./suffix-reconciliation.js";
import { canonicalDigest, canonicalize } from "../kernel/index.js";
import type { DeliveryChainAbsorptionResult } from "./chain-absorption.js";
import type { DeliveryMemberRefCheckoutObservation } from "./git-materialization.js";

export interface DeliveryNativeLandingMember {
  readonly deliverableId: string;
  readonly changeRequestId: string;
  readonly headSha: string;
}

export type DeriveNativeDeliveryMemberChainResult =
  | { readonly status: "derived"; readonly members: readonly DeliveryNativeStackMember[] }
  | {
      readonly status: "refused";
      readonly reason: "member-unbound" | "member-mismatch" | "protected-target-mismatch";
    };

/** Derive the exact host chain from ordered selection plus current bound state. */
export function deriveNativeDeliveryMemberChain(input: {
  readonly state: DeliveryStateV1;
  readonly selectedMembers: readonly DeliveryNativeLandingMember[];
  readonly repository: string;
  readonly baseRef: string;
}): DeriveNativeDeliveryMemberChainResult {
  const target = deriveDeliveryNativeTarget(input.state);
  if (target.status !== "resolved" || input.baseRef.replace(/^refs\/heads\//u, "") !== target.baseRef) {
    return { status: "refused", reason: "protected-target-mismatch" };
  }
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
      baseRef: members.at(-1)?.headRef ?? target.baseRef,
      headRepository: input.repository,
    });
  }
  return { status: "derived", members };
}

/**
 * Rebuild the provider observation subject beginning at one reserved landing member.
 *
 * @param input - Current plan/state bindings, the first reserved member, and host repository coordinates
 * @returns The registered remainder in provider chain form or a closed binding refusal
 */
export function deriveNativeDeliveryRegisteredRemainder(input: {
  readonly plan: DeliveryPlanV1;
  readonly state: DeliveryStateV1;
  readonly firstDeliverableId: string;
  readonly repository: string;
  readonly baseRef: string;
}): DeriveNativeDeliveryMemberChainResult {
  const start = input.plan.members.findIndex(
    (candidate) => candidate.deliverableId === input.firstDeliverableId,
  );
  if (start < 0 || start >= input.plan.members.length - 1) {
    return { status: "refused", reason: "member-mismatch" };
  }
  const selectedMembers: DeliveryNativeLandingMember[] = [];
  for (const planned of input.plan.members.slice(start, -1)) {
    const member = input.state.members.find(
      (candidate) => candidate.deliverableId === planned.deliverableId,
    );
    if (member?.changeRequest === null || member?.changeRequest === undefined || member.coordinates === null) {
      return { status: "refused", reason: "member-unbound" };
    }
    selectedMembers.push({
      deliverableId: member.deliverableId,
      changeRequestId: member.changeRequest.changeRequestId,
      headSha: member.coordinates.head,
    });
  }
  return deriveNativeDeliveryMemberChain({
    state: input.state,
    selectedMembers,
    repository: input.repository,
    baseRef: input.baseRef,
  });
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
  | {
      readonly status: "refused";
      readonly reason: "malformed" | "unavailable" | "unsupported" | "native-stack-required";
    };

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
  | {
      readonly status: "blocked";
      readonly reason: "member-not-ready";
      readonly unreadyMembers: readonly DeliveryNativeLandingMember[];
      readonly recommendedActionText: string;
    };

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
  const readiness = await Promise.all(selection.members.map(async (member) => ({
    member,
    result: await dependencies.readiness(member),
  })));
  const unreadyMembers = readiness
    .filter(({ result }) => result.status !== "ready")
    .map(({ member }) => member);
  if (unreadyMembers.length > 0) {
    return {
      status: "blocked",
      reason: "member-not-ready",
      unreadyMembers,
      recommendedActionText: "Restore readiness and merge lock for every listed exact head before preparing again.",
    };
  }
  const consequence = nativeLandingConsequence(selection.arm);
  return { status: "prepared", members: selection.members, consequence };
}

function nativeLandingConsequence(arm: "unlinked" | "linked-single" | "linked-atomic"): string {
  return arm === "linked-atomic"
    ? "Atomically land the displayed complete non-terminal remainder. A residual race remains between final observation and the host prefix snapshot."
    : "Land only the displayed bottom member at its exact head.";
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
  readonly mergePolicy: DeliveryMergePolicyBindingV1;
}, dependencies: {
  readonly readiness: (member: DeliveryNativeLandingMember) => Promise<{ readonly status: "ready" | "refused" }>;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;
}): Promise<ReserveNativeDeliveryLandingResult> {
  if (input.selection.arm === "unlinked") {
    return { status: "blocked", reason: "unlinked-arm", recommendedActionText: "Use the complete ordinary sequential landing service." };
  }
  const target = deriveDeliveryNativeTarget(input.current.value);
  if (target.status !== "resolved" || input.targetRef !== target.targetRef
    || input.baseRef !== target.baseRef) {
    return {
      status: "blocked",
      reason: "protected-target-mismatch",
      recommendedActionText: "Use the exact protected target bound in current delivery state.",
    };
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
    nativeArm: input.selection.arm,
    affectedDeliverableIds: ids,
    expectedStateRevision: input.current.revision,
    before: snapshot,
    requested: snapshot,
    effect: {
      providerId: "github", repository: input.repository,
      changeRequestId: top.changeRequestId, headSha: top.headSha,
      baseRef: input.baseRef, targetRef: input.targetRef, strategy: "merge",
      mergePolicy: input.mergePolicy,
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
  | {
      readonly status: "applied";
      readonly before: DeliveryRevisionedRecord<DeliveryStateV1>;
      readonly projected: DeliveryStateV1;
    }
  | { readonly status: "blocked"; readonly reason: string; readonly recommendedActionText: string };

/** Submit one reserved native effect, persisting only an async identity until final landing settlement. */
export async function submitReservedNativeDeliveryMerge(input: {
  readonly planId: string;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly operationId: string;
  readonly request: DeliveryNativeMergeRequest;
}, dependencies: {
  readonly host: DeliveryNativeMergeHostPort;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;
  readonly reobserveSelection: () => Promise<{ readonly status: "exact" | "refused" }>;
  readonly revalidateSet: (
    members: DeliveryOperationSnapshotV1["members"],
  ) => Promise<{ readonly status: "ready" | "refused" }>;
  readonly releaseLock: (deliverableId: string) => Promise<{ readonly status: "released" | "not-configured" | "refused" }>;
  readonly revalidateMergePolicy: (
    binding: DeliveryMergePolicyBindingV1,
  ) => Promise<{ readonly status: "exact" | "refused" }>;
  readonly observeEffect: () => Promise<DeliveryNativeEffectFacts>;
}): Promise<SubmitReservedNativeDeliveryMergeResult> {
  const operation = input.current.value.activeOperation;
  if (operation === null || operation.kind !== "land" || operation.mode !== "native"
    || operation.operationId !== input.operationId
    || operation.effect.repository !== input.request.repository
    || operation.effect.changeRequestId !== input.request.topChangeRequestId
    || operation.effect.headSha !== input.request.topHeadSha) {
    return { status: "blocked", reason: "reservation-mismatch", recommendedActionText: "Refresh the exact reserved member set before submission." };
  }
  const target = deriveDeliveryNativeTarget(input.current.value);
  if (target.status !== "resolved" || operation.effect.targetRef !== target.targetRef
    || operation.effect.baseRef !== target.baseRef) {
    return { status: "blocked", reason: "protected-target-mismatch", recommendedActionText: "Restore the exact protected target binding before submission." };
  }
  if (operation.effectIdentity !== null) {
    return { status: "pending", effectIdentity: operation.effectIdentity.effectId, state: input.current };
  }
  if (operation.native?.phase !== "prepared") {
    return operation.native?.phase === "settling"
      ? {
          status: "blocked",
          reason: "settlement-in-flight",
          recommendedActionText:
            "Keep the reservation and rerun `arc delivery native land-status` to finish settling the landing "
            + "this reservation already submitted.",
        }
      : {
          status: "blocked",
          reason: "submission-before-persist-unresolved",
          recommendedActionText:
            "Keep the reservation and resolve the submitted native effect from fresh facts; do not submit again.",
        };
  }
  if ((await dependencies.reobserveSelection()).status !== "exact") {
    return { status: "blocked", reason: "native-stack-moved", recommendedActionText: "Reobserve the exact selected stack before returning to prepare." };
  }
  if (operation.before.members.some((member) => member.coordinates === null)
    || (await dependencies.revalidateSet(operation.before.members)).status !== "ready") {
    return {
      status: "blocked",
      reason: "fresh-set-refused",
      recommendedActionText: "Return to prepare; the approval cannot be reused for a member whose readiness moved.",
    };
  }
  if ((await dependencies.revalidateMergePolicy(operation.effect.mergePolicy)).status !== "exact") {
    return {
      status: "blocked",
      reason: "merge-policy-moved",
      recommendedActionText: "Return to prepare under current repository merge policy.",
    };
  }
  for (const member of operation.before.members) {
    if ((await dependencies.releaseLock(member.deliverableId)).status === "refused") {
      return { status: "blocked", reason: "fresh-set-refused", recommendedActionText: "Re-hold any released locks and return to prepare; the approval cannot be reused." };
    }
  }
  const submitting = beginNativeDeliverySubmission(input.current, input.operationId);
  if (submitting.status === "refused") {
    return {
      status: "blocked",
      reason: submitting.reason,
      recommendedActionText: "Re-read the exact native reservation before provider submission.",
    };
  }
  const phasePublished = await dependencies.stateStore.publish(
    input.planId,
    submitting.state,
    input.current.revision,
  );
  if (phasePublished.status !== "ok") {
    return {
      status: "blocked",
      reason: "state-conflict",
      recommendedActionText: "Re-read state; no provider submission was attempted.",
    };
  }
  const submittingCurrent = phasePublished.value;
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
    const reconciled = reconcileDeliveryOperation(submittingCurrent, {
      outcome: "applied",
      observation: { kind: "land", effect: operation.effect, outcome: "applied", snapshot: facts.snapshot },
    });
    if (reconciled.status !== "adopt") {
      return { status: "blocked", reason: "ambiguous-result", recommendedActionText: "Keep the reservation and reconcile the immediate host result explicitly." };
    }
    return { status: "applied", before: submittingCurrent, projected: reconciled.state };
  }
  if (submitted.status === "refused") {
    return { status: "blocked", reason: submitted.reason, recommendedActionText: "Keep the reservation and reobserve before any retry." };
  }
  const attached = attachDeliveryOperationEffectIdentity(submittingCurrent, input.operationId, {
    providerId: "github", effectId: submitted.effectIdentity,
  });
  if (attached.status === "refused") {
    return { status: "blocked", reason: attached.reason, recommendedActionText: "Reconcile the active operation before submitting again." };
  }
  const published = await dependencies.stateStore.publish(input.planId, attached.state, submittingCurrent.revision);
  return published.status === "ok"
    ? { status: "pending", effectIdentity: submitted.effectIdentity, state: published.value }
    : { status: "blocked", reason: "state-conflict", recommendedActionText: "Re-read state and adopt the existing host request by its returned identity." };
}

export type DeliveryNativeEffectFacts =
  | { readonly outcome: "all-landed"; readonly snapshot: DeliveryOperationSnapshotV1 }
  | { readonly outcome: "none-landed" }
  | { readonly outcome: "partial-landed"; readonly affectedDeliverableIds: readonly string[] }
  | { readonly outcome: "ambiguous" };

export type DeliveryNativeEffectClassification =
  | { readonly status: "applied"; readonly snapshot: DeliveryOperationSnapshotV1 }
  | { readonly status: "not-applied" }
  | { readonly status: "partial-landed"; readonly affectedDeliverableIds: readonly string[] }
  | { readonly status: "ambiguous" };

/**
 * Classify terminal provider state together with exact selected-member facts.
 *
 * @param observation - Persisted provider effect observation.
 * @param facts - Exact selected-member landing facts.
 * @returns The only safe adoption, retry, partial, or ambiguous classification.
 */
export function classifyDeliveryNativeEffect(
  observation: DeliveryNativeMergeObservation,
  facts: DeliveryNativeEffectFacts,
): DeliveryNativeEffectClassification {
  if (facts.outcome === "partial-landed") {
    return { status: "partial-landed", affectedDeliverableIds: facts.affectedDeliverableIds };
  }
  if (observation.status === "failed" && facts.outcome === "none-landed") {
    return { status: "not-applied" };
  }
  if (observation.status === "merged" && facts.outcome === "all-landed") {
    return { status: "applied", snapshot: facts.snapshot };
  }
  return { status: "ambiguous" };
}

export type ReconcileReservedNativeDeliveryMergeResult =
  | {
      readonly status: "prepared";
      readonly transition: "preserved";
      readonly action: "delivery-native-land-submit";
      readonly presentation: {
        readonly operationId: string;
        readonly members: readonly DeliveryNativeLandingMember[];
        readonly consequence: string;
      };
      readonly submitAction: {
        readonly command: "arc delivery native land-submit - --json";
        readonly input: {
          readonly planId: string;
          readonly operationId: string;
          readonly request: DeliveryNativeMergeRequest;
          readonly treeRoot: string;
          readonly remote: string;
        };
      };
      readonly recommendedActionText: string;
    }
  | { readonly status: "pending"; readonly recommendedActionText: string }
  | {
      readonly status: "applied";
      readonly before: DeliveryRevisionedRecord<DeliveryStateV1>;
      readonly projected: DeliveryStateV1;
    }
  | {
      readonly status: "retryable";
      readonly transition: "cleared";
      readonly action: "delivery-native-land-select";
      readonly selector: {
        readonly planId: string;
        readonly operationKind: "land";
        readonly operationId: string;
        readonly affectedDeliverableIds: readonly string[];
        readonly mode: "native";
      };
      readonly recommendedActionText: string;
    }
  | { readonly status: "blocked"; readonly reason: string; readonly recommendedActionText: string };

/** Reobserve one reserved native effect and project only a complete exact authoritative result. */
export async function reconcileReservedNativeDeliveryMerge(input: {
  readonly planId: string;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly request: DeliveryNativeMergeRequest;
  readonly treeRoot: string;
  readonly remote: string;
}, dependencies: {
  readonly host: DeliveryNativeMergeHostPort;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;
  readonly observeEffect: () => Promise<DeliveryNativeEffectFacts>;
}): Promise<ReconcileReservedNativeDeliveryMergeResult> {
  const operation = input.current.value.activeOperation;
  if (operation === null || operation.kind !== "land" || operation.mode !== "native") {
    return { status: "blocked", reason: "effect-identity-missing", recommendedActionText: "Resolve submission-before-persist from fresh host facts; do not submit again." };
  }
  if (operation.effect.repository !== input.request.repository
    || operation.effect.changeRequestId !== input.request.topChangeRequestId
    || operation.effect.headSha !== input.request.topHeadSha) {
    return { status: "blocked", reason: "reservation-mismatch", recommendedActionText: "Poll only the exact effect bound to the active reservation." };
  }
  const target = deriveDeliveryNativeTarget(input.current.value);
  if (target.status !== "resolved" || operation.effect.targetRef !== target.targetRef
    || operation.effect.baseRef !== target.baseRef) {
    return { status: "blocked", reason: "protected-target-mismatch", recommendedActionText: "Restore the exact protected target binding before reconciliation." };
  }
  if (operation.native?.phase === "prepared") {
    const members = operation.before.members.flatMap((member, index) => {
      const affectedId = operation.affectedDeliverableIds[index];
      return affectedId === member.deliverableId
        && member.changeRequest !== null
        && member.coordinates !== null
        ? [{
            deliverableId: member.deliverableId,
            changeRequestId: member.changeRequest.changeRequestId,
            headSha: member.coordinates.head,
          }]
        : [];
    });
    if (members.length !== operation.affectedDeliverableIds.length
      || members.length !== operation.before.members.length) {
      return {
        status: "blocked",
        reason: "reservation-mismatch",
        recommendedActionText: "Restore the exact prepared member bindings before submission.",
      };
    }
    return {
      status: "prepared",
      transition: "preserved",
      action: "delivery-native-land-submit",
      presentation: {
        operationId: operation.operationId,
        members,
        consequence: nativeLandingConsequence(operation.native.arm),
      },
      submitAction: {
        command: "arc delivery native land-submit - --json",
        input: {
          planId: input.planId,
          operationId: operation.operationId,
          request: input.request,
          treeRoot: input.treeRoot,
          remote: input.remote,
        },
      },
      recommendedActionText:
        "Present the preserved native landing consequence and exact member heads, then obtain integration approval "
        + "before invoking the submit action unchanged.",
    };
  }
  let classification: DeliveryNativeEffectClassification;
  if (operation.effectIdentity === null) {
    const facts = await dependencies.observeEffect();
    if (facts.outcome === "all-landed") {
      classification = { status: "applied", snapshot: facts.snapshot };
    } else if (facts.outcome === "partial-landed") {
      classification = {
        status: "partial-landed",
        affectedDeliverableIds: facts.affectedDeliverableIds,
      };
    } else {
      return {
        status: "blocked",
        reason: facts.outcome === "none-landed" ? "submission-before-persist-unresolved" : "ambiguous-result",
        recommendedActionText:
          "Keep the reservation and resolve the synchronous native effect from fresh facts; do not submit again.",
      };
    }
  } else {
    const polled = await dependencies.host.observeNativeMerge({
      ...input.request, effectIdentity: operation.effectIdentity.effectId,
    });
    if (polled.status === "pending") {
      return { status: "pending", recommendedActionText: "Keep the reservation and poll the persisted asynchronous effect identity." };
    }
    if (polled.status !== "merged" && polled.status !== "failed") {
      return { status: "blocked", reason: polled.status === "refused" ? polled.reason : polled.status, recommendedActionText: "Keep the reservation and resolve the native effect before further landing." };
    }
    classification = classifyDeliveryNativeEffect(polled, await dependencies.observeEffect());
  }
  if (classification.status === "not-applied") {
    const reconciled = reconcileDeliveryOperation(input.current, { outcome: "not-applied" });
    if (reconciled.status !== "retry") {
      return { status: "blocked", reason: "ambiguous-result", recommendedActionText: "Keep the reservation; the terminal native result could not be cleared safely." };
    }
    const published = await dependencies.stateStore.publish(input.planId, {
      ...input.current.value,
      activeOperation: null,
    }, input.current.revision);
    return published.status === "ok"
      ? {
          status: "retryable",
          transition: "cleared",
          action: "delivery-native-land-select",
          selector: {
            planId: input.planId,
            operationKind: "land",
            operationId: operation.operationId,
            affectedDeliverableIds: operation.affectedDeliverableIds,
            mode: "native",
          },
          recommendedActionText:
            "Rerun `arc delivery native land-select` for the exact native landing reservation subject.",
        }
      : { status: "blocked", reason: "state-conflict", recommendedActionText: "Re-read state; never overwrite a competing native-effect reconciliation." };
  }
  if (classification.status === "partial-landed") {
    return { status: "blocked", reason: "partial-landed", recommendedActionText: "Keep the reservation; partial native effects require explicit recovery." };
  }
  if (classification.status === "ambiguous") {
    return { status: "blocked", reason: "ambiguous-result", recommendedActionText: "Keep the reservation; contradictory or ambiguous native effects require explicit recovery." };
  }
  const reconciled = reconcileDeliveryOperation(input.current, {
    outcome: "applied",
    observation: {
      kind: "land",
      effect: operation.effect,
      outcome: "applied",
      snapshot: classification.snapshot,
    },
  });
  if (reconciled.status !== "adopt") {
    return {
      status: "blocked",
      reason: reconciled.status === "blocked" ? reconciled.reason : "unexpected-retry",
      recommendedActionText: "The observed result does not equal the exact authorized member set.",
    };
  }
  return { status: "applied", before: input.current, projected: reconciled.state };
}

export type AdmitNativeDeliveryLandingReleaseResult =
  | {
      readonly status: "admitted";
      readonly operationId: string;
      readonly effect: DeliveryLandEffectV1;
      readonly before: DeliveryOperationSnapshotV1;
      readonly affectedDeliverableIds: readonly string[];
    }
  | {
      readonly status: "retryable";
      readonly transition: "preserved";
      readonly action: "delivery-native-land-status";
      readonly selector: {
        readonly planId: string;
        readonly operationKind: "land";
        readonly operationId: string;
        readonly affectedDeliverableIds: readonly string[];
        readonly mode: "native";
      };
      readonly recommendedActionText: string;
    }
  | { readonly status: "blocked"; readonly reason: string; readonly recommendedActionText: string };

/**
 * Admit only a settled native landing reservation to release, refusing every unsettled one.
 *
 * @param input - The exact plan, reservation, and repository the decline names.
 * @param dependencies - The persisted-identity effect poll and the exact selected-member fact observer.
 * @returns The resolved reservation, the verb that owns an unapplied effect, or a closed refusal.
 */
export async function admitNativeDeliveryLandingRelease(input: {
  readonly planId: string;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly operationId: string;
  readonly repository: string;
}, dependencies: {
  readonly host: Pick<DeliveryNativeMergeHostPort, "observeNativeMerge">;
  readonly observeEffect: () => Promise<DeliveryNativeEffectFacts>;
}): Promise<AdmitNativeDeliveryLandingReleaseResult> {
  const operation = input.current.value.activeOperation;
  if (operation === null || operation.kind !== "land" || operation.mode !== "native") {
    return {
      status: "blocked",
      reason: "native-landing-reservation-missing",
      recommendedActionText:
        "Read the current delivery state and decline only a held native landing reservation by its own operation id.",
    };
  }
  if (operation.operationId !== input.operationId || operation.effect.repository !== input.repository) {
    return {
      status: "blocked",
      reason: "reservation-mismatch",
      recommendedActionText: "Decline only the exact reservation the current native landing operation holds.",
    };
  }
  const target = deriveDeliveryNativeTarget(input.current.value);
  if (target.status !== "resolved" || operation.effect.targetRef !== target.targetRef
    || operation.effect.baseRef !== target.baseRef) {
    return {
      status: "blocked",
      reason: "protected-target-mismatch",
      recommendedActionText: "Restore the exact protected target binding before declining the native landing.",
    };
  }
  if (operation.native?.phase === "prepared") {
    return {
      status: "blocked",
      reason: "reservation-not-submitted",
      recommendedActionText:
        "A prepared native landing has submitted no effect to decline; abandon it with `arc delivery reconcile`, "
        + "which preserves the reservation and re-presents the landing for a deliberate choice.",
    };
  }
  const releaseAdmitted = {
    status: "admitted",
    operationId: operation.operationId,
    effect: operation.effect,
    before: operation.before,
    affectedDeliverableIds: operation.affectedDeliverableIds,
  } as const;
  const unsettled = (
    outcome: "partial-landed" | "ambiguous",
  ): AdmitNativeDeliveryLandingReleaseResult => outcome === "partial-landed"
    ? {
        status: "blocked",
        reason: "partial-landed",
        recommendedActionText:
          "Keep the reservation; a partly landed native effect is recovered explicitly before it can be declined.",
      }
    : {
        status: "blocked",
        reason: "ambiguous-result",
        recommendedActionText:
          "Keep the reservation and resolve the contradictory native effect from fresh host facts before declining it.",
      };
  if (operation.effectIdentity === null) {
    const facts = await dependencies.observeEffect();
    if (facts.outcome === "all-landed") return releaseAdmitted;
    return facts.outcome === "none-landed"
      ? {
          status: "blocked",
          reason: "submission-before-persist-unresolved",
          recommendedActionText:
            "Keep the reservation and resolve the synchronous native effect from fresh host facts; "
            + "a submission that outran its persistence is not a landing this verb can decline.",
        }
      : unsettled(facts.outcome === "partial-landed" ? "partial-landed" : "ambiguous");
  }
  const polled = await dependencies.host.observeNativeMerge({
    repository: input.repository,
    topChangeRequestId: operation.effect.changeRequestId,
    topHeadSha: operation.effect.headSha,
    mergeAction: "direct_merge",
    mergeMethod: "merge",
    effectIdentity: operation.effectIdentity.effectId,
  });
  if (polled.status === "pending") {
    return {
      status: "blocked",
      reason: "effect-pending",
      recommendedActionText:
        "Keep the reservation and poll the persisted native effect to a result before declining the landing.",
    };
  }
  if (polled.status === "enqueued") {
    return {
      status: "blocked",
      reason: "effect-enqueued",
      recommendedActionText:
        "Keep the reservation until the queued native effect reaches a result; a queued merge may still land.",
    };
  }
  if (polled.status === "refused") {
    return {
      status: "blocked",
      reason: polled.reason,
      recommendedActionText:
        "Keep the reservation and restore a readable native effect identity before declining the landing.",
    };
  }
  const classification = classifyDeliveryNativeEffect(polled, await dependencies.observeEffect());
  if (classification.status === "applied") return releaseAdmitted;
  if (classification.status === "not-applied") {
    return {
      status: "retryable",
      transition: "preserved",
      action: "delivery-native-land-status",
      selector: {
        planId: input.planId,
        operationKind: "land",
        operationId: operation.operationId,
        affectedDeliverableIds: operation.affectedDeliverableIds,
        mode: "native",
      },
      recommendedActionText:
        "Nothing landed, so there is nothing to decline: rerun `arc delivery native land-status`, which clears the "
        + "reservation for the exact native landing subject.",
    };
  }
  return unsettled(classification.status);
}


/** One native suffix member movement paired with the predecessors its caller already resolved. */
export interface DeliveryNativeSuffixMovement {
  readonly deliverableId: string;
  readonly before: DeliveryMemberCoordinatesV1;
  readonly after: DeliveryMemberCoordinatesV1;
  readonly beforePredecessor: DeliveryContributionCoordinate;
  readonly afterPredecessor: DeliveryContributionCoordinate;
}

/**
 * Collect every conflicted native suffix member through the shared provider conflict collector.
 *
 * @param movements - Moved native members carrying the before and after predecessors already resolved from state
 * @param proveContribution - Native contribution arbiter accepting one exact before/after endpoint pair
 * @returns The complete conflict set, or the first refusal that is not a contribution conflict
 */
export async function collectNativeDeliverySuffixConflicts(
  movements: readonly DeliveryNativeSuffixMovement[],
  proveContribution: (
    endpoints: DeliveryContributionEndpoints,
  ) => Promise<DeliveryContributionProofResult>,
): Promise<
  | { readonly status: "assessed"; readonly conflicts: readonly DeliveryProviderRefreshConflict[] }
  | DeliveryContributionRefusal
> {
  const resolved = new Map(movements.map((movement) => [movement.deliverableId, movement]));
  return collectDeliveryProviderRefreshConflicts(
    movements.map(({ deliverableId, before, after }) => ({
      deliverableId,
      before: { deliverableId, ref: null, changeRequest: null, coordinates: before },
      after: { deliverableId, ref: null, changeRequest: null, coordinates: after },
    })),
    async ({ deliverableId }) => {
      const movement = resolved.get(deliverableId);
      return movement === undefined
        ? { status: "refused", reason: "contribution-endpoints-unverified" }
        : proveContribution({
            before: {
              predecessor: movement.beforePredecessor,
              member: { head: movement.before.head, tree: movement.before.tree },
            },
            after: {
              predecessor: movement.afterPredecessor,
              member: { head: movement.after.head, tree: movement.after.tree },
            },
          });
    },
  );
}

/** Response-owned selector for one exact native suffix conflict decision, resubmitted to settle it. */
export type DeliveryNativeSuffixConflictResolutionInput =
  Omit<DeliveryProviderConflictResolutionInput, "scope"> & {
    readonly scope: Extract<DeliveryProviderConflictResolutionInput["scope"], { kind: "native-suffix" }>;
  };

export type ReconcileLinkedNativeDeliverySuffixResult =
  | { readonly status: "applied"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
  | {
      readonly status: "conflict-resolution-required";
      readonly conflicts: readonly DeliveryProviderRefreshConflict[];
      readonly resolutionInput: DeliveryNativeSuffixConflictResolutionInput;
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "blocked";
      readonly reason: "contribution-conflicted" | "contribution-diverged";
      readonly paths: readonly string[];
      readonly guidance: string;
      readonly conflictPreparation?: DeliveryTerminalConflictPreparation;
      readonly externalRefRestorations?: readonly DeliveryProviderExternalRefRestoration[];
    }
  | {
      readonly status: "blocked";
      readonly reason: string;
      readonly paths?: readonly string[];
      readonly recommendedActionText: string;
    };

/** Shared refusal for a resolution that does not match the suffix freshly observed under the reservation. */
const nativeSuffixConflictResolutionMismatch = {
  status: "blocked",
  reason: "conflict-resolution-mismatch",
  recommendedActionText:
    "Keep the reservation and rerun `arc delivery native land-status` without a resolution to obtain the current disclosure, then resubmit that resolution unchanged.",
} as const;

/**
 * Reconcile the complete remaining registered suffix through the contribution-proven rewrite path.
 *
 * @param input - Exact pre-landing reservation, unpersisted landing projection, repository, protected target,
 *   and any resolution resubmitted to settle a disclosed suffix conflict.
 * @param dependencies - Fresh observers, contribution arbiter, terminal absorber/publisher, and state writer.
 * @returns The once-persisted reconciled suffix or a closed refusal preserving path evidence when available.
 */
export async function reconcileLinkedNativeDeliverySuffix(input: {
  readonly plan: DeliveryPlanV1;
  readonly before: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly landed: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly repository: string;
  readonly protectedTargetRef: string;
  readonly conflictResolution?: DeliveryNativeSuffixConflictResolutionInput;
}, dependencies: {
  readonly observeRequest: (binding: NonNullable<DeliveryStateV1["members"][number]["changeRequest"]>) => Promise<DeliveryHostRequestObservation>;
  readonly observeRef: (ref: string) => Promise<{ readonly head: string; readonly tree: string } | null>;
  readonly proveContribution: (endpoints: DeliveryContributionEndpoints) => Promise<DeliveryContributionProofResult>;
  readonly observeMemberRefCheckouts: (
    refs: readonly string[],
  ) => Promise<DeliveryMemberRefCheckoutObservation>;
  readonly absorbTop: (input: {
    readonly topRef: string;
    readonly top: { readonly head: string; readonly tree: string };
    readonly previousHighestMember: { readonly head: string; readonly tree: string };
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
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;
}): Promise<ReconcileLinkedNativeDeliverySuffixResult> {
  const operation = input.before.value.activeOperation;
  if (operation === null || operation.kind !== "land" || operation.mode !== "native") {
    return {
      status: "blocked",
      reason: "suffix-position-unavailable",
      recommendedActionText: "Keep the reservation and restore the exact native landing subject.",
    };
  }
  const landedId = operation.affectedDeliverableIds.at(-1);
  const landedIndex = landedId === undefined
    ? -1
    : input.plan.members.findIndex((member) => member.deliverableId === landedId);
  if (landedIndex < 0) {
    return {
      status: "blocked",
      reason: "suffix-position-unavailable",
      recommendedActionText: "Keep the reservation and restore the exact native landing subject.",
    };
  }
  if (landedIndex >= input.plan.members.length - 2) {
    if (input.conflictResolution !== undefined) return nativeSuffixConflictResolutionMismatch;
    const published = await dependencies.stateStore.publish(
      input.plan.planId,
      input.landed.value,
      input.landed.revision,
    );
    return published.status === "ok"
      ? { status: "applied", state: published.value }
      : {
          status: "blocked",
          reason: "state-conflict",
          recommendedActionText: "Re-read state; never overwrite a competing native landing settlement.",
        };
  }
  const suffixStart = landedIndex + 1;
  const plannedSuffix = input.plan.members.slice(suffixStart, -1);
  const landedSuffix = input.landed.value.members.slice(suffixStart, -1);
  const beforeSuffix = input.before.value.members.slice(suffixStart, -1);
  const target = input.landed.value.target;
  if (target === null || target.coordinates === null || plannedSuffix.length === 0
    || landedSuffix.length !== plannedSuffix.length || beforeSuffix.length !== plannedSuffix.length
    || landedSuffix.some((member, index) => member.deliverableId !== plannedSuffix[index]?.deliverableId)
    || beforeSuffix.some((member, index) => member.deliverableId !== plannedSuffix[index]?.deliverableId)) {
    return {
      status: "blocked",
      reason: "suffix-position-unavailable",
      recommendedActionText: "Keep the reservation and restore the complete remaining suffix.",
    };
  }
  const observations = await Promise.all(landedSuffix.map(async (member, index) => {
    const predecessor = index === 0 ? null : landedSuffix[index - 1];
    if (member.ref === null || member.changeRequest === null || member.coordinates === null
      || beforeSuffix[index]?.coordinates === null || beforeSuffix[index]?.coordinates === undefined
      || (index > 0 && predecessor?.ref === null)) return null;
    const [request, ref] = await Promise.all([
      dependencies.observeRequest(member.changeRequest),
      dependencies.observeRef(member.ref),
    ]);
    const expectedBaseRef = (index === 0 ? input.protectedTargetRef : predecessor?.ref)
      ?.replace(/^refs\/heads\//u, "");
    if (request.status !== "observed" || ref === null || expectedBaseRef === undefined
      || request.request.state !== "open"
      || request.request.repository !== input.repository
      || request.request.headRepository !== input.repository
      || request.request.headRef !== member.ref.replace(/^refs\/heads\//u, "")
      || request.request.headSha !== ref.head
      || request.request.baseRef !== expectedBaseRef) return null;
    return { request: request.request, ref };
  }));
  if (observations.some((observation) => observation === null)) {
    return {
      status: "blocked",
      reason: "suffix-request-mismatch",
      recommendedActionText:
        "Keep the reservation and rerun `arc delivery native land-status` to reobserve the complete suffix.",
    };
  }
  const observedMembers = landedSuffix.flatMap((member, index) => {
    const observation = observations[index];
    const predecessor = index === 0 ? target.coordinates : observations[index - 1]?.ref;
    return observation === null || observation === undefined || predecessor === null || predecessor === undefined
      ? []
      : [{
          deliverableId: member.deliverableId,
          ref: member.ref,
          changeRequest: member.changeRequest,
          coordinates: { base: predecessor.head, head: observation.ref.head, tree: observation.ref.tree },
        }];
  });
  if (observedMembers.length !== landedSuffix.length) {
    return {
      status: "blocked",
      reason: "suffix-position-unavailable",
      recommendedActionText: "Keep the reservation and restore complete observed suffix coordinates.",
    };
  }
  const movements: DeliveryNativeSuffixMovement[] = [];
  for (const [index, observed] of observedMembers.entries()) {
    const before = beforeSuffix[index];
    if (before?.coordinates === null || before?.coordinates === undefined) {
      return {
        status: "blocked",
        reason: "contribution-endpoints-unverified",
        recommendedActionText:
          "Keep the reservation and rerun `arc delivery native land-status` to settle the suffix before review.",
      };
    }
    if (before.coordinates.base === observed.coordinates.base
      && before.coordinates.head === observed.coordinates.head
      && before.coordinates.tree === observed.coordinates.tree) continue;
    const beforePredecessor = input.before.value.members[suffixStart + index - 1]?.coordinates;
    const afterPredecessor = index === 0 ? target.coordinates : observedMembers[index - 1]?.coordinates;
    if (beforePredecessor === null || beforePredecessor === undefined || afterPredecessor === undefined) {
      return {
        status: "blocked",
        reason: "contribution-endpoints-unverified",
        recommendedActionText:
          "Keep the reservation and rerun `arc delivery native land-status` to settle the suffix before review.",
      };
    }
    movements.push({
      deliverableId: observed.deliverableId,
      before: before.coordinates,
      after: observed.coordinates,
      beforePredecessor: { head: beforePredecessor.head, tree: beforePredecessor.tree },
      afterPredecessor: { head: afterPredecessor.head, tree: afterPredecessor.tree },
    });
  }
  const assessment = await collectNativeDeliverySuffixConflicts(movements, dependencies.proveContribution);
  if (assessment.status === "refused") {
    return "paths" in assessment
      ? {
          status: "blocked",
          reason: assessment.reason,
          paths: assessment.paths,
          guidance:
            "Keep the reservation and rebuild the listed paths onto the member's new predecessor, then rerun "
            + "`arc delivery native land-status` to reprove the rebuilt suffix.",
        }
      : {
          status: "blocked",
          reason: assessment.reason,
          recommendedActionText:
            "Keep the reservation and rerun `arc delivery native land-status` to settle the suffix before review.",
        };
  }
  if (assessment.conflicts.length > 0) {
    const resolutionInput: DeliveryNativeSuffixConflictResolutionInput = {
      planId: input.plan.planId,
      scope: { kind: "native-suffix", operationId: operation.operationId },
      expectedStateRevision: input.before.revision,
      observedSuffixDigest: canonicalDigest(
        observedMembers.map(({ deliverableId, coordinates }) => ({ deliverableId, coordinates })),
      ),
      conflicts: assessment.conflicts,
    };
    if (input.conflictResolution === undefined) {
      return {
        status: "conflict-resolution-required",
        conflicts: assessment.conflicts,
        resolutionInput,
        recommendedActionText:
          "Resubmit this resolution unchanged with `arc delivery native land-status` to accept the listed collisions under the held reservation, or resolve the listed member paths and rerun `arc delivery native land-status` without a resolution to settle the reobserved suffix.",
      };
    }
    if (canonicalize(input.conflictResolution) !== canonicalize(resolutionInput)) {
      return nativeSuffixConflictResolutionMismatch;
    }
  } else if (input.conflictResolution !== undefined) {
    return nativeSuffixConflictResolutionMismatch;
  }
  const changedRefs: string[] = [];
  const observedSuffix: DeliveryNativeObservedSuffixMemberV1[] = [];
  for (const [index, observed] of observedMembers.entries()) {
    const before = beforeSuffix[index];
    if (before?.ref === null || before?.ref === undefined || before.ref !== observed.ref
      || before.coordinates === null) {
      return {
        status: "blocked",
        reason: "local-ref-subject-mismatch",
        recommendedActionText:
          "Keep the reservation and restore the exact local member-ref subject before retrying settlement.",
      };
    }
    observedSuffix.push({
      deliverableId: observed.deliverableId,
      ref: before.ref,
      coordinates: observed.coordinates,
    });
    if (before.coordinates.head === observed.coordinates.head) continue;
    changedRefs.push(before.ref);
  }
  if (changedRefs.length > 0) {
    const checkoutObservation = await dependencies.observeMemberRefCheckouts([...new Set(changedRefs)]);
    if (checkoutObservation.status === "refused") {
      return {
        status: "blocked",
        reason: "member-ref-checkout-observation-unavailable",
        recommendedActionText:
          "Keep the reservation and restore observable local member-ref checkout authority before retrying.",
      };
    }
    const paths = [...new Set(checkoutObservation.checkouts.map(({ path }) => path))].sort();
    if (paths.length > 0) {
      return {
        status: "blocked",
        reason: "member-ref-checked-out",
        paths,
        recommendedActionText:
          "Keep the reservation and release the listed member-ref checkouts before retrying settlement.",
      };
    }
  }
  let settleRevision = input.landed.revision;
  if (changedRefs.length > 0) {
    const settling = beginNativeDeliverySettlement(input.before, operation.operationId, observedSuffix);
    if (settling.status === "refused") {
      return {
        status: "blocked",
        reason: `settlement-phase-${settling.reason}`,
        recommendedActionText:
          "Keep the reservation and restore the exact native landing subject before retrying settlement.",
      };
    }
    const phasePublished = await dependencies.stateStore.publish(
      input.plan.planId,
      settling.state,
      input.before.revision,
    );
    if (phasePublished.status !== "ok") {
      return {
        status: "blocked",
        reason: "state-conflict",
        recommendedActionText: "Re-read state; never overwrite a competing native landing settlement.",
      };
    }
    settleRevision = phasePublished.value.revision;
  }
  const externalRefRestorations: DeliveryProviderExternalRefRestoration[] = [];
  for (const [index, observed] of observedMembers.entries()) {
    const before = beforeSuffix[index];
    if (before?.ref === null || before?.ref === undefined || before.coordinates === null
      || before.coordinates.head === observed.coordinates.head) continue;
    const rewritten = await dependencies.rewriteLocalRef({
      ref: before.ref,
      beforeHead: before.coordinates.head,
      requestedHead: observed.coordinates.head,
    });
    if (rewritten.status === "refused") {
      return {
        status: "blocked",
        reason: `local-ref-${rewritten.reason ?? "refused"}`,
        recommendedActionText:
          "Keep the reservation and restore the exact local member ref before retrying settlement.",
      };
    }
    externalRefRestorations.push({
      ref: before.ref,
      observedHead: observed.coordinates.head,
      restoreHead: before.coordinates.head,
    });
  }
  const terminal = input.landed.value.members.at(-1);
  const previousHighest = beforeSuffix.at(-1);
  const highest = observedMembers.at(-1);
  if (terminal?.ref === null || terminal?.ref === undefined || terminal.coordinates === null
    || previousHighest?.coordinates === null || previousHighest?.coordinates === undefined
    || highest === undefined) {
    return {
      status: "blocked",
      reason: "terminal-top-unavailable",
      recommendedActionText: "Keep the reservation and restore the exact checked-out terminal top.",
    };
  }
  let terminalCoordinates = terminal.coordinates;
  if (terminal.coordinates.base !== highest.coordinates.head) {
    const merge = {
      topRef: terminal.ref,
      top: { head: terminal.coordinates.head, tree: terminal.coordinates.tree },
      previousHighestMember: {
        head: previousHighest.coordinates.head,
        tree: previousHighest.coordinates.tree,
      },
      highestMember: { head: highest.coordinates.head, tree: highest.coordinates.tree },
    };
    const absorbed = await dependencies.absorbTop(merge);
    if (absorbed.status !== "absorbed") {
      return absorbed.reason === "content-conflict" && absorbed.paths !== undefined
        ? {
            status: "blocked",
            reason: "contribution-conflicted",
            paths: absorbed.paths,
            guidance:
              "Keep the reservation and merge the highest member into the checked-out terminal top by hand, "
              + "resolving the listed paths, then rerun `arc delivery native land-status` to absorb the merged top.",
            conflictPreparation: {
              topRef: merge.topRef,
              logicalMergeBase: merge.previousHighestMember.head,
              parents: { top: merge.top.head, refreshedPredecessor: merge.highestMember.head },
              mergeTree: {
                argv: [
                  "git", "merge-tree", "--write-tree", "--merge-base", merge.previousHighestMember.head,
                  "--name-only", "-z", "--no-messages", merge.top.head, merge.highestMember.head,
                ],
              },
            },
            externalRefRestorations,
          }
        : {
            status: "blocked",
            reason: absorbed.reason,
            recommendedActionText:
              "Keep the reservation and restore the exact terminal top before retrying native landing settlement.",
          };
    }
    const publishedTop = await dependencies.publishTop({
      ref: terminal.ref,
      beforeHead: terminal.coordinates.head,
      requestedHead: absorbed.head,
    });
    if (publishedTop.status === "refused") {
      return {
        status: "blocked",
        reason: `top-publish-${publishedTop.reason}`,
        recommendedActionText:
          "Keep the reservation and restore the exact terminal remote ref before retrying settlement.",
      };
    }
    terminalCoordinates = {
      base: highest.coordinates.head,
      head: absorbed.head,
      tree: absorbed.tree,
    };
  }
  const observedById = new Map(observedMembers.map((member) => [member.deliverableId, member]));
  const projected: DeliveryStateV1 = {
    ...input.landed.value,
    members: input.landed.value.members.map((member, index) => {
      if (index === input.landed.value.members.length - 1) {
        return { ...member, coordinates: terminalCoordinates };
      }
      const observed = observedById.get(member.deliverableId);
      return observed === undefined ? member : { ...member, ...observed };
    }),
    activeOperation: null,
  };
  const published = await dependencies.stateStore.publish(
    input.plan.planId,
    projected,
    settleRevision,
  );
  return published.status === "ok"
    ? { status: "applied", state: published.value }
    : {
        status: "blocked",
        reason: "state-conflict",
        recommendedActionText: "Re-read state; never overwrite a competing native landing settlement.",
      };
}
