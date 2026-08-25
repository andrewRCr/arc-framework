/** Entry-neutral composition checks shared by both delivery authoring sources. */

import {
  assertCanonicalDigest,
  canonicalDigest,
  canonicalize,
  type CanonicalDigest,
} from "../kernel/index.js";
import {
  classifyDeliveryPlanAmendment,
  type DeliveryPlanAmendmentRefusalReason,
} from "./amendment.js";
import {
  validateDeliveryAuthoringMap,
  type DeliveryAuthoringSlotsV1,
} from "./authoring-map.js";
import type {
  DeliveryAuthoringCandidateOutcomeV1,
  DeliveryAuthoringSnapshotV1,
} from "./authoring-schema.js";
import type {
  DeliveryAuthoringCompositionStore as AuthoringCompositionStorePort,
  DeliveryAuthoringRecord,
  DeliveryAuthoringStoreFailure,
} from "./authoring-store.js";
import {
  validateDeliveryTaskCoverage,
  type DeliveryPlanEntry,
  type DeliveryTaskCoverageIssue,
} from "./coverage.js";
import type { BoundDesignInventory } from "./design-inventory.js";
import {
  constructDeliveryPlanRevision,
  validateDeliveryPlanRecord,
  type DeliveryPlanIssue,
} from "./plan.js";
import {
  resolveExistingDeliveryPlan,
  type DeliveryRenameEvidenceAuthority,
  type DeliveryRenameTransitionSource,
} from "./plan-resolution.js";
import type {
  DeliveryPlanStore,
  DeliveryPlanStoreFailure,
  DeliveryStateStore,
  DeliveryStateStoreFailure,
} from "./ports.js";
import type {
  DeliveryPlanAuthoringInputV1,
  DeliveryPlanV1,
  DeliveryStateV1,
} from "./schema.js";
import {
  rebindDeliveryStateToPlan,
  validateDeliveryStateAgainstPlan,
  type RebindDeliveryStateFailure,
  type DeliveryStatePlanCoherenceFailure,
} from "./state.js";
import {
  isDeliveryTaskAssignable,
  type DeliveryTaskInventory,
  type DeliveryTaskRole,
} from "./task-inventory.js";
import type {
  DeliveryTaskListRenderer,
  DeliveryTaskListRenderResult,
} from "./task-list-render.js";

/** One authored member's contribution-step partition. */
export interface DeliveryContributionMember {
  readonly chunkKey: string;
  readonly contributionStepIds: readonly string[];
}

/** Result of the exactly-once, contiguous contribution partition check. */
export type DeliveryContributionPartitionResult =
  | { readonly status: "valid" }
  | {
    readonly status: "refused";
    readonly reason:
      | "contribution-step-inventory-duplicate"
      | "contribution-step-covered-more-than-once"
      | "contribution-step-uncovered"
      | "contribution-step-unknown";
    readonly stepId: string;
  }
  | {
    readonly status: "refused";
    readonly reason: "member-contribution-noncontiguous" | "member-contribution-order-mismatch";
    readonly chunkKey: string;
  };

/** Validate that authored members form an ordered partition of contribution alone. */
export function validateDeliveryContributionPartition(input: {
  readonly contributionStepIds: readonly string[];
  readonly members: readonly DeliveryContributionMember[];
}): DeliveryContributionPartitionResult {
  const positions = new Map<string, number>();
  for (const [index, stepId] of input.contributionStepIds.entries()) {
    if (positions.has(stepId)) {
      return { status: "refused", reason: "contribution-step-inventory-duplicate", stepId };
    }
    positions.set(stepId, index);
  }

  const coverage = new Map<string, number>();
  let previousMemberLast = -1;
  for (const member of input.members) {
    const memberPositions: number[] = [];
    for (const stepId of member.contributionStepIds) {
      const position = positions.get(stepId);
      if (position === undefined) {
        return { status: "refused", reason: "contribution-step-unknown", stepId };
      }
      const count = (coverage.get(stepId) ?? 0) + 1;
      coverage.set(stepId, count);
      if (count > 1) {
        return { status: "refused", reason: "contribution-step-covered-more-than-once", stepId };
      }
      memberPositions.push(position);
    }
    if (memberPositions.some((position, index) => (
      index > 0 && position <= (memberPositions[index - 1] ?? position)
    ))) {
      return { status: "refused", reason: "member-contribution-order-mismatch", chunkKey: member.chunkKey };
    }
    if (memberPositions.some((position, index) => (
      index > 0 && position !== (memberPositions[index - 1] ?? position) + 1
    ))) {
      return { status: "refused", reason: "member-contribution-noncontiguous", chunkKey: member.chunkKey };
    }
    const first = memberPositions[0];
    const last = memberPositions.at(-1);
    if (first !== undefined && first <= previousMemberLast) {
      return { status: "refused", reason: "member-contribution-order-mismatch", chunkKey: member.chunkKey };
    }
    if (last !== undefined) previousMemberLast = last;
  }
  for (const stepId of input.contributionStepIds) {
    if (!coverage.has(stepId)) {
      return { status: "refused", reason: "contribution-step-uncovered", stepId };
    }
  }
  return { status: "valid" };
}

