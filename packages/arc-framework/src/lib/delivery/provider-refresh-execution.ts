/** Reserved provider-native suffix preparation and publication. */

import type { DeliveryContributionProofResult } from "./contribution-proof.js";
import { canonicalize } from "../kernel/index.js";
import { reserveDeliveryOperation, validateDeliveryActiveOperation } from "./operation.js";
import type { DeliveryRevisionedRecord, DeliveryStateStore } from "./ports.js";
import type { DeliveryPositionFactsV1 } from "./position.js";
import type {
  DeliveryOperationSnapshotV1,
  DeliveryPlanV1,
  DeliveryStateV1,
} from "./schema.js";
import { DeliveryOperationSnapshotV1Schema } from "./schema.js";
import type {
  DeliveryChainAbsorptionPreflightResult,
  DeliveryChainAbsorptionResult,
} from "./chain-absorption.js";
import type { DeliveryMemberRefCheckoutObservation } from "./git-materialization.js";
import {
  changedDeliveryProviderRefreshMovements,
  collectDeliveryProviderRefreshConflicts,
  deliveryTerminalAbsorptionOwed,
  describeDeliveryProviderRefreshSubjectMismatch,
  findExactPendingSelectedRefresh,
  proveDeliveryProviderRefreshMovements,
  selectDeliveryProviderRefreshProofMovements,
  settleReservedDeliverySuffixRefresh,
  type DeliveryProviderSettlementAppliedResult,
  type DeliveryTerminalConflictPreparation,
  type ProviderAdoptionSettlementDependencies,
  DeliveryProviderRefreshMovement,
  DeliveryProviderRefreshObservation,
  DeliveryProviderRefreshObservationResult,
} from "./suffix-reconciliation.js";
import { deriveDeliveryProviderRefreshSubject } from "./provider-refresh-observation.js";

export interface DeliveryProviderRefreshCandidate {
  readonly deliverableId: string;
  readonly ref: string;
  readonly head: string;
}

/**
 * Resolve the deterministic private refresh-candidate coordinate for one nonterminal delivery member.
 *
 * @param input - Bound plan, member identity, and prepared head.
 * @returns The private candidate coordinate, or null when the member is not a nonterminal plan member.
 */
export function deliveryProviderRefreshCandidateFor(input: {
  readonly plan: DeliveryPlanV1;
  readonly deliverableId: string;
  readonly head: string;
}): DeliveryProviderRefreshCandidate | null {
  const member = input.plan.members.slice(0, -1)
    .find(({ deliverableId }) => deliverableId === input.deliverableId);
  return member === undefined
    ? null
    : {
        deliverableId: member.deliverableId,
        ref: `refs/arc/delivery-refresh-candidates/${input.plan.planId}/${member.chunkKey}`,
        head: input.head,
      };
}

export type DeriveDeliveryProviderRefreshCandidatesResult =
  | { readonly status: "derived"; readonly candidates: readonly DeliveryProviderRefreshCandidate[] }
  | { readonly status: "refused"; readonly reason: "candidate-subject-mismatch" };

/** Derive exact private candidate refs for every prepared head that actually changes. */
export function deriveDeliveryProviderRefreshCandidates(_input: {
  readonly plan: DeliveryPlanV1;
  readonly before: DeliveryOperationSnapshotV1;
  readonly requested: DeliveryOperationSnapshotV1;
}): DeriveDeliveryProviderRefreshCandidatesResult {
  const { plan, before, requested } = _input;
  if (before.members.length === 0 || before.members.length !== requested.members.length) {
    return { status: "refused", reason: "candidate-subject-mismatch" };
  }
  const nonterminal = plan.members.slice(0, -1);
  const start = nonterminal.length - before.members.length;
  if (start < 0) return { status: "refused", reason: "candidate-subject-mismatch" };
  const candidates: DeliveryProviderRefreshCandidate[] = [];
  for (const [index, beforeMember] of before.members.entries()) {
    const requestedMember = requested.members[index];
    const plannedMember = nonterminal[start + index];
    if (requestedMember === undefined || plannedMember === undefined
      || beforeMember.deliverableId !== plannedMember.deliverableId
      || requestedMember.deliverableId !== beforeMember.deliverableId
      || requestedMember.ref !== beforeMember.ref
      || requestedMember.changeRequest?.providerId !== beforeMember.changeRequest?.providerId
      || requestedMember.changeRequest?.changeRequestId !== beforeMember.changeRequest?.changeRequestId
      || beforeMember.coordinates === null || requestedMember.coordinates === null) {
      return { status: "refused", reason: "candidate-subject-mismatch" };
    }
    if (requestedMember.coordinates.head === beforeMember.coordinates.head) continue;
    const candidate = deliveryProviderRefreshCandidateFor({
      plan,
      deliverableId: plannedMember.deliverableId,
      head: requestedMember.coordinates.head,
    });
    if (candidate === null) return { status: "refused", reason: "candidate-subject-mismatch" };
    candidates.push(candidate);
  }
  return { status: "derived", candidates };
}

