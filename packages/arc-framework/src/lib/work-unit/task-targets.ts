/** Validate task identities and prepare complete marker cascades without writing records. */
import { resolveTaskListCursor } from "../task-list/cursor.js";
import { scanTaskListStructure, type TaskMarker, type TaskListStructureEvent } from "../task-list/scanner.js";
import { writeTaskMarker } from "../store/kinds/task-list/index.js";
import type { Remedy, StoreRefusal } from "../store/refusal.js";

/** A task refusal retains the exact recovery guidance for its caller. */
export interface TaskRefusal { status: "refused"; code: string; reason: string; remedy: Remedy; refusal?: StoreRefusal }
/** Task structure retained for target and cascade decisions. */
export interface TaskItem { id: string; parent?: string; marker: TaskMarker; line: number }
/** Checked selected task identities and their future marker content. */
export interface PreparedTaskTargets { status: "prepared"; ids: string[]; content: string; tasks: TaskItem[] }

/** Select explicit tasks or the cursor leaf and prepare a valid child-before-parent cascade.
 * @param content - Exact task-list record content
 * @param requested - Explicit task IDs, or the cursor selection when empty
 * @param operation - Close or defer
 * @returns A complete immutable preparation or actionable refusal
 */
export function prepareTaskTargets(content: string, requested: readonly string[], operation: "close" | "defer"): PreparedTaskTargets | TaskRefusal {
  const scan = scanTaskListStructure(content);
  if (scan.status === "malformed") return refuseTask(`Task list line ${scan.error.line}: ${scan.error.message}`, "Repair that task-list line, then retry.");
  const tasks = taskItems(scan.events);
  const ids = selectIds(content, tasks, requested);
  if (!Array.isArray(ids)) return ids;
  const invalid = validateIds(ids, tasks, operation);
  if (invalid !== undefined) return invalid;
  const selected = new Set(ids);
  for (const child of tasks) if (child.parent !== undefined && selected.has(child.parent) && child.marker === " ") selected.add(child.id);
  const expandedInvalid = validateIds([...selected], tasks, operation);
  if (expandedInvalid !== undefined) return expandedInvalid;
  try { return { status: "prepared", ids: [...selected], content: cascadeMarkers(content, tasks, selected, operation), tasks }; }
  catch (error) { return refuseTask(error instanceof Error ? error.message : String(error), "Repair the named task-list lines, then retry."); }
}

function taskItems(events: readonly TaskListStructureEvent[]): TaskItem[] {
  let parent: string | undefined;
  const tasks: TaskItem[] = [];
  for (const event of events) {
    if (event.type === "parent") { parent = event.item.id; tasks.push({ id: parent, marker: event.marker, line: event.line }); }
    else if (event.type === "subtask") tasks.push({ id: event.item.id, marker: event.marker, line: event.line, parent });
    else if (event.type === "section" || event.type === "phase") parent = undefined;
  }
  return tasks;
}
function selectIds(content: string, tasks: TaskItem[], requested: readonly string[]): string[] | TaskRefusal {
  if (requested.length > 0) return [...new Set(requested)];
  const cursor = resolveTaskListCursor(content);
  if (cursor.status === "found") return [cursor.cursor.leaf.id];
  const deferred = tasks.find((task) => task.marker === "~");
  return refuseTask("No task is open.", deferred === undefined ? "Add a new task for the work."
    : `Close the deferred task with arc task close ${deferred.id}, or add a new task for the work.`);
}
function validateIds(ids: string[], tasks: TaskItem[], operation: "close" | "defer"): TaskRefusal | undefined {
  for (const id of ids) {
    const matches = tasks.filter((task) => task.id === id);
    if (matches.length !== 1) return refuseTask(`Task ${id} matches ${matches.length} lines: ${matches.map((task) => task.line).join(", ")}.`,
      `Use one of the task list's unique IDs: ${tasks.map((task) => task.id).join(", ")}.`);
    if (operation === "defer" && matches[0]?.marker !== " ") return refuseTask(`Task ${id} is not open.`, "A closed task stays closed; add a new task for corrective work.");
  }
  return undefined;
}
function cascadeMarkers(content: string, tasks: TaskItem[], selected: Set<string>, operation: "close" | "defer"): string {
  const working = tasks.map((task) => ({ ...task }));
  let next = content;
  for (const task of working.filter((item) => item.parent !== undefined)) {
    if (!selected.has(task.id)) continue;
    task.marker = operation === "close" ? "x" : "~";
    next = writeTaskMarker(next, task.id, task.marker);
  }
  for (const task of working.filter((item) => item.parent === undefined)) {
    const marker = parentMarker(task, working, selected, operation);
    if (marker !== undefined) next = writeTaskMarker(next, task.id, marker);
  }
  return next;
}
function parentMarker(task: TaskItem, tasks: TaskItem[], selected: Set<string>, operation: "close" | "defer"): "x" | "~" | undefined {
  const children = tasks.filter((item) => item.parent === task.id);
  const named = selected.has(task.id);
  if (!named && !children.some((child) => selected.has(child.id))) return undefined;
  if (named && operation === "close") return "x";
  if (children.length > 0 && children.every((item) => item.marker !== " ")) return children.some((item) => item.marker === "x") ? "x" : "~";
  return named ? "~" : undefined;
}

/** Build a task refusal whose remedy can be rendered or preserved by the release wrapper.
 * @param reason - Failed invariant
 * @param text - Ordered repair guidance
 * @param code - Stable refusal discriminator
 * @returns Recovery-complete refusal
 */
export function refuseTask(reason: string, text: string, code = "task-invalid"): TaskRefusal {
  return { status: "refused", code, reason, remedy: { text } };
}