/** One retrofit gap with the nearest represented member in inventory order. */
export interface DeliveryCompositionCoverageAdvisory {
  readonly kind: "uncovered-assignable-task";
  readonly taskId: string;
  readonly adjacentMemberChunkKey: string | null;
}

/** One historical attribution that no longer resolves into the current task inventory. */
export interface DeliveryUnresolvedTaskReferenceAdvisory {
  readonly kind: "unresolved-task-reference";
  readonly commit: string;
  readonly taskId: string;
}

/** One historical attribution whose task-reference syntax cannot be interpreted. */
export interface DeliveryMalformedTaskReferenceAdvisory {
  readonly kind: "malformed-task-reference";
  readonly commit: string;
  readonly reference: string;
}

/** Advisory facts carried by entry derivation or task-coverage validation. */
export type DeliveryCompositionAdvisory =
  | DeliveryCompositionCoverageAdvisory
  | DeliveryUnresolvedTaskReferenceAdvisory
  | DeliveryMalformedTaskReferenceAdvisory;

/** Composition-time task coverage with an author-facing adjacent-member hint. */
export type DeliveryCompositionCoverageResult =
  | { readonly status: "valid"; readonly advisories: readonly DeliveryCompositionCoverageAdvisory[] }
  | { readonly status: "refused"; readonly issues: readonly DeliveryTaskCoverageIssue[] };

/** Revalidate entry-sensitive task coverage and enrich retrofit gaps without choosing boundaries. */
export function validateDeliveryCompositionCoverage(input: {
  readonly entry: DeliveryPlanEntry;
  readonly tasks: readonly { readonly taskId: string; readonly role: DeliveryTaskRole }[];
  readonly members: readonly { readonly chunkKey: string; readonly taskIds: readonly string[] }[];
}): DeliveryCompositionCoverageResult {
  const assignableTaskIds = input.tasks
    .filter(isDeliveryTaskAssignable)
    .map((task) => task.taskId);
  const coverage = validateDeliveryTaskCoverage({
    entry: input.entry,
    predecessorEntry: null,
    tasks: input.tasks,
    memberTaskIds: input.members.map((member) => member.taskIds),
  });
  if (coverage.status === "refused") return coverage;
  return {
    status: "valid",
    advisories: coverage.advisories.map((advisory) => ({
      ...advisory,
      adjacentMemberChunkKey: adjacentMemberForTask(
        advisory.taskId,
        assignableTaskIds,
        input.members,
      ),
    })),
  };
}

function adjacentMemberForTask(
  taskId: string,
  taskIds: readonly string[],
  members: readonly { readonly chunkKey: string; readonly taskIds: readonly string[] }[],
): string | null {
  const target = taskIds.indexOf(taskId);
  if (target === -1) return null;
  for (let distance = 1; distance < taskIds.length; distance += 1) {
    for (const index of [target - distance, target + distance]) {
      const adjacentTaskId = taskIds[index];
      if (adjacentTaskId === undefined) continue;
      const member = members.find((candidate) => candidate.taskIds.includes(adjacentTaskId));
      if (member !== undefined) return member.chunkKey;
    }
  }
  return null;
}