export interface DeliveryProviderRefreshPublishedHead {
  readonly deliverableId: string;
  readonly head: string | null;
}

export type DeliveryProviderRefreshPublicationResult =
  | { readonly status: "retry"; readonly pendingDeliverableIds: readonly string[] }
  | {
      readonly status: "partial-published";
      readonly publishedDeliverableIds: readonly string[];
      readonly pendingDeliverableIds: readonly string[];
    }
  | { readonly status: "published" }
  | { readonly status: "blocked"; readonly reason: "ambiguous-result" };

export type DeliveryProviderRefreshExecutionScope =
  | { readonly kind: "complete-remainder" }
  | { readonly kind: "dependent-suffix"; readonly selectedDeliverableId: string };

export type DeliveryProviderRefreshPreparationResult =
  | {
      readonly status: "prepared";
      readonly observation: DeliveryProviderRefreshObservation;
      readonly candidates: readonly DeliveryProviderRefreshCandidate[];
      readonly locallyResolvedDeliverableIds?: readonly string[];
    }
  | {
      readonly status: "refused";
      readonly reason: string;
      readonly paths?: readonly string[];
      readonly detail?: string;
      readonly conflictPreparation?: DeliveryTerminalConflictPreparation;
    };

export interface DeliveryProviderRefreshPreparationPort {
  prepare(input: {
    readonly plan: DeliveryPlanV1;
    readonly repository: string;
    readonly scope: DeliveryProviderRefreshExecutionScope;
    readonly before: DeliveryOperationSnapshotV1;
  }): Promise<DeliveryProviderRefreshPreparationResult>;
}

type StateWriter = Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;

