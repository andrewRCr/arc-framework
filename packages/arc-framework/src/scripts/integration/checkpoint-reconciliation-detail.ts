/** Render the deciding reconciliation rule supplied by the shared planner. */

import type { CheckpointReconciliationRule } from "./checkpoint.js";

const DETAILS: Record<CheckpointReconciliationRule, string> = {
  "ambiguous-merge-base": "Reconciliation rule: ambiguous merge base requires an ordinary base reconcile.",
  "regenerable-conflict": "Reconciliation rule: regenerable-conflict requires the determinate regenerable base reconcile.",
  "base-currentness-required": "Reconciliation rule: host base-currentness-required policy requires an ordinary base reconcile.",
  overlapping: "Reconciliation rule: overlapping base paths require an ordinary base reconcile.",
};

/**
 * Describe the planner's selected reconciliation rule.
 *
 * @param rule - The deciding rule from the reconciliation plan.
 * @returns The deciding rule and its required reconciliation.
 */
export function describeCheckpointReconciliation(rule: CheckpointReconciliationRule): string {
  return DETAILS[rule];
}