/** Entry-produced record material and its authoring-time contribution partition. */
export interface DeliveryCompositionProjection {
  readonly authoring: DeliveryPlanAuthoringInputV1;
  readonly boundary: DeliveryAuthoringSlotsV1["boundary"];
  readonly contributionStepIds: readonly string[];
  readonly memberContributionSteps: readonly DeliveryContributionMember[];
  readonly sourceAdvisories?: readonly (
    DeliveryUnresolvedTaskReferenceAdvisory | DeliveryMalformedTaskReferenceAdvisory
  )[];
}

/** Authoring mutations required by the stateful composition sequence. */
export type DeliveryCompositionAuthoringStore = AuthoringCompositionStorePort;

type MapIntegrityReason = Extract<
  ReturnType<typeof validateDeliveryAuthoringMap>,
  { readonly status: "refused" }
>["reason"];
type PartitionReason = Extract<
  DeliveryContributionPartitionResult,
  { readonly status: "refused" }
>["reason"];
type RendererReason = Extract<
  DeliveryTaskListRenderResult,
  { readonly status: "refused" }
>["reason"];

/** Closed top-level reason vocabulary for one compose attempt. */
export type DeliveryPlanComposeReason =
  | MapIntegrityReason
  | PartitionReason
  | RendererReason
  | DeliveryAuthoringStoreFailure
  | DeliveryPlanStoreFailure
  | DeliveryStateStoreFailure
  | DeliveryPlanAmendmentRefusalReason
  | DeliveryStatePlanCoherenceFailure
  | RebindDeliveryStateFailure
  | "authoring-projection-invalid"
  | "coverage-refused"
  | "landed-facts-required"
  | "plan-already-exists"
  | "plan-construction-refused"
  | "operation-active"
  | "ambiguous-subject"
  | "reachability-unestablished"
  | "substrate-unreachable";

/** Stateful composition outcome. */
export type DeliveryPlanComposeResult =
  | {
    readonly status: "composed";
    readonly plan: DeliveryPlanV1;
    readonly advisories: readonly DeliveryCompositionAdvisory[];
  }
  | {
    readonly status: "refused";
    readonly reason: DeliveryPlanComposeReason;
    readonly issues?: readonly DeliveryPlanIssue[] | readonly DeliveryTaskCoverageIssue[];
    readonly stepId?: string;
    readonly chunkKey?: string;
  }
  | {
    readonly status: "replacement-required";
    readonly affectedDeliverableIds: readonly CanonicalDigest[];
  };

/** Dependencies whose ordering is the composition transaction contract. */
export interface DeliveryPlanComposerDependencies {
  readonly authoringStore: AuthoringCompositionStorePort;
  readonly planStore: DeliveryPlanStore<DeliveryPlanV1>;
  readonly stateStore: DeliveryStateStore<DeliveryStateV1>;
  readonly renderer: DeliveryTaskListRenderer;
  readonly transitionSource: DeliveryRenameTransitionSource;
}

interface DeliveryCandidateReceipt {
  readonly candidatePlanDigest: CanonicalDigest;
  readonly candidateProjectionDigest: CanonicalDigest;
  readonly candidateOutcome: DeliveryAuthoringCandidateOutcomeV1;
}

/** Validate, publish, render, and clean one authored map in a retry-safe order. */
export class DeliveryPlanComposer {
  constructor(private readonly dependencies: DeliveryPlanComposerDependencies) {}