export interface DeliveryProviderRefreshExecutionDependencies {
  readonly preparation: DeliveryProviderRefreshPreparationPort;
  readonly preflightTop: (input: {
    readonly topRef: string;
    readonly top: { readonly head: string; readonly tree: string };
  }) => Promise<DeliveryChainAbsorptionPreflightResult>;
  readonly observePublishedHeads: (
    snapshot: DeliveryOperationSnapshotV1,
  ) => Promise<readonly DeliveryProviderRefreshPublishedHead[]>;
  readonly observeMemberRefCheckouts: (
    refs: readonly string[],
  ) => Promise<DeliveryMemberRefCheckoutObservation>;
  readonly rewriteMemberRef: (input: {
    readonly ref: string;
    readonly beforeHead: string;
    readonly requestedHead: string;
  }) => Promise<
    | { readonly status: "rewritten" | "adopted" }
    | { readonly status: "refused"; readonly reason: string }
  >;
  readonly observeResult: () => Promise<DeliveryProviderRefreshObservationResult>;
  readonly readTargetAncestry: (
    ancestor: string,
    descendant: string,
  ) => Promise<"ancestor" | "not-ancestor" | null>;
  readonly proveContribution: (
    movement: DeliveryProviderRefreshMovement,
  ) => Promise<DeliveryContributionProofResult>;
  readonly absorbTop: (input: {
    readonly topRef: string;
    readonly top: { readonly head: string; readonly tree: string };
    readonly previousHighestMember: { readonly head: string; readonly tree?: string };
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
  readonly cleanupPreparedCandidates: (
    candidates: readonly DeliveryProviderRefreshCandidate[],
  ) => Promise<{ readonly status: "cleaned" } | { readonly status: "refused"; readonly reason: string }>;
  readonly stateStore: StateWriter;
}

export type ExecuteDeliveryProviderRefreshResult =
  | DeliveryProviderSettlementAppliedResult
  | {
      readonly status: "retryable";
      readonly reason: string;
      readonly publication: DeliveryProviderRefreshPublicationResult;
      readonly reservation: DeliveryRevisionedRecord<DeliveryStateV1>;
    }
  | {
      readonly status: "refused" | "blocked";
      readonly reason: string;
      readonly detail?: string;
      readonly paths?: readonly string[];
      readonly conflictPreparation?: DeliveryTerminalConflictPreparation;
    }
  | {
      readonly status: "blocked";
      readonly reason: string;
      readonly paths?: readonly string[];
      readonly conflictPreparation?: DeliveryTerminalConflictPreparation;
      readonly operationId: string;
      readonly nextAction: "reconcile" | "resolve-terminal-conflicts";
      readonly recommendedActionText: string;
    };

function retainedOperationBlock(
  result: {
    readonly status: "blocked";
    readonly reason: string;
    readonly paths?: readonly string[];
    readonly conflictPreparation?: DeliveryTerminalConflictPreparation;
  },
  operationId: string,
): ExecuteDeliveryProviderRefreshResult {
  if (result.reason === "content-conflict" && result.paths !== undefined && result.paths.length > 0) {
    return {
      ...result,
      operationId,
      nextAction: "resolve-terminal-conflicts",
      recommendedActionText:
        "The provider-refresh reservation remains active. Resolve the listed terminal predecessor conflicts as "
        + "one exact two-parent absorption commit, then run `arc delivery reconcile` and retry its exact selector.",
    };
  }
  return {
    ...result,
    operationId,
    nextAction: "reconcile",
    recommendedActionText:
      "The provider-refresh reservation remains active. Run `arc delivery reconcile` and retry its exact selector.",
  };
}

function preparedMemberRefs(
  snapshot: DeliveryOperationSnapshotV1,
  candidates: readonly DeliveryProviderRefreshCandidate[],
): readonly string[] | null {
  const refs: string[] = [];
  for (const candidate of candidates) {
    const member = snapshot.members.find(({ deliverableId }) => deliverableId === candidate.deliverableId);
    if (member?.ref === null || member?.ref === undefined || !member.ref.startsWith("refs/heads/")) {
      return null;
    }
    refs.push(member.ref);
  }
  return [...new Set(refs)];
}

function checkoutRefusal(
  observation: DeliveryMemberRefCheckoutObservation,
): { readonly reason: string; readonly paths?: readonly string[] } | null {
  if (observation.status === "refused") {
    return { reason: "member-ref-checkout-observation-unavailable" };
  }
  const paths = [...new Set(observation.checkouts.map(({ path }) => path))].sort();
  return paths.length === 0 ? null : { reason: "member-ref-checked-out", paths };
}

/** Prepare or resume one exact provider-native suffix refresh under ARC publication authority. */
export async function executeDeliveryProviderRefresh(_input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly repository: string;
  readonly scope?: DeliveryProviderRefreshExecutionScope;
  readonly operationId?: string;
  readonly facts?: DeliveryPositionFactsV1;
}, _deps: DeliveryProviderRefreshExecutionDependencies): Promise<ExecuteDeliveryProviderRefreshResult> {
  const input = _input;
  const deps = _deps;
  let reservation = input.current;
  let candidates: readonly DeliveryProviderRefreshCandidate[];
  let memberRefsCheckedBeforeReservation = false;

  if (input.current.value.activeOperation === null) {
    if (input.operationId !== undefined || input.scope === undefined || input.facts === undefined
      || input.repository === "") {
      return { status: "refused", reason: "invalid-input" };
    }
    const derived = deriveDeliveryProviderRefreshSubject({
      plan: input.plan,
      state: input.current.value,
      facts: input.facts,
    });
    if (derived.status !== "derived") return { status: "refused", reason: derived.reason };
    const terminalAuthoringMovement = input.facts.terminalAuthoringMovement;
    if (terminalAuthoringMovement !== undefined && input.scope.kind !== "dependent-suffix") {
      return { status: "refused", reason: "invalid-input" };
    }
    const selectedIndex = input.scope.kind === "dependent-suffix"
      ? derived.subject.affectedDeliverableIds.indexOf(input.scope.selectedDeliverableId)
      : -1;
    const pendingSelectedDeliverableId = findExactPendingSelectedRefresh(input.current.value);
    if (input.scope.kind === "dependent-suffix" && (
      selectedIndex < 0
      || pendingSelectedDeliverableId !== input.scope.selectedDeliverableId
    )) {
      return { status: "refused", reason: "selected-member-invalid" };
    }
    if (input.scope.kind === "complete-remainder" && pendingSelectedDeliverableId !== null) {
      return { status: "refused", reason: "selected-member-invalid" };
    }
    const prepared: DeliveryProviderRefreshPreparationResult = input.scope.kind === "dependent-suffix"
      && selectedIndex === derived.subject.before.members.length - 1
      ? {
          status: "prepared",
          observation: { snapshot: derived.subject.before, targetMovement: "exact" },
          candidates: [],
        }
      : await deps.preparation.prepare({
          plan: input.plan,
          repository: input.repository,
          scope: input.scope,
          before: derived.subject.before,
        });
    if (prepared.status === "refused") {
      return prepared.reason === "content-conflict"
        && prepared.paths !== undefined
        && prepared.paths.length > 0
        && prepared.conflictPreparation !== undefined
        ? {
            status: "blocked",
            reason: "content-conflict",
            paths: prepared.paths,
            conflictPreparation: prepared.conflictPreparation,
          }
        : prepared;
    }
    const requested = DeliveryOperationSnapshotV1Schema.safeParse(prepared.observation.snapshot);
    if (!requested.success) {
      const cleaned = await deps.cleanupPreparedCandidates(prepared.candidates);
      return cleaned.status === "cleaned"
        ? { status: "refused", reason: "prepared-result-invalid" }
        : { status: "blocked", reason: `candidate-cleanup-${cleaned.reason}` };
    }
    const allMovements = changedDeliveryProviderRefreshMovements(
      derived.subject.before,
      { ...prepared.observation, snapshot: requested.data },
    );
    const candidateResult = deriveDeliveryProviderRefreshCandidates({
      plan: input.plan,
      before: derived.subject.before,
      requested: requested.data,
    });
    const expectedCandidates = candidateResult.status === "derived" ? candidateResult.candidates : null;
    const dependentPrefixHeadMoved = selectedIndex >= 0 && derived.subject.before.members
      .slice(0, selectedIndex + 1)
      .some((member, index) => {
        const beforeCoordinates = member.coordinates;
        const requestedCoordinates = requested.data.members[index]?.coordinates;
        return beforeCoordinates === null || requestedCoordinates === null || requestedCoordinates === undefined
          || beforeCoordinates.head !== requestedCoordinates.head
          || beforeCoordinates.tree !== requestedCoordinates.tree;
      });
    const movements = allMovements === null
      ? null
      : input.scope.kind === "dependent-suffix"
        ? selectDeliveryProviderRefreshProofMovements(
            requested.data,
            allMovements,
            input.scope.selectedDeliverableId,
          )
        : allMovements;
    if (movements === null || expectedCandidates === null
      || canonicalize(expectedCandidates) !== canonicalize(prepared.candidates)
      || (input.scope.kind === "dependent-suffix" && dependentPrefixHeadMoved)
      || (movements.length === 0
        && !deliveryTerminalAbsorptionOwed(input.current.value, requested.data))) {
      const preparedMismatchReasons = [
        ...(movements === null
          ? [`movement-set:${describeDeliveryProviderRefreshSubjectMismatch(
              derived.subject.before,
              { ...prepared.observation, snapshot: requested.data },
            ) ?? "unknown"}`]
          : []),
        ...(expectedCandidates === null ? ["candidate-subject"] : []),
        ...(expectedCandidates !== null
          && canonicalize(expectedCandidates) !== canonicalize(prepared.candidates)
          ? ["candidate-set"] : []),
        ...(input.scope.kind === "dependent-suffix" && dependentPrefixHeadMoved
          ? ["selected-prefix-moved"] : []),
        ...(movements !== null && movements.length === 0
          && !deliveryTerminalAbsorptionOwed(input.current.value, requested.data)
          ? ["no-effect"] : []),
      ];
      const cleaned = await deps.cleanupPreparedCandidates(prepared.candidates);
      return cleaned.status === "cleaned"
        ? {
            status: "refused",
            reason: "prepared-result-mismatch",
            detail: preparedMismatchReasons.join(","),
          }
        : { status: "blocked", reason: `candidate-cleanup-${cleaned.reason}` };
    }
    const locallyResolvedDeliverableIds = prepared.locallyResolvedDeliverableIds ?? [];
    const movementIds = new Set(movements.map(({ deliverableId }) => deliverableId));
    const localResolutionIds = new Set(locallyResolvedDeliverableIds);
    if ((input.scope.kind !== "dependent-suffix" && locallyResolvedDeliverableIds.length > 0)
      || localResolutionIds.size !== locallyResolvedDeliverableIds.length
      || locallyResolvedDeliverableIds.some((deliverableId) => !movementIds.has(deliverableId))) {
      const cleaned = await deps.cleanupPreparedCandidates(prepared.candidates);
      if (cleaned.status === "refused") {
        return { status: "blocked", reason: `candidate-cleanup-${cleaned.reason}` };
      }
      return { status: "refused", reason: "conflict-resolution-mismatch" };
    }
    let approvedConflictDeliverableIds: readonly string[] = [];
    if (locallyResolvedDeliverableIds.length > 0) {
      const assessment = await collectDeliveryProviderRefreshConflicts(movements, deps.proveContribution);
      if (assessment.status === "refused") {
        const cleaned = await deps.cleanupPreparedCandidates(prepared.candidates);
        if (cleaned.status === "refused") {
          return { status: "blocked", reason: `candidate-cleanup-${cleaned.reason}` };
        }
        return assessment;
      }
      const unapproved = assessment.conflicts.find(({ deliverableId }) => !localResolutionIds.has(deliverableId));
      if (unapproved !== undefined) {
        const cleaned = await deps.cleanupPreparedCandidates(prepared.candidates);
        if (cleaned.status === "refused") {
          return { status: "blocked", reason: `candidate-cleanup-${cleaned.reason}` };
        }
        return { status: "refused", reason: "contribution-conflicted", paths: unapproved.paths };
      }
      approvedConflictDeliverableIds = assessment.conflicts.map(({ deliverableId }) => deliverableId);
    } else {
      const proof = await proveDeliveryProviderRefreshMovements(movements, deps.proveContribution);
      if (proof !== null) {
        const cleaned = await deps.cleanupPreparedCandidates(prepared.candidates);
        if (cleaned.status === "refused") {
          return { status: "blocked", reason: `candidate-cleanup-${cleaned.reason}` };
        }
        return proof;
      }
    }
    if (deliveryTerminalAbsorptionOwed(input.current.value, requested.data)) {
      const terminal = input.current.value.members.at(-1);
      const terminalCoordinates = terminalAuthoringMovement?.after ?? terminal?.coordinates;
      if (terminal?.ref === null || terminal?.ref === undefined || terminalCoordinates === null
        || terminalCoordinates === undefined) {
        const cleaned = await deps.cleanupPreparedCandidates(prepared.candidates);
        return cleaned.status === "cleaned"
          ? { status: "refused", reason: "terminal-top-unavailable" }
          : { status: "blocked", reason: `candidate-cleanup-${cleaned.reason}` };
      }
      const preflight = await deps.preflightTop({
        topRef: terminal.ref,
        top: { head: terminalCoordinates.head, tree: terminalCoordinates.tree },
      });
      if (preflight.status === "refused") {
        const cleaned = await deps.cleanupPreparedCandidates(prepared.candidates);
        return cleaned.status === "cleaned"
          ? preflight
          : { status: "blocked", reason: `candidate-cleanup-${cleaned.reason}` };
      }
    }
    const memberRefs = preparedMemberRefs(requested.data, prepared.candidates);
    if (memberRefs === null) {
      const cleaned = await deps.cleanupPreparedCandidates(prepared.candidates);
      return cleaned.status === "cleaned"
        ? { status: "refused", reason: "prepared-result-mismatch" }
        : { status: "blocked", reason: `candidate-cleanup-${cleaned.reason}` };
    }
    const occupied = checkoutRefusal(await deps.observeMemberRefCheckouts(memberRefs));
    if (occupied !== null) {
      const cleaned = await deps.cleanupPreparedCandidates(prepared.candidates);
      return cleaned.status === "cleaned"
        ? { status: "refused", ...occupied }
        : { status: "blocked", reason: `candidate-cleanup-${cleaned.reason}` };
    }
    memberRefsCheckedBeforeReservation = true;
    const reserved = reserveDeliveryOperation(input.current, input.plan, {
      operationId: crypto.randomUUID(),
      kind: "rewrite",
      mode: "provider-refresh",
      affectedDeliverableIds: derived.subject.affectedDeliverableIds,
      expectedStateRevision: input.current.revision,
      before: derived.subject.before,
      requested: requested.data,
      ...(terminalAuthoringMovement === undefined ? {} : { terminalAuthoringMovement }),
      ...(input.scope.kind === "dependent-suffix"
        ? {
            reviewFixSelectedDeliverableId: input.scope.selectedDeliverableId,
            reviewFixVerificationDeliverableIds: [
              input.scope.selectedDeliverableId,
              ...approvedConflictDeliverableIds,
            ],
          }
        : {}),
    });
    if (reserved.status !== "reserved") {
      const cleaned = await deps.cleanupPreparedCandidates(prepared.candidates);
      return cleaned.status === "cleaned"
        ? { status: "refused", reason: "reservation-refused" }
        : { status: "blocked", reason: `candidate-cleanup-${cleaned.reason}` };
    }
    const persisted = await deps.stateStore.publish(input.plan.planId, reserved.state, input.current.revision);
    if (persisted.status !== "ok") {
      const cleaned = await deps.cleanupPreparedCandidates(prepared.candidates);
      return cleaned.status === "cleaned"
        ? { status: "refused", reason: "state-conflict" }
        : { status: "blocked", reason: `candidate-cleanup-${cleaned.reason}` };
    }
    reservation = persisted.value;
    candidates = prepared.candidates;
  } else {
    const active = validateDeliveryActiveOperation(input.current);
    if (active.status !== "valid" || active.operation.kind !== "rewrite"
      || active.operation.mode !== "provider-refresh"
      || input.operationId !== active.operation.operationId
      || input.scope !== undefined) {
      return { status: "refused", reason: "operation-mismatch" };
    }
    const candidateResult = deriveDeliveryProviderRefreshCandidates({
      plan: input.plan,
      before: active.operation.before,
      requested: active.operation.requested,
    });
    if (candidateResult.status !== "derived") {
      return retainedOperationBlock(
        { status: "blocked", reason: candidateResult.reason },
        active.operation.operationId,
      );
    }
    candidates = candidateResult.candidates;
  }

  const active = validateDeliveryActiveOperation(reservation);
  if (active.status !== "valid" || active.operation.kind !== "rewrite"
    || active.operation.mode !== "provider-refresh") {
    return { status: "blocked", reason: "operation-mismatch" };
  }
  const memberRefs = preparedMemberRefs(active.operation.requested, candidates);
  if (memberRefs === null) {
    return retainedOperationBlock(
      { status: "blocked", reason: "publication-subject-mismatch" },
      active.operation.operationId,
    );
  }
  if (!memberRefsCheckedBeforeReservation) {
    const occupied = checkoutRefusal(await deps.observeMemberRefCheckouts(memberRefs));
    if (occupied !== null) {
      return retainedOperationBlock(
        { status: "blocked", ...occupied },
        active.operation.operationId,
      );
    }
  }
  let observed: readonly DeliveryProviderRefreshPublishedHead[];
  try {
    observed = await deps.observePublishedHeads(active.operation.requested);
  } catch {
    return retainedOperationBlock(
      { status: "blocked", reason: "observation-unavailable" },
      active.operation.operationId,
    );
  }
  let publication = classifyDeliveryProviderRefreshPublication({
    before: active.operation.before,
    requested: active.operation.requested,
    observed,
  });
  if (publication.status === "blocked") {
    return retainedOperationBlock(publication, active.operation.operationId);
  }
  const pending = publication.status === "published" ? [] : publication.pendingDeliverableIds;
  for (const deliverableId of pending) {
    const beforeMember = active.operation.before.members.find((member) => member.deliverableId === deliverableId);
    const requestedMember = active.operation.requested.members.find(
      (member) => member.deliverableId === deliverableId,
    );
    if (beforeMember?.ref === null || beforeMember?.ref === undefined || beforeMember.coordinates === null
      || requestedMember?.ref !== beforeMember.ref || requestedMember.coordinates === null) {
      return retainedOperationBlock(
        { status: "blocked", reason: "publication-subject-mismatch" },
        active.operation.operationId,
      );
    }
    const rewritten = await deps.rewriteMemberRef({
      ref: beforeMember.ref,
      beforeHead: beforeMember.coordinates.head,
      requestedHead: requestedMember.coordinates.head,
    });
    if (rewritten.status === "refused") {
      try {
        publication = classifyDeliveryProviderRefreshPublication({
          before: active.operation.before,
          requested: active.operation.requested,
          observed: await deps.observePublishedHeads(active.operation.requested),
        });
      } catch {
        return retainedOperationBlock(
          { status: "blocked", reason: "observation-unavailable" },
          active.operation.operationId,
        );
      }
      if (publication.status === "blocked") {
        return retainedOperationBlock(publication, active.operation.operationId);
      }
      const stillPending = publication.status === "published"
        ? false
        : publication.pendingDeliverableIds.includes(deliverableId);
      if (!stillPending) continue;
      return {
        status: "retryable",
        reason: rewritten.reason,
        publication,
        reservation,
      };
    }
  }

  const settlementDeps: ProviderAdoptionSettlementDependencies = {
    observeResult: deps.observeResult,
    readTargetAncestry: deps.readTargetAncestry,
    proveContribution: deps.proveContribution,
    absorbTop: deps.absorbTop,
    publishTop: deps.publishTop,
    rewriteLocalRef: deps.rewriteLocalRef,
    cleanupPreparedCandidates: () => deps.cleanupPreparedCandidates(candidates),
    stateStore: deps.stateStore,
  };
  const settled = await settleReservedDeliverySuffixRefresh({
    plan: input.plan,
    current: reservation,
    ...settlementDeps,
  });
  return settled.status === "blocked"
    ? retainedOperationBlock(settled, active.operation.operationId)
    : settled;
}

/** Classify one exact remote suffix observation during non-atomic publication. */
export function classifyDeliveryProviderRefreshPublication(input: {
  readonly before: DeliveryOperationSnapshotV1;
  readonly requested: DeliveryOperationSnapshotV1;
  readonly observed: readonly DeliveryProviderRefreshPublishedHead[];
}): DeliveryProviderRefreshPublicationResult {
  if (input.before.members.length === 0
    || input.before.members.length !== input.requested.members.length
    || input.before.members.length !== input.observed.length) {
    return { status: "blocked", reason: "ambiguous-result" };
  }

  const changed: Array<{ readonly deliverableId: string; readonly state: "before" | "requested" }> = [];
  for (const [index, beforeMember] of input.before.members.entries()) {
    const requestedMember = input.requested.members[index];
    const observedMember = input.observed[index];
    if (requestedMember === undefined || observedMember === undefined
      || requestedMember.deliverableId !== beforeMember.deliverableId
      || requestedMember.ref !== beforeMember.ref
      || observedMember.deliverableId !== beforeMember.deliverableId
      || beforeMember.coordinates === null || requestedMember.coordinates === null
      || observedMember.head === null) {
      return { status: "blocked", reason: "ambiguous-result" };
    }
    const beforeHead = beforeMember.coordinates.head;
    const requestedHead = requestedMember.coordinates.head;
    if (beforeHead === requestedHead) {
      if (observedMember.head !== beforeHead) return { status: "blocked", reason: "ambiguous-result" };
      continue;
    }
    if (observedMember.head === requestedHead) {
      changed.push({ deliverableId: beforeMember.deliverableId, state: "requested" });
    } else if (observedMember.head === beforeHead) {
      changed.push({ deliverableId: beforeMember.deliverableId, state: "before" });
    } else {
      return { status: "blocked", reason: "ambiguous-result" };
    }
  }

  if (changed.length === 0 || changed.every(({ state }) => state === "requested")) {
    return { status: "published" };
  }
  if (changed.every(({ state }) => state === "before")) {
    return {
      status: "retry",
      pendingDeliverableIds: changed.map(({ deliverableId }) => deliverableId),
    };
  }
  const firstBefore = changed.findIndex(({ state }) => state === "before");
  if (firstBefore <= 0 || changed.slice(firstBefore).some(({ state }) => state !== "before")) {
    return { status: "blocked", reason: "ambiguous-result" };
  }
  return {
    status: "partial-published",
    publishedDeliverableIds: changed.slice(0, firstBefore).map(({ deliverableId }) => deliverableId),
    pendingDeliverableIds: changed.slice(firstBefore).map(({ deliverableId }) => deliverableId),
  };
}
