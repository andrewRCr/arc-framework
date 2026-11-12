/**
 * Task-list cursor projection.
 *
 * Reads ARC task-list markdown and derives the durable execution cursor used
 * for strategic partial reads: the parent task section plus the first open
 * executable checkbox in that section.
 *
 * @module
 */
import { z } from "zod";
import {
  ParentTaskIdSchema,
  scanTaskListStructure,
  type TaskListStructureEvent,
  type TaskMarker,
} from "./scanner.js";

interface ParsedTask {
  item: TaskCursorItem;
  marker: TaskMarker;
  subtasks: ParsedSubtask[];
  phaseIndex: number | null;
  phaseHeadingLine: number | null;
}

interface ParsedSubtask {
  item: TaskCursorItem;
  marker: TaskMarker;
}

const NON_EMPTY_TEXT_SCHEMA = z.string().refine((value) => value.trim().length > 0, {
  error: "Value must contain non-whitespace text",
});
const POSITIVE_SAFE_INTEGER_SCHEMA = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const TASK_CURSOR_ITEM_SHAPE = {
  id: ParentTaskIdSchema,
  title: NON_EMPTY_TEXT_SCHEMA,
  lineHint: POSITIVE_SAFE_INTEGER_SCHEMA,
};

/** Strict runtime authority for a task-list cursor anchor. */
export const TaskCursorItemSchema = z.strictObject(TASK_CURSOR_ITEM_SHAPE);

/** Unknown-stripping persisted-reader variant for a cursor anchor. */
export const TaskCursorItemReaderSchema = z.object(TASK_CURSOR_ITEM_SHAPE);

/** A task-list cursor anchor with a 1-based line hint. */
export type TaskCursorItem = z.infer<typeof TaskCursorItemSchema>;

/** Durable cursor derived from task-list checkboxes. */
export const TaskListCursorSchema = z.strictObject({
  section: TaskCursorItemSchema,
  leaf: TaskCursorItemSchema,
});

/** Recursively unknown-stripping persisted-reader variant for a cursor. */
export const TaskListCursorReaderSchema = z.object({
  section: TaskCursorItemReaderSchema,
  leaf: TaskCursorItemReaderSchema,
});

/** Durable cursor derived from task-list checkboxes. */
export type TaskListCursor = z.infer<typeof TaskListCursorSchema>;

/** Failure details when task-list markdown looks like a task marker but is invalid. */
export const TaskListCursorMalformedSchema = z.strictObject({
  line: POSITIVE_SAFE_INTEGER_SCHEMA,
  message: NON_EMPTY_TEXT_SCHEMA,
});

/** Failure details when task-list markdown looks like a task marker but is invalid. */
export type TaskListCursorMalformed = z.infer<typeof TaskListCursorMalformedSchema>;

/** Successful cursor-result branch. */
export const TaskListCursorFoundSchema = z.strictObject({
  status: z.literal("found"),
  cursor: TaskListCursorSchema,
});

/** No-open-task cursor-result branch. */
export const TaskListCursorNoOpenTaskSchema = z.strictObject({
  status: z.literal("no-open-task"),
});

/** Malformed cursor-result branch. */
export const TaskListCursorMalformedResultSchema = z.strictObject({
  status: z.literal("malformed"),
  error: TaskListCursorMalformedSchema,
});

/** Strict runtime authority for the complete cursor result. */
export const TaskListCursorResultSchema = z.discriminatedUnion("status", [
  TaskListCursorFoundSchema,
  TaskListCursorNoOpenTaskSchema,
  TaskListCursorMalformedResultSchema,
]);

/** Result of resolving the current task-list cursor. */
export type TaskListCursorResult = z.infer<typeof TaskListCursorResultSchema>;

/** Phase/task/overall counts derived alongside the durable cursor. */
export interface TaskListTallies {
  phase: { current: number; total: number };
  taskId: string;
  subtask: { current: number; total: number } | null;
  overall: { done: number; total: number };
}

/** Cursor plus the phase-aware counts used by `arc view tasks`. */
export type TaskListAnalysisResult =
  | { status: "found"; cursor: TaskListCursor; tallies: TaskListTallies; phaseHeadingLine?: number }
  | { status: "no-open-task"; tallies?: TaskListTallies }
  | { status: "malformed"; error: TaskListCursorMalformed };

/** Result of resolving the terminal completed task. */
export type TaskListLastCompletedResult =
  | { status: "found"; item: TaskCursorItem }
  | { status: "none" }
  | { status: "malformed"; error: TaskListCursorMalformed };

/** Current parent-task block extraction result. */
export type CurrentTaskRegionResult =
  | { status: "found"; content: string }
  | { status: "no-open-task" }
  | { status: "malformed"; error: TaskListCursorMalformed };

/**
 * Resolve the current execution cursor from a task list.
 *
 * @param content - Raw task-list markdown
 * @returns The first open task cursor, no-open-task, or a malformed marker
 */
export function resolveTaskListCursor(content: string): TaskListCursorResult {
  const analysis = analyzeTaskList(content);
  if (analysis.status === "malformed") return analysis;
  if (analysis.status === "no-open-task") return { status: "no-open-task" };
  return { status: "found", cursor: analysis.cursor };
}

/** Parse task-list structure once and derive the cursor plus its display tallies. */
export function analyzeTaskList(content: string): TaskListAnalysisResult {
  const scan = scanTaskListStructure(content);
  if (scan.status === "malformed") return scan;
  return analyzeTaskListEvents(scan.events);
}

