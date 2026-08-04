/** Entry-neutral composition checks shared by both delivery authoring sources. */

import {
  validateDeliveryTaskCoverage,
  type DeliveryPlanEntry,
  type DeliveryTaskCoverageIssue,
} from "./coverage.js";

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