  async compose(input: {
    readonly record: DeliveryAuthoringRecord;
    readonly currentWorkUnitId: string;
    readonly authority: DeliveryRenameEvidenceAuthority;
    readonly projection: DeliveryCompositionProjection;
    readonly taskInventory: DeliveryTaskInventory;
    readonly designInventory: BoundDesignInventory;
    readonly landedDeliverableIds: readonly CanonicalDigest[] | null;
  }): Promise<DeliveryPlanComposeResult> {
    const uniqueness = await resolveExistingDeliveryPlan({
      planStore: this.dependencies.planStore,
      currentWorkUnitId: input.currentWorkUnitId,
      planWorkUnitId: (plan) => plan.workUnitId,
      authority: input.authority,
      transitionSource: this.dependencies.transitionSource,
    });
    if (uniqueness.status === "indeterminate") {
      return { status: "refused", reason: uniqueness.reason };
    }
    if (uniqueness.status === "match"
      && uniqueness.plan.planId !== input.record.snapshot.planId) {
      return { status: "refused", reason: "plan-already-exists" };
    }

    const currentResult = await this.dependencies.planStore.readCurrent(input.record.snapshot.planId);
    if (currentResult.status === "refused") return currentResult;
    const current = currentResult.value;
    const stateResult = await this.dependencies.stateStore.read(input.record.snapshot.planId);
    if (stateResult.status === "refused") return stateResult;
    const currentState = stateResult.value;
    if (current === null && currentState !== null) {
      return { status: "refused", reason: "authoring-state-corrupt" };
    }
    if (uniqueness.status === "no-match" && current !== null) {
      return { status: "refused", reason: "plan-already-exists" };
    }

    if (input.record.markdown === null) {
      return { status: "refused", reason: "authoring-state-corrupt" };
    }

    const integrity = validateDeliveryAuthoringMap(input.record.markdown, input.record.snapshot);
    if (integrity.status === "refused") return integrity;
    if (!projectionMatchesSlots(
      input.projection,
      integrity.slots,
      input.record.snapshot.source.entry,
      input.record.snapshot.originalWorkUnitId,
    )) {
      return { status: "refused", reason: "authoring-projection-invalid" };
    }
    const partition = validateDeliveryContributionPartition({
      contributionStepIds: input.projection.contributionStepIds,
      members: input.projection.memberContributionSteps,
    });
    if (partition.status === "refused") return partition;
    const coverage = validateDeliveryCompositionCoverage({
      entry: input.projection.authoring.entry,
      tasks: input.taskInventory.parents,
      members: input.projection.authoring.members.map((member) => ({
        chunkKey: member.chunkKey,
        taskIds: member.taskIds,
      })),
    });
    if (coverage.status === "refused") {
      return { status: "refused", reason: "coverage-refused", issues: coverage.issues };
    }
    const candidateProjectionDigest = canonicalDigest(input.projection.authoring);
    const receipt = readCandidateReceipt(input.record.snapshot);
    if (receipt === "corrupt") {
      return { status: "refused", reason: "authoring-state-corrupt" };
    }

    let candidate: DeliveryPlanV1;
    const expectedDigest = asCanonicalDigestOrNull(input.record.snapshot.expectedCurrentPlanDigest);
    if (receipt !== null && current !== null && receipt.candidatePlanDigest === current.planDigest) {
      if (receipt.candidateProjectionDigest !== candidateProjectionDigest) {
        return { status: "refused", reason: "authoring-state-corrupt" };
      }
      candidate = current;
    } else {
      if ((current?.planDigest ?? null) !== expectedDigest) {
        return { status: "refused", reason: "version-conflict" };
      }
      const construction = constructDeliveryPlanRevision({
        authoring: input.projection.authoring,
        taskInventory: input.taskInventory,
        designInventory: input.designInventory,
        predecessor: current,
        mintPlanId: () => input.record.snapshot.planId,
      });
      if (construction.status === "refused") {
        return { status: "refused", reason: "plan-construction-refused", issues: construction.issues };
      }
      candidate = construction.plan;
      if (receipt !== null && receipt.candidatePlanDigest !== candidate.planDigest) {
        return { status: "refused", reason: "authoring-state-corrupt" };
      }
      if (receipt !== null && receipt.candidateProjectionDigest !== candidateProjectionDigest) {
        return { status: "refused", reason: "authoring-state-corrupt" };
      }
    }

    const advisories = [...(input.projection.sourceAdvisories ?? []), ...coverage.advisories];
    if (receipt !== null) {
      return this.completeCandidate({
        record: input.record,
        candidate,
        receipt,
        advisories,
      });
    }

    let candidateOutcome: DeliveryAuthoringCandidateOutcomeV1 = {
      outcome: "accepted",
      stateBinding: null,
    };
    if (current !== null && currentState !== null) {
        if (input.landedDeliverableIds === null) {
          return { status: "refused", reason: "landed-facts-required" };
        }
        const coherence = validateDeliveryStateAgainstPlan(currentState.value, current);
        if (coherence.status === "refused") {
          return { status: "refused", reason: coherence.reason };
        }
        if (coherence.state.activeOperation !== null) {
          return { status: "refused", reason: "operation-active" };
        }
        const amendment = classifyDeliveryPlanAmendment({
          current,
          proposed: candidate,
          boundDeliverableIds: coherence.state.members
            .filter((member) => (
              member.ref !== null || member.changeRequest !== null || member.coordinates !== null
            ))
            .map((member) => asCanonicalDigest(member.deliverableId)),
          landedDeliverableIds: input.landedDeliverableIds,
        });
        if (amendment.status !== "accepted") return amendment;
        candidateOutcome = {
          outcome: "accepted",
          stateBinding: {
            stateRevision: currentState.revision,
            oldBoundPlanDigest: asCanonicalDigest(current.planDigest),
          },
        };
    }

    const recorded = await this.dependencies.authoringStore.recordCandidate(
      input.record.snapshot.mapId,
      input.record.snapshot,
      candidate.planDigest,
      candidateProjectionDigest,
      candidateOutcome,
    );
    if (recorded.status === "refused") return recorded;
    return this.completeCandidate({
      record: { ...input.record, snapshot: recorded.value },
      candidate,
      receipt: {
        candidatePlanDigest: asCanonicalDigest(candidate.planDigest),
        candidateProjectionDigest,
        candidateOutcome,
      },
      advisories,
    });
  }

