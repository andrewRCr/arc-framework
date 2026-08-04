/** Entry-neutral composition checks shared by both delivery authoring sources. */

import { assertCanonicalDigest, canonicalize, type CanonicalDigest } from "../kernel/index.js";
import {
  validateDeliveryAuthoringMap,
  type DeliveryAuthoringSlotsV1,
} from "./authoring-map.js";
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
import type { DeliveryPlanStore, DeliveryPlanStoreFailure } from "./ports.js";
import type { DeliveryPlanAuthoringInputV1, DeliveryPlanV1 } from "./schema.js";
import type { DeliveryTaskInventory } from "./task-inventory.js";
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
    memberPositions.sort((left, right) => left - right);
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
  readonly kind: "uncovered-implementation-task";
  readonly taskId: string;
  readonly adjacentMemberChunkKey: string | null;
}

/** Composition-time task coverage with an author-facing adjacent-member hint. */
export type DeliveryCompositionCoverageResult =
  | { readonly status: "valid"; readonly advisories: readonly DeliveryCompositionCoverageAdvisory[] }
  | { readonly status: "refused"; readonly issues: readonly DeliveryTaskCoverageIssue[] };

/** Revalidate entry-sensitive task coverage and enrich retrofit gaps without choosing boundaries. */
export function validateDeliveryCompositionCoverage(input: {
  readonly entry: DeliveryPlanEntry;
  readonly implementationTaskIds: readonly string[];
  readonly verificationTaskId: string;
  readonly members: readonly { readonly chunkKey: string; readonly taskIds: readonly string[] }[];
}): DeliveryCompositionCoverageResult {
  const coverage = validateDeliveryTaskCoverage({
    entry: input.entry,
    predecessorEntry: null,
    implementationTaskIds: input.implementationTaskIds,
    verificationTaskId: input.verificationTaskId,
    memberTaskIds: input.members.map((member) => member.taskIds),
  });
  if (coverage.status === "refused") return coverage;
  return {
    status: "valid",
    advisories: coverage.advisories.map((advisory) => ({
      ...advisory,
      adjacentMemberChunkKey: adjacentMemberForTask(
        advisory.taskId,
        input.implementationTaskIds,
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
  readonly contributionStepIds: readonly string[];
  readonly memberContributionSteps: readonly DeliveryContributionMember[];
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
  | "authoring-projection-invalid"
  | "coverage-refused"
  | "plan-already-exists"
  | "plan-construction-refused"
  | "ambiguous-subject"
  | "reachability-unestablished"
  | "substrate-unreachable";

/** Stateful composition outcome. */
export type DeliveryPlanComposeResult =
  | {
    readonly status: "composed";
    readonly plan: DeliveryPlanV1;
    readonly advisories: readonly DeliveryCompositionCoverageAdvisory[];
  }
  | {
    readonly status: "refused";
    readonly reason: DeliveryPlanComposeReason;
    readonly issues?: readonly DeliveryPlanIssue[] | readonly DeliveryTaskCoverageIssue[];
    readonly stepId?: string;
    readonly chunkKey?: string;
  };

/** Dependencies whose ordering is the composition transaction contract. */
export interface DeliveryPlanComposerDependencies {
  readonly authoringStore: AuthoringCompositionStorePort;
  readonly planStore: DeliveryPlanStore<DeliveryPlanV1>;
  readonly renderer: DeliveryTaskListRenderer;
  readonly transitionSource: DeliveryRenameTransitionSource;
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
    if (uniqueness.status === "no-match" && current !== null) {
      return { status: "refused", reason: "plan-already-exists" };
    }

    if (input.record.markdown === null) {
      if (input.record.snapshot.candidatePlanDigest === null || current === null
        || input.record.snapshot.candidatePlanDigest !== current.planDigest) {
        return { status: "refused", reason: "authoring-state-corrupt" };
      }
      const validation = validateDeliveryPlanRecord(current);
      if (validation.status === "refused") {
        return { status: "refused", reason: "plan-construction-refused", issues: validation.issues };
      }
      const cleanup = await this.dependencies.authoringStore.deleteSnapshot(input.record.snapshot.mapId);
      return cleanup.status === "refused"
        ? cleanup
        : { status: "composed", plan: validation.plan, advisories: [] };
    }

    const integrity = validateDeliveryAuthoringMap(input.record.markdown, input.record.snapshot);
    if (integrity.status === "refused") return integrity;
    if (!projectionMatchesSlots(
      input.projection.authoring,
      integrity.slots,
      input.record.snapshot.source.entry,
      input.currentWorkUnitId,
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
      implementationTaskIds: input.taskInventory.implementation.map((task) => task.taskId),
      verificationTaskId: input.taskInventory.verificationTaskId,
      members: input.projection.authoring.members.map((member) => ({
        chunkKey: member.chunkKey,
        taskIds: member.taskIds,
      })),
    });
    if (coverage.status === "refused") {
      return { status: "refused", reason: "coverage-refused", issues: coverage.issues };
    }

    let candidate: DeliveryPlanV1;
    if (current !== null && input.record.snapshot.candidatePlanDigest === current.planDigest) {
      candidate = current;
    } else {
      const expectedDigest = asCanonicalDigestOrNull(input.record.snapshot.expectedCurrentPlanDigest);
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
      if (input.record.snapshot.candidatePlanDigest !== null
        && input.record.snapshot.candidatePlanDigest !== candidate.planDigest) {
        return { status: "refused", reason: "authoring-state-corrupt" };
      }
      const receipt = await this.dependencies.authoringStore.recordCandidate(
        input.record.snapshot.mapId,
        input.record.snapshot,
        candidate.planDigest,
      );
      if (receipt.status === "refused") return receipt;
      const publication = await this.dependencies.planStore.publishCurrent(
        candidate.planId,
        candidate,
        expectedDigest,
      );
      if (publication.status === "refused") return publication;
    }

    const rendered = await this.dependencies.renderer.render(candidate);
    if (rendered.status === "refused") return rendered;
    const markdownCleanup = await this.dependencies.authoringStore.deleteMarkdown(
      input.record.snapshot.mapId,
    );
    if (markdownCleanup.status === "refused") return markdownCleanup;
    const snapshotCleanup = await this.dependencies.authoringStore.deleteSnapshot(
      input.record.snapshot.mapId,
    );
    if (snapshotCleanup.status === "refused") return snapshotCleanup;
    return { status: "composed", plan: candidate, advisories: coverage.advisories };
  }
}

function projectionMatchesSlots(
  authoring: DeliveryPlanAuthoringInputV1,
  slots: DeliveryAuthoringSlotsV1,
  entry: "from-tasks" | "from-branch",
  workUnitId: string,
): boolean {
  const authoredSlots = {
    projection: authoring.projection,
    members: authoring.members.map((member) => ({
      status: member.status,
      chunkKey: member.chunkKey,
      title: member.title,
      contract: member.contract,
      designElementIds: member.designElementIds,
      mainlineLandability: member.mainlineLandability,
    })),
    seams: authoring.seams,
  };
  return authoring.entry === entry && authoring.workUnitId === workUnitId
    && canonicalize(authoredSlots) === canonicalize({
      projection: slots.projection,
      members: slots.members,
      seams: slots.seams,
    });
}

function asCanonicalDigestOrNull(value: string | null): CanonicalDigest | null {
  if (value === null) return null;
  assertCanonicalDigest(value);
  return value;
}
