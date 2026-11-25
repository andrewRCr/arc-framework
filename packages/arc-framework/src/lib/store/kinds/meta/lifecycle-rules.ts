/** Metadata lifecycle consistency is judged against the resulting record placement. */
import { posix } from "node:path";
import { resolveArcPath } from "../../../layout/index.js";
import { recordReferences } from "../../identity.js";
import { resolveTaskListCursor } from "../../../task-list/cursor.js";
import { checkCurrentWorkflowConsistency } from "../../../active/current-workflow-consistency.js";
import { brokenRule, observeRecord } from "../rule-support.js";
import { metaFieldChanged, metaFieldVersions } from "./check-support.js";
import type { BrokenRule, WriteCheckInput } from "../../write-check.js";
/** Check a changed in-flight state/workflow/design tuple.
 * @param input - Proposed metadata write.
 * @returns Lifecycle consistency violations.
 */
export async function checkMetaStage(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  const versions = metaFieldVersions(input), { next } = versions;
  if (next === undefined) return [];
  const after = await observeRecord(input.after, input.reference);
  if (after.status !== "known") return [brokenRule("meta.stage",
    after.status === "unavailable" ? after.condition : "The proposed meta's placement is unavailable.",
    "Repair the record observation and retry the write against complete placement evidence.")];
  if (after.value.placement?.kind !== "active") return [];
  let entered = input.prior === undefined;
  if (!entered) {
    const before = await observeRecord(input.before, input.reference);
    if (before.status !== "known") return [brokenRule("meta.stage",
      before.status === "unavailable" ? before.condition : "The stored meta's placement is unavailable.",
      "Repair the record observation and retry the write against complete placement evidence.")];
    entered = before.value.placement?.kind !== "active";
  }
  if (!entered && !(["state", "currentWorkflow", "design"] as const).some((key) => metaFieldChanged(versions, key))) return [];
  const problems = checkCurrentWorkflowConsistency(next);
  return problems.length === 0 ? [] : [brokenRule("meta.stage", problems.join("; "),
    "Use the lifecycle verb to align State, Current Workflow, and Design, then retry.")];
}
/** Check an own completed task list when preparation fields change.
 * @param input - Proposed metadata write.
 * @returns Task-list preparation violations.
 */
export async function checkMetaPrepareTasks(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  const versions = metaFieldVersions(input), { next } = versions;
  if (next === undefined || next.currentWorkflow !== "prepare-work-unit"
    || (!metaFieldChanged(versions, "currentWorkflow") && !metaFieldChanged(versions, "taskList"))) return [];
  const after = await observeRecord(input.after, input.reference);
  if (after.status !== "known") return [brokenRule("meta.prepare-tasks",
    after.status === "unavailable" ? after.condition : "The proposed meta's placement is unavailable.",
    "Repair the record observation and retry against complete placement evidence.")];
  if (after.value.placement?.kind !== "active") return [];
  const filename = posix.basename(resolveArcPath({ kind: "work-unit-artifact", slug: input.reference.owner.name,
    artifact: "tasks", placement: { kind: "active", scope: { kind: "project" } } }));
  let problem: string | undefined;
  if (next.taskList !== filename) problem = `Task List must name ${filename}; unset task-list sentinels name no list`;
  else {
    const list = await observeRecord(input.after, recordReferences["work-item/task-list"](input.reference.owner));
    if (list.status !== "known") problem = list.status === "unavailable" ? list.condition : "The own task list is absent";
    else {
      const cursor = resolveTaskListCursor(list.value.content);
      if (cursor.status === "found") problem = `The own task list still holds open task ${cursor.cursor.leaf.id}`;
      else if (cursor.status === "malformed") problem = `Malformed task cursor at line ${cursor.error.line}: ${cursor.error.message}`;
    }
  }
  return problem === undefined ? [] : [brokenRule("meta.prepare-tasks", problem,
    "Name the own task list, complete its open tasks through the close verb, or repair its cursor, then retry preparation.")];
}
