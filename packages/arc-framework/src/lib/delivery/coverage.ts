/** Entry-sensitive task coverage validation for delivery plans. */

/** Authored delivery-plan entry point. */
export type DeliveryPlanEntry = "from-tasks" | "from-branch";

/** Inputs required to revalidate task coverage without authoring context. */
export interface DeliveryTaskCoverageInput {
  readonly entry: DeliveryPlanEntry;
  readonly predecessorEntry: DeliveryPlanEntry | null;
  readonly implementationTaskIds: readonly string[];
  readonly verificationTaskId: string;
  readonly memberTaskIds: readonly (readonly string[])[];
}

/** One non-blocking coverage observation. */
export interface DeliveryTaskCoverageAdvisory {
  readonly kind: "uncovered-implementation-task";
  readonly taskId: string;
}

/** One blocking task-coverage defect. */
export type DeliveryTaskCoverageIssue =
  | { readonly kind: "uncovered-implementation-task"; readonly taskId: string }
  | { readonly kind: "verification-task-assigned"; readonly memberIndex: number }
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
  const assignedTaskIds = new Set(input.memberTaskIds.flat());
  const uncovered = input.implementationTaskIds.filter((taskId) => !assignedTaskIds.has(taskId));
  const issues: DeliveryTaskCoverageIssue[] = [];
  if (input.predecessorEntry !== null && input.predecessorEntry !== input.entry) {
    issues.push({ kind: "entry-changed" });
  }
  for (const [memberIndex, taskIds] of input.memberTaskIds.entries()) {
    if (taskIds.includes(input.verificationTaskId)) {
      issues.push({ kind: "verification-task-assigned", memberIndex });
    }
  }
  if (input.entry === "from-tasks") {
    issues.push(...uncovered.map((taskId) => ({
      kind: "uncovered-implementation-task" as const,
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
    advisories: uncovered.map((taskId) => ({ kind: "uncovered-implementation-task", taskId })),
  };
}
