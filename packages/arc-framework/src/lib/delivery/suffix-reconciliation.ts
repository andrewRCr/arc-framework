/** Exact reservation and convergence for one predecessor-changing suffix retarget. */

import { canonicalDigest, canonicalize } from "../kernel/index.js";
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
  type DeliveryPendingReviewFixVerificationV1,
  type DeliveryPlanV1,
  type DeliveryStateV1,
  type DeliveryTerminalAuthoringMovementV1,
} from "./schema.js";
import type {
  DeliveryContributionProofResult,
  DeliveryContributionRefusal,
} from "./contribution-proof.js";
import type {
  DeliveryChainAbsorptionPreflightResult,
  DeliveryChainAbsorptionResult,
} from "./chain-absorption.js";
import { validateDeliveryStateAgainstPlan } from "./state.js";
import {
  projectDeliveryReviewFixVerificationContinuation,
  type DeliveryReviewFixVerificationContinuation,
} from "./review-fix-verification.js";

type StateWriter = Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;

/** Final provider settlement, optionally carrying the exact changed-member verification continuation. */
export type DeliveryProviderSettlementAppliedResult =
  | { readonly status: "applied"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
  | ({ readonly status: "applied"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
    & DeliveryReviewFixVerificationContinuation);

/** One provider-assigned member coordinate change presented to the contribution arbiter. */
export interface DeliveryProviderRefreshMovement {
  readonly deliverableId: string;
  readonly before: DeliveryOperationSnapshotV1["members"][number];
  readonly after: DeliveryOperationSnapshotV1["members"][number];
}

/** One mechanically conflicting movement that requires exact operator classification. */
export interface DeliveryProviderRefreshConflict {
  readonly deliverableId: string;
  readonly paths: readonly string[];
}

/** Response-owned selector for one exact dependent-suffix conflict decision. */
export interface DeliveryProviderConflictResolutionInput {
  readonly planId: string;
  readonly scope: {
    readonly kind: "dependent-suffix";
    readonly selectedDeliverableId: string;
  };
  readonly expectedStateRevision: number;
  readonly observedSuffixDigest: string;
  readonly conflicts: readonly DeliveryProviderRefreshConflict[];
}

/** Exact lease coordinates needed to undo an externally moved ref after declining adoption. */
export interface DeliveryProviderExternalRefRestoration {
  readonly ref: string;
  readonly observedHead: string;
  readonly restoreHead: string;
}

/** Mutation-free operator decision returned for one complete conflicted dependent set. */
export interface DeliveryProviderConflictResolutionRequired {
  readonly status: "conflict-resolution-required";
  readonly conflicts: readonly DeliveryProviderRefreshConflict[];
  readonly resolutionInput: DeliveryProviderConflictResolutionInput;
  readonly externalRefRestorations: readonly DeliveryProviderExternalRefRestoration[];
  readonly recommendedActionText: string;
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

/**
 * Test whether one selected member is the sole published break in an otherwise current delivery chain.
 *
 * @param state - Current delivery state after selected-member publication
 * @param selectedDeliverableId - Member whose dependents remain based on its superseded head
 * @returns True only when the first dependent is stale and every later predecessor edge is current
 */
export function hasExactPendingSelectedRefresh(
  state: DeliveryStateV1,
  selectedDeliverableId: string,
): boolean {
  const selectedIndex = state.members.findIndex(({ deliverableId }) => deliverableId === selectedDeliverableId);
  if (selectedIndex < 0 || selectedIndex >= state.members.length - 1) return false;
  for (let index = selectedIndex + 1; index < state.members.length; index += 1) {
    const predecessor = state.members[index - 1]?.coordinates;
    const member = state.members[index]?.coordinates;
    if (predecessor === null || predecessor === undefined || member === null || member === undefined) return false;
    const chainIsCurrent = member.base === predecessor.head;
    if (index === selectedIndex + 1 ? chainIsCurrent : !chainIsCurrent) return false;
  }
  return true;
}

/** Resolve the earliest selected member whose published head has not reached its dependent suffix. */
export function findExactPendingSelectedRefresh(state: DeliveryStateV1): string | null {
  for (let index = 0; index < state.members.length - 1; index += 1) {
    const selected = state.members[index];
    const dependent = state.members[index + 1];
    if (selected?.coordinates === null || selected?.coordinates === undefined
      || dependent?.coordinates === null || dependent?.coordinates === undefined) continue;
    if (dependent.coordinates.base !== selected.coordinates.head) return selected.deliverableId;
  }
  return null;
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

/** Identify the first exact structural mismatch in a provider-refresh observation. */
export function describeDeliveryProviderRefreshSubjectMismatch(
  before: DeliveryOperationSnapshotV1,
  observed: DeliveryProviderRefreshObservation,
): string | null {
  const targetCoordinates = observed.snapshot.target?.coordinates;
  if (targetCoordinates === null || targetCoordinates === undefined) return "target-coordinates";
  if (observed.snapshot.target?.ref !== before.target?.ref) return "target-ref";
  if (observed.targetMovement !== "append-only"
    && canonicalize(observed.snapshot.target) !== canonicalize(before.target)) return "target-movement";
  if (observed.snapshot.members.length !== before.members.length) return "member-count";
  for (const [index, member] of before.members.entries()) {
    const result = observed.snapshot.members[index];
    const expectedBase = index === 0
      ? targetCoordinates.head
      : observed.snapshot.members[index - 1]?.coordinates?.head;
    if (result === undefined) return `member-missing:${index}`;
    if (result.deliverableId !== member.deliverableId) return `member-id:${index}`;
    if (result.ref !== member.ref) return `member-ref:${index}`;
    if (canonicalize(result.changeRequest) !== canonicalize(member.changeRequest)) {
      return `member-change-request:${index}`;
    }
    if (result.coordinates === null) return `member-coordinates:${index}`;
    if (result.coordinates.base !== expectedBase) {
      return `member-base:${index}:expected-${expectedBase ?? "unavailable"}:observed-${result.coordinates.base}`;
    }
  }
  return null;
}

/** Derive every changed member after validating one exact provider-refresh subject. */
export function changedDeliveryProviderRefreshMovements(
  before: DeliveryOperationSnapshotV1,
  observed: DeliveryProviderRefreshObservation,
): DeliveryProviderRefreshMovement[] | null {
  if (describeDeliveryProviderRefreshSubjectMismatch(before, observed) !== null) return null;
  return before.members.flatMap((member, index) => {
    const result = observed.snapshot.members[index];
    if (result === undefined || canonicalize(result.coordinates) === canonicalize(member.coordinates)) return [];
    return [{ deliverableId: member.deliverableId, before: member, after: result }];
  });
}

/** Restrict dependent-refresh contribution proof to members strictly above its fixed selection. */
export function selectDeliveryProviderRefreshProofMovements(
  snapshot: DeliveryOperationSnapshotV1,
  movements: readonly DeliveryProviderRefreshMovement[],
  selectedDeliverableId: string,
): readonly DeliveryProviderRefreshMovement[] | null {
  const selectedIndex = snapshot.members.findIndex(
    ({ deliverableId }) => deliverableId === selectedDeliverableId,
  );
  if (selectedIndex < 0) return null;
  const dependentIds = new Set(snapshot.members
    .slice(selectedIndex + 1)
    .map(({ deliverableId }) => deliverableId));
  return movements.filter(({ deliverableId }) => dependentIds.has(deliverableId));
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

export async function collectDeliveryProviderRefreshConflicts(
  movements: readonly DeliveryProviderRefreshMovement[],
  proveContribution: (
    movement: DeliveryProviderRefreshMovement,
  ) => Promise<DeliveryContributionProofResult>,
): Promise<
  | { readonly status: "assessed"; readonly conflicts: readonly DeliveryProviderRefreshConflict[] }
  | DeliveryContributionRefusal
> {
  const conflicts: DeliveryProviderRefreshConflict[] = [];
  for (const movement of movements) {
    const proof = await proveContribution(movement);
    if (proof.status === "accepted") continue;
    if (proof.reason !== "contribution-conflicted") return proof;
    if (proof.paths.length === 0 || proof.paths.some((path) => path.length === 0)) {
      return { status: "refused", reason: "git-failure" };
    }
    conflicts.push({ deliverableId: movement.deliverableId, paths: proof.paths });
  }
  return { status: "assessed", conflicts };
}

function applyProviderSettlement(
  state: DeliveryStateV1,
  observed: DeliveryProviderRefreshObservation,
  terminalCoordinates: NonNullable<DeliveryStateV1["members"][number]["coordinates"]>,
): DeliveryStateV1 | null {
  const byId = new Map(observed.snapshot.members.map((member) => [member.deliverableId, member]));
  const selectedDeliverableId = state.activeOperation?.kind === "rewrite"
    && (state.activeOperation.mode === "provider-refresh"
      || state.activeOperation.mode === "provider-adoption")
    ? state.activeOperation.reviewFixSelectedDeliverableId
    : undefined;
  const verificationDeliverableIds = state.activeOperation?.kind === "rewrite"
    && (state.activeOperation.mode === "provider-refresh"
      || state.activeOperation.mode === "provider-adoption")
    ? state.activeOperation.reviewFixVerificationDeliverableIds
    : undefined;
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
    pendingReviewFixVerification: selectedDeliverableId === undefined
      || verificationDeliverableIds === undefined
      ? null
      : { selectedDeliverableId, memberDeliverableIds: verificationDeliverableIds },
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
      readonly conflictPreparation?: DeliveryTerminalConflictPreparation;
    };

export interface DeliveryTerminalConflictPreparation {
  readonly topRef: string;
  readonly logicalMergeBase: string;
  readonly parents: {
    readonly top: string;
    readonly refreshedPredecessor: string;
  };
  readonly mergeTree: {
    readonly argv: readonly string[];
  };
  readonly workspace?: {
    readonly path: string;
    readonly head: string;
  };
}

export interface ProviderAdoptionSettlementDependencies {
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
  readonly cleanupPreparedCandidates?: () => Promise<
    | { readonly status: "cleaned" }
    | { readonly status: "refused"; readonly reason: string }
  >;
  readonly stateStore: StateWriter;
}

/** Pre-reservation terminal readiness needed by a fresh external adoption. */
export interface ProviderAdoptionExecutionDependencies extends ProviderAdoptionSettlementDependencies {
  readonly preflightTop: (input: {
    readonly topRef: string;
    readonly top: { readonly head: string; readonly tree: string };
  }) => Promise<DeliveryChainAbsorptionPreflightResult>;
}

/** Reobserve and finish one persisted post-observation provider-adoption reservation. */
export async function settleReservedDeliverySuffixRefresh(input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
} & ProviderAdoptionSettlementDependencies): Promise<
  | DeliveryProviderSettlementAppliedResult
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
  if (changedDeliveryProviderRefreshMovements(active.operation.before, observation) === null) {
    return { status: "blocked", reason: "ambiguous" };
  }
  let settlementObservation = observation;
  if (canonicalize(observation.snapshot) !== canonicalize(requested.data)) {
    const requestedTargetHead = requested.data.target?.coordinates?.head;
    const observedTargetHead = observation.snapshot.target?.coordinates?.head;
    if (requestedTargetHead === undefined || observedTargetHead === undefined) {
      return { status: "blocked", reason: "ambiguous" };
    }
    const normalizedSnapshot = {
      target: requested.data.target,
      members: observation.snapshot.members.map((member, index) => ({
        ...member,
        coordinates: index !== 0 || member.coordinates === null
          ? member.coordinates
          : { ...member.coordinates, base: requestedTargetHead },
      })),
    };
    if (observation.targetMovement !== "append-only"
      || canonicalize(normalizedSnapshot) !== canonicalize(requested.data)) {
      return { status: "blocked", reason: "ambiguous" };
    }
    const targetAncestry = await input.readTargetAncestry(requestedTargetHead, observedTargetHead);
    if (targetAncestry === null) return { status: "blocked", reason: "observation-unavailable" };
    if (targetAncestry !== "ancestor") return { status: "blocked", reason: "target-rewritten" };
    settlementObservation = { snapshot: requested.data, targetMovement: observation.targetMovement };
  }
  const allMovements = changedDeliveryProviderRefreshMovements(
    active.operation.before,
    settlementObservation,
  );
  const reviewFixSelectedDeliverableId = active.operation.reviewFixSelectedDeliverableId;
  const movements = allMovements === null
    ? null
    : reviewFixSelectedDeliverableId === undefined
      ? allMovements
      : selectDeliveryProviderRefreshProofMovements(
          settlementObservation.snapshot,
          allMovements,
          reviewFixSelectedDeliverableId,
        );
  if (movements === null || (movements.length === 0
    && !deliveryTerminalAbsorptionOwed(active.state, settlementObservation.snapshot))) {
    return { status: "blocked", reason: "ambiguous" };
  }
  const verificationIds = active.operation.reviewFixVerificationDeliverableIds ?? [];
  const approvedConflictIds = verificationIds.filter(
    (deliverableId) => deliverableId !== reviewFixSelectedDeliverableId,
  );
  if (approvedConflictIds.length > 0) {
    const assessment = await collectDeliveryProviderRefreshConflicts(movements, input.proveContribution);
    if (assessment.status === "refused") return { ...assessment, status: "blocked" };
    if (canonicalize(assessment.conflicts.map(({ deliverableId }) => deliverableId))
      !== canonicalize(approvedConflictIds)) {
      return { status: "blocked", reason: "conflict-resolution-mismatch" };
    }
  } else {
    const refusal = await proveDeliveryProviderRefreshMovements(movements, input.proveContribution);
    if (refusal !== null) return { ...refusal, status: "blocked" };
  }

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
  const highestMember = settlementObservation.snapshot.members.at(-1);
  if (terminal?.ref === null || terminal?.ref === undefined || terminal.coordinates === null
    || highestMember?.coordinates === null || highestMember?.coordinates === undefined) {
    return { status: "blocked", reason: "terminal-top-unavailable" };
  }
  const terminalAuthoringMovement = active.operation.terminalAuthoringMovement;
  let terminalCoordinates = terminalAuthoringMovement?.after ?? terminal.coordinates;
  if (terminalCoordinates.base !== highestMember.coordinates.head) {
    const absorbed = await input.absorbTop({
      topRef: terminal.ref,
      top: { head: terminalCoordinates.head, tree: terminalCoordinates.tree },
      previousHighestMember: { head: terminalCoordinates.base },
      highestMember: {
        head: highestMember.coordinates.head,
        tree: highestMember.coordinates.tree,
      },
    });
    if (absorbed.status !== "absorbed") {
      const conflictPreparation: DeliveryTerminalConflictPreparation | undefined =
        absorbed.reason === "content-conflict"
          ? {
              topRef: terminal.ref,
              logicalMergeBase: terminalCoordinates.base,
              parents: {
                top: terminalCoordinates.head,
                refreshedPredecessor: highestMember.coordinates.head,
              },
              mergeTree: {
                argv: [
                  "git", "merge-tree", "--write-tree", "--merge-base", terminalCoordinates.base,
                  "--name-only", "-z", "--no-messages", terminalCoordinates.head,
                  highestMember.coordinates.head,
                ],
              },
            }
          : undefined;
      return {
        status: "blocked",
        reason: absorbed.reason,
        ...(absorbed.paths === undefined ? {} : { paths: absorbed.paths }),
        ...(conflictPreparation === undefined ? {} : { conflictPreparation }),
      };
    }
    const published = await input.publishTop({
      ref: terminal.ref,
      beforeHead: terminalAuthoringMovement?.publicationLeaseHead ?? terminalCoordinates.head,
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
  const applied = applyProviderSettlement(active.state, settlementObservation, terminalCoordinates);
  if (applied === null || validateDeliveryStateAgainstPlan(applied, input.plan).status === "refused") {
    return { status: "blocked", reason: "ambiguous" };
  }
  const persisted = await input.stateStore.publish(
    input.plan.planId,
    applied,
    input.current.revision,
  );
  if (persisted.status !== "ok") return { status: "blocked", reason: "state-conflict" };
  const continuation = projectDeliveryReviewFixVerificationContinuation({
    planId: input.plan.planId,
    state: persisted.value,
  });
  if (continuation === null) return { status: "applied", state: persisted.value };
  return {
    status: "applied",
    state: persisted.value,
    ...continuation,
  };
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
  readonly supersedePendingReviewFixVerification?: DeliveryPendingReviewFixVerificationV1;
  readonly revalidateLifecycle: () => Promise<
    | { readonly status: "ok" }
    | {
        readonly status: "refused";
        readonly reason?: string;
        readonly paths?: readonly string[];
      }
  >;
  readonly rewriteRef: (input: {
    readonly ref: string;
    readonly beforeHead: string;
    readonly requestedHead: string;
  }) => Promise<
    | { readonly status: "rewritten" | "adopted" }
    | { readonly status: "refused"; readonly reason?: string }
  >;
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
        | "selected-change-authority-required"
        | "lifecycle-contribution"
        | "pending-review-fix-verification"
        | "reservation-refused"
        | "state-conflict"
        | "precondition-mismatch"
        | "rewrite-refused"
        | "ambiguous-result";
      readonly paths?: readonly string[];
      readonly detail?: string;
    }
> {
  if (input.contributionMode === "selected-change"
    && input.operationMode !== "selected-change"
    && input.supersedePendingReviewFixVerification === undefined) {
    return { status: "refused", reason: "selected-change-authority-required" };
  }
  const member = input.current.value.members.find((candidate) => candidate.deliverableId === input.deliverableId);
  const requestedMember = input.requested.members[0];
  if (canonicalize(input.requested.target) !== canonicalize(input.current.value.target)
    || member?.ref === null || member?.coordinates === null || requestedMember === undefined
    || requestedMember.deliverableId !== member?.deliverableId || requestedMember.ref !== member.ref
    || requestedMember.changeRequest?.providerId !== member.changeRequest?.providerId
    || requestedMember.changeRequest?.changeRequestId !== member.changeRequest?.changeRequestId
    || requestedMember.coordinates === null) return { status: "refused", reason: "position-mismatch" };
  const lifecycle = await input.revalidateLifecycle();
  if (lifecycle.status !== "ok") {
    return {
      status: "refused",
      reason: "lifecycle-contribution",
      ...(lifecycle.paths === undefined ? {} : { paths: lifecycle.paths }),
      ...(lifecycle.reason === undefined ? {} : { detail: `Lifecycle revalidation refused: ${lifecycle.reason}.` }),
    };
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
    ...(input.supersedePendingReviewFixVerification === undefined
      ? {}
      : {
          supersedePendingReviewFixVerification: input.supersedePendingReviewFixVerification,
          reviewFixSelectedDeliverableId:
            input.supersedePendingReviewFixVerification.selectedDeliverableId,
          reviewFixVerificationDeliverableIds:
            input.supersedePendingReviewFixVerification.memberDeliverableIds,
        }
    ),
  });
  if (reserved.status !== "reserved") {
    return {
      status: "refused",
      reason: reserved.reason === "pending-review-fix-verification"
        ? reserved.reason
        : "reservation-refused",
    };
  }
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
  if (rewritten.status === "refused") {
    return {
      status: "refused",
      reason: "rewrite-refused",
      ...(rewritten.reason === undefined ? {} : { detail: `Ref rewrite refused: ${rewritten.reason}.` }),
    };
  }
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
  readonly selectedDeliverableId?: string;
  readonly terminalAuthoringMovement?: DeliveryTerminalAuthoringMovementV1;
  readonly conflictResolution?: DeliveryProviderConflictResolutionInput;
} & ProviderAdoptionExecutionDependencies): Promise<
  | DeliveryProviderSettlementAppliedResult
  | DeliveryContributionRefusal
  | DeliveryProviderConflictResolutionRequired
  | ProviderAdoptionBlockedResult
  | {
      readonly status: "refused";
      readonly reason:
        | "position-mismatch"
        | "selected-member-invalid"
        | "selected-member-moved"
        | "operation-active"
        | "ambiguous-result"
        | "reservation-refused"
        | "state-conflict"
        | "observation-unavailable"
        | "ambiguous-provider-movement"
        | "target-rewritten"
        | "conflict-resolution-mismatch"
        | "top-ref-invalid"
        | "top-not-checked-out"
        | "top-moved"
        | "coordinate-invalid"
        | "worktree-dirty"
        | "absorption-unavailable";
    }
> {
  if (input.current.value.activeOperation !== null) {
    return { status: "refused", reason: "operation-active" };
  }
  if (input.conflictResolution !== undefined && (
    input.selectedDeliverableId === undefined
    || input.conflictResolution.planId !== input.plan.planId
    || input.conflictResolution.scope.selectedDeliverableId !== input.selectedDeliverableId
    || input.conflictResolution.expectedStateRevision !== input.current.revision
  )) {
    return { status: "refused", reason: "conflict-resolution-mismatch" };
  }
  if (!isPlannedNonterminalSuffix(input.plan, input.affectedDeliverableIds)
    || validateDeliveryStateAgainstPlan(input.current.value, input.plan).status === "refused") {
    return { status: "refused", reason: "position-mismatch" };
  }
  const selectedIndex = input.selectedDeliverableId === undefined
    ? -1
    : input.affectedDeliverableIds.indexOf(input.selectedDeliverableId);
  const pendingSelectedDeliverableId = findExactPendingSelectedRefresh(input.current.value);
  if (input.selectedDeliverableId !== undefined && (
    selectedIndex < 0
    || pendingSelectedDeliverableId !== input.selectedDeliverableId
  )) {
    return { status: "refused", reason: "selected-member-invalid" };
  }
  if (input.selectedDeliverableId === undefined && pendingSelectedDeliverableId !== null) {
    return { status: "refused", reason: "selected-member-invalid" };
  }
  if (input.terminalAuthoringMovement !== undefined && selectedIndex < 0) {
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
  const allMovements = changedDeliveryProviderRefreshMovements(before, observed);
  if (selectedIndex >= 0 && before.members.slice(0, selectedIndex + 1).some((member, index) => {
    const observedCoordinates = observed.snapshot.members[index]?.coordinates;
    return member.coordinates === null || observedCoordinates === null || observedCoordinates === undefined
      || member.coordinates.head !== observedCoordinates.head
      || member.coordinates.tree !== observedCoordinates.tree;
  })) {
    return { status: "refused", reason: "selected-member-moved" };
  }
  const movements = allMovements === null
    ? null
    : input.selectedDeliverableId === undefined
      ? allMovements
      : selectDeliveryProviderRefreshProofMovements(
          observed.snapshot,
          allMovements,
          input.selectedDeliverableId,
        );
  if (movements === null || (movements.length === 0
    && !deliveryTerminalAbsorptionOwed(input.current.value, observed.snapshot))) {
    return { status: "refused", reason: "ambiguous-result" };
  }
  if (input.selectedDeliverableId !== undefined) {
    const assessment = await collectDeliveryProviderRefreshConflicts(movements, input.proveContribution);
    if (assessment.status === "refused") return assessment;
    if (assessment.conflicts.length > 0) {
      const resolutionInput: DeliveryProviderConflictResolutionInput = {
        planId: input.plan.planId,
        scope: { kind: "dependent-suffix", selectedDeliverableId: input.selectedDeliverableId },
        expectedStateRevision: input.current.revision,
        observedSuffixDigest: canonicalDigest(observed.snapshot),
        conflicts: assessment.conflicts,
      };
      if (input.conflictResolution !== undefined) {
        if (canonicalize(input.conflictResolution) !== canonicalize(resolutionInput)) {
          return { status: "refused", reason: "conflict-resolution-mismatch" };
        }
      } else {
        const externalRefRestorations = movements.flatMap((movement) => (
          movement.before.ref === null || movement.before.coordinates === null || movement.after.coordinates === null
            ? []
            : [{
                ref: movement.before.ref,
                observedHead: movement.after.coordinates.head,
                restoreHead: movement.before.coordinates.head,
              }]
        ));
        return {
          status: "conflict-resolution-required",
          conflicts: assessment.conflicts,
          resolutionInput,
          externalRefRestorations,
          recommendedActionText: "Obtain explicit approval for the listed resolved conflicts and resubmit the exact resolution input unchanged, or restore every listed external ref by exact lease.",
        };
      }
    } else if (input.conflictResolution !== undefined) {
      return { status: "refused", reason: "conflict-resolution-mismatch" };
    }
  } else {
    const refusal = await proveDeliveryProviderRefreshMovements(movements, input.proveContribution);
    if (refusal !== null) return refusal;
  }
  if (deliveryTerminalAbsorptionOwed(input.current.value, observed.snapshot)) {
    const terminal = input.current.value.members.at(-1);
    const terminalCoordinates = input.terminalAuthoringMovement?.after ?? terminal?.coordinates;
    if (terminal?.ref === null || terminal?.ref === undefined || terminalCoordinates === null
      || terminalCoordinates === undefined) {
      return { status: "refused", reason: "position-mismatch" };
    }
    const preflight = await input.preflightTop({
      topRef: terminal.ref,
      top: { head: terminalCoordinates.head, tree: terminalCoordinates.tree },
    });
    if (preflight.status === "refused") return preflight;
  }
  const reserved = reserveDeliveryOperation(input.current, input.plan, {
    operationId: crypto.randomUUID(),
    kind: "rewrite",
    mode: "provider-adoption",
    affectedDeliverableIds: input.affectedDeliverableIds,
    expectedStateRevision: input.current.revision,
    before,
    requested: observed.snapshot,
    ...(input.terminalAuthoringMovement === undefined
      ? {}
      : { terminalAuthoringMovement: input.terminalAuthoringMovement }),
    ...(input.selectedDeliverableId === undefined
      ? {}
      : {
          reviewFixSelectedDeliverableId: input.selectedDeliverableId,
          reviewFixVerificationDeliverableIds: [
            input.selectedDeliverableId,
            ...(input.conflictResolution?.conflicts.map(({ deliverableId }) => deliverableId) ?? []),
          ],
        }),
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
    readTargetAncestry: input.readTargetAncestry,
    proveContribution: input.proveContribution,
    absorbTop: input.absorbTop,
    publishTop: input.publishTop,
    rewriteLocalRef: input.rewriteLocalRef,
    stateStore: input.stateStore,
  });
}