  /** Resume a receipt-pinned candidate after Markdown cleanup has already started. */
  async recover(input: {
    readonly record: DeliveryAuthoringRecord;
    readonly currentWorkUnitId: string;
    readonly authority: DeliveryRenameEvidenceAuthority;
    readonly sourceAdvisories: readonly DeliveryCompositionAdvisory[];
  }): Promise<DeliveryPlanComposeResult> {
    if (input.record.markdown !== null) {
      return { status: "refused", reason: "authoring-state-corrupt" };
    }
    const uniqueness = await resolveExistingDeliveryPlan({
      planStore: this.dependencies.planStore,
      currentWorkUnitId: input.currentWorkUnitId,
      planWorkUnitId: (plan) => plan.workUnitId,
      authority: input.authority,
      transitionSource: this.dependencies.transitionSource,
    });
    if (uniqueness.status === "indeterminate") {
      return { status: "refused", reason: uniqueness.reason };
    }
    if (uniqueness.status === "match"
      && uniqueness.plan.planId !== input.record.snapshot.planId) {
      return { status: "refused", reason: "plan-already-exists" };
    }
    const currentResult = await this.dependencies.planStore.readCurrent(input.record.snapshot.planId);
    if (currentResult.status === "refused") return currentResult;
    const receipt = readCandidateReceipt(input.record.snapshot);
    if (receipt === null || receipt === "corrupt" || currentResult.value === null
      || currentResult.value.planDigest !== receipt.candidatePlanDigest) {
      return { status: "refused", reason: "authoring-state-corrupt" };
    }
    const validation = validateDeliveryPlanRecord(currentResult.value);
    if (validation.status === "refused"
      || validation.plan.entry !== input.record.snapshot.source.entry
      || validation.plan.workUnitId !== input.record.snapshot.originalWorkUnitId) {
      return { status: "refused", reason: "authoring-state-corrupt" };
    }
    const coverage = validateDeliveryCompositionCoverage({
      entry: validation.plan.entry,
      tasks: validation.plan.tasks.parents,
      members: validation.plan.members.map((member) => ({
        chunkKey: member.chunkKey,
        taskIds: member.taskIds,
      })),
    });
    if (coverage.status === "refused") {
      return { status: "refused", reason: "authoring-state-corrupt" };
    }
    return this.completeCandidate({
      record: input.record,
      candidate: validation.plan,
      receipt,
      advisories: [...input.sourceAdvisories, ...coverage.advisories],
    });
  }

