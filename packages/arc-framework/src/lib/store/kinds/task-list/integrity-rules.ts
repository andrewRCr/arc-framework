/** Completed task identifiers and intent survive later task-list edits. */
import { brokenRule } from "../rule-support.js";
import { readTaskGoals } from "./goal-reading.js";
import { pairTaskLines } from "./line-pairing.js";
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";
/** Retain an identifier counterpart for every previously completed task.
 * @param input - Proposed task-list write.
 * @returns Completed-identifier integrity violations.
 */
export function checkTaskListCompletedIdentifier(input: WriteCheckInput): readonly BrokenRule[] {
  const pairing = pairTaskLines(input.prior?.content, input.next?.content);
  const lost = pairing.removed.filter((line) => line.marker === "x");
  if (!pairing.nextReadable && lost.length > 0) return [brokenRule("task-list.completed-identifier",
    "The proposed task-list scanner failed; completed identifier retention cannot be established.",
    "Repair the proposed task-line grammar while preserving completed identifiers, then retry.")];
  return lost.length === 0 ? [] : [brokenRule("task-list.completed-identifier",
    `Completed tasks have no next identifier counterpart: ${lost.map(({ item }) => item.id).join(", ")}.`,
    "Restore the completed task identifiers; restructure only open tasks or amend intent forward.")];
}
/** Retain each previously completed task's own Goal.
 * @param input - Proposed task-list write.
 * @returns Completed-intent integrity violations.
 */
export function checkTaskListCompletedGoal(input: WriteCheckInput): readonly BrokenRule[] {
  const pairing = pairTaskLines(input.prior?.content, input.next?.content);
  if (!pairing.priorReadable) return [];
  const priorGoals = readTaskGoals(input.prior?.content), nextGoals = readTaskGoals(input.next?.content);
  if (!pairing.nextReadable && pairing.removed.some((line) => line.marker === "x" && (priorGoals.get(line.line)?.length ?? 0) > 0)) {
    return [brokenRule("task-list.completed-goal", "The proposed task-list scanner failed; completed Goal retention cannot be established.",
      "Repair the proposed task-line grammar while preserving completed Goals, then retry.")];
  }
  const changed = pairing.pairs.filter(({ prior, next }) => prior?.marker === "x"
    && JSON.stringify(priorGoals.get(prior.line) ?? []) !== JSON.stringify(nextGoals.get(next.line) ?? []))
    .map(({ next }) => next.item.id);
  const removed = pairing.removed.filter((line) => line.marker === "x" && (priorGoals.get(line.line)?.length ?? 0) > 0)
    .map(({ item }) => item.id);
  return changed.length + removed.length === 0 ? [] : [brokenRule("task-list.completed-goal",
    `Completed tasks change or lose their Goal: ${[...changed, ...removed].join(", ")}.`,
    "Restore the completed tasks' original Goals; amend intent forward instead of rewriting completed work.")];
}
