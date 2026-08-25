/** Entry-sensitive task coverage validation for delivery plans. */

import {
  isDeliveryTaskAssignable,
  isWorkUnitVerificationTask,
  type DeliveryTaskRole,
} from "./task-inventory.js";

/** Authored delivery-plan entry point. */
export type DeliveryPlanEntry = "from-tasks" | "from-branch";

/** Inputs required to revalidate task coverage without authoring context. */
export interface DeliveryTaskCoverageInput {
  readonly entry: DeliveryPlanEntry;
  readonly predecessorEntry: DeliveryPlanEntry | null;
  readonly tasks: readonly {
    readonly taskId: string;
    readonly role: DeliveryTaskRole;
  }[];
  readonly memberTaskIds: readonly (readonly string[])[];
}

/** One non-blocking coverage observation. */
export interface DeliveryTaskCoverageAdvisory {
  readonly kind: "uncovered-assignable-task";
  readonly taskId: string;
}

/** One blocking task-coverage defect. */
export type DeliveryTaskCoverageIssue =
  | { readonly kind: "uncovered-assignable-task"; readonly taskId: string }
  | { readonly kind: "unknown-task-reference"; readonly taskId: string; readonly memberIndex: number }
  | { readonly kind: "work-unit-verification-task-assigned"; readonly memberIndex: number }
  | { readonly kind: "member-task-order"; readonly memberIndices: readonly number[] }
  | { readonly kind: "entry-changed" };

/** Result of entry-sensitive task coverage validation. */
export type DeliveryTaskCoverageResult =
  | { readonly status: "valid"; readonly advisories: readonly DeliveryTaskCoverageAdvisory[] }
  | { readonly status: "refused"; readonly issues: readonly DeliveryTaskCoverageIssue[] };

/**
 * Validate task coverage and entry provenance for a delivery plan.
 *
 * @param input - Task inventory, member assignments, and optional predecessor entry
 * @returns A valid result with advisories or typed blocking issues
 */
export function validateDeliveryTaskCoverage(
  input: DeliveryTaskCoverageInput,
): DeliveryTaskCoverageResult {
  const assignableTaskIds = input.tasks
    .filter(isDeliveryTaskAssignable)
    .map((task) => task.taskId);
  const workUnitVerificationTaskIds = new Set(input.tasks
    .filter(isWorkUnitVerificationTask)
    .map((task) => task.taskId));
  const assignedTaskIds = new Set(input.memberTaskIds.flat());
  const uncovered = assignableTaskIds.filter((taskId) => !assignedTaskIds.has(taskId));
  const issues: DeliveryTaskCoverageIssue[] = [];
  if (input.predecessorEntry !== null && input.predecessorEntry !== input.entry) {
    issues.push({ kind: "entry-changed" });
  }
  const knownTaskIds = new Set(input.tasks.map((task) => task.taskId));
  for (const [memberIndex, taskIds] of input.memberTaskIds.entries()) {
    for (const taskId of new Set(taskIds)) {
      if (!knownTaskIds.has(taskId)) {
        issues.push({ kind: "unknown-task-reference", taskId, memberIndex });
      }
    }
    if (taskIds.some((taskId) => workUnitVerificationTaskIds.has(taskId))) {
      issues.push({ kind: "work-unit-verification-task-assigned", memberIndex });
    }
  }
  const memberTaskOrder = findMemberTaskOrderIssue(input);
  if (memberTaskOrder !== null) issues.push(memberTaskOrder);
  if (input.entry === "from-tasks") {
    issues.push(...uncovered.map((taskId) => ({
      kind: "uncovered-assignable-task" as const,
      taskId,
    })));
  }
  if (issues.length > 0) {
    return {
      status: "refused",
      issues,
    };
  }
  return {
    status: "valid",
    advisories: uncovered.map((taskId) => ({ kind: "uncovered-assignable-task", taskId })),
  };
}

function findMemberTaskOrderIssue(
  input: DeliveryTaskCoverageInput,
): Extract<DeliveryTaskCoverageIssue, { readonly kind: "member-task-order" }> | null {
  const assignableTaskIds = input.tasks
    .filter(isDeliveryTaskAssignable)
    .map((task) => task.taskId);
  const positionByTaskId = new Map(
    assignableTaskIds.map((taskId, position) => [taskId, position]),
  );
  const positionsByMember = input.memberTaskIds.map((taskIds) => [...new Set(taskIds)]
    .flatMap((taskId) => {
      const position = positionByTaskId.get(taskId);
      return position === undefined ? [] : [position];
    })
    .sort((left, right) => left - right));
  const offendingMemberIndices = new Set<number>();

  for (const [memberIndex, taskIds] of input.memberTaskIds.entries()) {
    if (taskIds.length === 0) offendingMemberIndices.add(memberIndex);
  }

  for (const [memberIndex, positions] of positionsByMember.entries()) {
    for (let index = 1; index < positions.length; index += 1) {
      const previous = positions[index - 1];
      const current = positions[index];
      if (previous !== undefined && current !== undefined && current !== previous + 1) {
        offendingMemberIndices.add(memberIndex);
      }
    }
  }

  for (let leftIndex = 0; leftIndex < positionsByMember.length; leftIndex += 1) {
    const leftLast = positionsByMember[leftIndex]?.at(-1);
    if (leftLast === undefined) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < positionsByMember.length; rightIndex += 1) {
      const rightFirst = positionsByMember[rightIndex]?.[0];
      if (rightFirst !== undefined && leftLast > rightFirst) {
        offendingMemberIndices.add(leftIndex);
        offendingMemberIndices.add(rightIndex);
      }
    }
  }

  const memberTaskSets = input.memberTaskIds.map((taskIds) => new Set(taskIds));
  for (const taskId of assignableTaskIds) {
    const owners = memberTaskSets.flatMap((taskIds, memberIndex) => taskIds.has(taskId) ? [memberIndex] : []);
    const firstOwner = owners[0];
    const lastOwner = owners.at(-1);
    if (firstOwner !== undefined && lastOwner !== undefined && lastOwner - firstOwner > 1) {
      for (const memberIndex of owners) offendingMemberIndices.add(memberIndex);
    }
  }

  if (offendingMemberIndices.size === 0) return null;
  return {
    kind: "member-task-order",
    memberIndices: [...offendingMemberIndices].sort((left, right) => left - right),
  };
}