  private async completeCandidate(input: {
    readonly record: DeliveryAuthoringRecord;
    readonly candidate: DeliveryPlanV1;
    readonly receipt: DeliveryCandidateReceipt;
    readonly advisories: readonly DeliveryCompositionAdvisory[];
  }): Promise<DeliveryPlanComposeResult> {
    const expectedDigest = asCanonicalDigestOrNull(input.record.snapshot.expectedCurrentPlanDigest);
    const stateBinding = input.receipt.candidateOutcome.stateBinding;
    if (stateBinding !== null && stateBinding.oldBoundPlanDigest !== expectedDigest) {
      return { status: "refused", reason: "authoring-state-corrupt" };
    }
    const publication = await this.dependencies.planStore.publishCurrent(
      input.candidate.planId,
      input.candidate,
      stateBinding === null ? expectedDigest : asCanonicalDigest(stateBinding.oldBoundPlanDigest),
    );
    if (publication.status === "refused") return publication;

    const stateResult = await this.dependencies.stateStore.read(input.candidate.planId);
    if (stateResult.status === "refused") return stateResult;
    if (stateBinding === null) {
      if (stateResult.value !== null) return { status: "refused", reason: "version-conflict" };
    } else {
      const currentState = stateResult.value;
      if (currentState === null) return { status: "refused", reason: "version-conflict" };
      if (currentState.revision === stateBinding.stateRevision
        && currentState.value.boundPlan.planDigest === stateBinding.oldBoundPlanDigest) {
        const rebound = rebindDeliveryStateToPlan(currentState.value, input.candidate);
        if (rebound.status === "refused") return rebound;
        const published = await this.dependencies.stateStore.publish(
          input.candidate.planId,
          rebound.state,
          stateBinding.stateRevision,
        );
        if (published.status === "refused") return published;
        if (published.value.revision !== stateBinding.stateRevision + 1
          || canonicalize(published.value.value) !== canonicalize(rebound.state)) {
          return { status: "refused", reason: "version-conflict" };
        }
      } else if (currentState.revision === stateBinding.stateRevision + 1
        && currentState.value.boundPlan.planDigest === input.candidate.planDigest) {
        const rebound = rebindDeliveryStateToPlan(currentState.value, input.candidate);
        if (rebound.status === "refused") return rebound;
        if (canonicalize(rebound.state) !== canonicalize(currentState.value)) {
          return { status: "refused", reason: "version-conflict" };
        }
      } else {
        return { status: "refused", reason: "version-conflict" };
      }
    }

    const rendered = await this.dependencies.renderer.render(input.candidate);
    if (rendered.status === "refused") return rendered;
    const markdownCleanup = await this.dependencies.authoringStore.deleteMarkdown(
      input.record.snapshot.mapId,
    );
    if (markdownCleanup.status === "refused") return markdownCleanup;
    const snapshotCleanup = await this.dependencies.authoringStore.deleteSnapshot(
      input.record.snapshot.mapId,
    );
    if (snapshotCleanup.status === "refused") return snapshotCleanup;
    return {
      status: "composed",
      plan: input.candidate,
      advisories: input.advisories,
    };
  }
}

function readCandidateReceipt(
  snapshot: DeliveryAuthoringSnapshotV1,
): DeliveryCandidateReceipt | null | "corrupt" {
  const { candidatePlanDigest, candidateProjectionDigest, candidateOutcome } = snapshot;
  if (candidatePlanDigest === null
    && candidateProjectionDigest === null
    && candidateOutcome === null) {
    return null;
  }
  if (candidatePlanDigest === null
    || candidateProjectionDigest === null
    || candidateOutcome === null) {
    return "corrupt";
  }
  return {
    candidatePlanDigest: asCanonicalDigest(candidatePlanDigest),
    candidateProjectionDigest: asCanonicalDigest(candidateProjectionDigest),
    candidateOutcome,
  };
}

function projectionMatchesSlots(
  projection: DeliveryCompositionProjection,
  slots: DeliveryAuthoringSlotsV1,
  entry: "from-tasks" | "from-branch",
  originalWorkUnitId: string,
): boolean {
  const { authoring } = projection;
  const authoredSlots = {
    projection: authoring.projection,
    boundary: projection.boundary,
    members: authoring.members.map((member) => ({
      chunkKey: member.chunkKey,
      title: member.title,
      contract: member.contract,
      designElementIds: member.designElementIds,
      mainlineLandability: member.mainlineLandability,
    })),
    seams: authoring.seams,
  };
  return authoring.entry === entry && authoring.workUnitId === originalWorkUnitId
    && canonicalize(authoredSlots) === canonicalize({
      projection: slots.projection,
      boundary: slots.boundary,
      members: slots.members,
      seams: slots.seams,
    });
}

function asCanonicalDigestOrNull(value: string | null): CanonicalDigest | null {
  if (value === null) return null;
  assertCanonicalDigest(value);
  return value;
}

function asCanonicalDigest(value: string): CanonicalDigest {
  assertCanonicalDigest(value);
  return value;
}
