/** All task-list authority, integrity, and shape rules over paired versions. */
import { checkTaskListClose, checkTaskListDeliveryPlan } from "./authority-rules.js";
import { checkTaskListCompletedIdentifier, checkTaskListCompletedGoal } from "./integrity-rules.js";
import { checkTaskListDescriptor, checkTaskListSegmentation } from "./shape-rules.js";
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";
/** Run every task-list rule without suppressing additional violations.
 * @param input - Stored and proposed task-list versions, views, and writer.
 * @returns Every broken rule, or an empty result admitting the write.
 */
export function checkTaskListRecord(input: WriteCheckInput): readonly BrokenRule[] {
  return [...checkTaskListClose(input), ...checkTaskListDeliveryPlan(input),
    ...checkTaskListCompletedIdentifier(input), ...checkTaskListCompletedGoal(input),
    ...checkTaskListDescriptor(input), ...checkTaskListSegmentation(input)];
}