function analyzeTaskListEvents(events: readonly TaskListStructureEvent[]): TaskListAnalysisResult {
  const tasks: ParsedTask[] = [];
  let currentTask: ParsedTask | null = null;
  let phaseCount = 0;
  let currentPhaseIndex: number | null = null;
  let currentPhaseHeadingLine: number | null = null;

  for (const event of events) {
    if (event.type === "phase") {
      phaseCount += 1;
      currentPhaseIndex = phaseCount;
      currentPhaseHeadingLine = event.line;
      currentTask = null;
      continue;
    }

    if (event.type === "parent") {
      currentTask = {
        item: event.item,
        marker: event.marker,
        subtasks: [],
        phaseIndex: currentPhaseIndex,
        phaseHeadingLine: currentPhaseHeadingLine,
      };
      tasks.push(currentTask);
      continue;
    }

    if (event.type === "subtask") {
      if (currentTask === null) {
        return malformed(event.line, "subtask marker appeared before any parent task");
      }
      currentTask.subtasks.push({ item: event.item, marker: event.marker });
      continue;
    }

    if (event.type === "section") {
      currentTask = null;
    }
  }

  const total = tasks.reduce((count, task) => count + 1 + task.subtasks.length, 0);
  const done = tasks.reduce(
    (count, task) => count
      + (task.marker === "x" ? 1 : 0)
      + task.subtasks.filter((subtask) => subtask.marker === "x").length,
    0,
  );
  const implicitPhase = phaseCount === 0;
  const open = firstOpenCursor(tasks);
  if (open === null) {
    const finalTask = tasks.at(-1);
    if (finalTask === undefined) return { status: "no-open-task" };
    const phaseIndex = implicitPhase ? 1 : finalTask.phaseIndex;
    if (phaseIndex === null) {
      return malformed(finalTask.item.lineHint, "task appeared outside a phase section");
    }
    return {
      status: "no-open-task",
      tallies: {
        phase: { current: phaseIndex, total: implicitPhase ? 1 : phaseCount },
        taskId: finalTask.item.id,
        subtask: finalTask.subtasks.length === 0
          ? null
          : { current: finalTask.subtasks.length, total: finalTask.subtasks.length },
        overall: { done, total },
      },
    };
  }

  const phaseIndex = implicitPhase ? 1 : open.task.phaseIndex;
  if (phaseIndex === null) {
    return malformed(open.task.item.lineHint, "task appeared outside a phase section");
  }
  const openSubtaskIndex = open.task.subtasks.findIndex(
    (subtask) => subtask.item.id === open.cursor.leaf.id,
  );
  const firstTaskInPhase = !implicitPhase && tasks.find(
    (task) => task.phaseIndex === open.task.phaseIndex,
  ) === open.task;
  return {
    status: "found",
    cursor: open.cursor,
    ...(firstTaskInPhase && open.task.phaseHeadingLine !== null
      ? { phaseHeadingLine: open.task.phaseHeadingLine }
      : {}),
    tallies: {
      phase: { current: phaseIndex, total: implicitPhase ? 1 : phaseCount },
      taskId: open.task.item.id,
      subtask: openSubtaskIndex === -1
        ? null
        : { current: openSubtaskIndex + 1, total: open.task.subtasks.length },
      overall: { done, total },
    },
  };
}

/**
 * Resolve the terminal completed task — the last `[x]` marker in document order.
 *
 * Document order makes the answer the deepest completed leaf on its own: a completed parent's
 * subtasks follow it, so the last marker seen is a subtask wherever one exists. A `[~]` marker is
 * a deliberate deferral rather than completed work and never answers.
 *
 * @param content - Raw task-list markdown
 * @returns The final completed item, `none` when nothing is complete, or a malformed marker
 */
export function resolveLastCompletedTask(content: string): TaskListLastCompletedResult {
  const scan = scanTaskListStructure(content);
  if (scan.status === "malformed") return scan;
  let last: TaskCursorItem | null = null;
  for (const event of scan.events) {
    if ((event.type === "parent" || event.type === "subtask") && event.marker === "x") last = event.item;
  }
  return last === null ? { status: "none" } : { status: "found", item: last };
}

/** Extract the current parent-task block using the analyzed section line hint. */
export function extractCurrentTaskRegion(content: string): CurrentTaskRegionResult {
  const scan = scanTaskListStructure(content);
  if (scan.status === "malformed") return scan;
  const analysis = analyzeTaskListEvents(scan.events);
  if (analysis.status === "malformed") return analysis;
  if (analysis.status === "no-open-task") return { status: "no-open-task" };
  const lines = content.split(/\r?\n/u);
  const start = analysis.cursor.section.lineHint - 1;
  const boundary = scan.events.find((event) =>
    event.line > analysis.cursor.section.lineHint
    && (
      event.type === "phase"
      || event.type === "parent"
      || event.type === "section"
      || (event.type === "content" && /^###\s+/u.test(event.text))
    ));
  const end = boundary === undefined ? lines.length : boundary.line - 1;
  return { status: "found", content: lines.slice(start, end).join("\n") };
}

function firstOpenCursor(
  tasks: readonly ParsedTask[],
): { task: ParsedTask; cursor: TaskListCursor } | null {
  for (const task of tasks) {
    if (task.marker !== " ") continue;
    const openSubtask = task.subtasks.find((subtask) => subtask.marker === " ");
    return {
      task,
      cursor: {
        section: task.item,
        leaf: openSubtask?.item ?? task.item,
      },
    };
  }
  return null;
}

function malformed(
  line: number,
  message: string,
): { status: "malformed"; error: TaskListCursorMalformed } {
  return { status: "malformed", error: { line, message } };
}
