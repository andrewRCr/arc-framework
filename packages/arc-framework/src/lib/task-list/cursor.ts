/**
 * Task-list cursor projection.
 *
 * Reads ARC task-list markdown and derives the durable execution cursor used
 * for strategic partial reads: the parent task section plus the first open
 * executable checkbox in that section.
 *
 * @module
 */

type TaskMarker = " " | "x" | "~";

interface ParsedTask {
  item: TaskCursorItem;
  marker: TaskMarker;
  subtasks: ParsedSubtask[];
  phaseIndex: number | null;
}

interface ParsedSubtask {
  item: TaskCursorItem;
  marker: TaskMarker;
}

/** A task-list cursor anchor with a 1-based line hint. */
export interface TaskCursorItem {
  /** Task identifier, e.g. `4.2.a` or `4.R.1`. */
  id: string;
  /** Task title without the identifier. */
  title: string;
  /** 1-based line number in the task-list markdown. */
  lineHint: number;
}

/** Durable cursor derived from task-list checkboxes. */
export interface TaskListCursor {
  /** Parent task section to read for `partial-strategic` context. */
  section: TaskCursorItem;
  /** First incomplete executable checkbox in that section. */
  leaf: TaskCursorItem;
}

/** Failure details when task-list markdown looks like a task marker but is invalid. */
export interface TaskListCursorMalformed {
  /** 1-based line number containing the malformed marker. */
  line: number;
  /** Human-readable parse failure detail. */
  message: string;
}

/** Result of resolving the current task-list cursor. */
export type TaskListCursorResult =
  | { status: "found"; cursor: TaskListCursor }
  | { status: "no-open-task" }
  | { status: "malformed"; error: TaskListCursorMalformed };

/** Phase/task/overall counts derived alongside the durable cursor. */
export interface TaskListTallies {
  phase: { current: number; total: number };
  taskId: string;
  subtask: { current: number; total: number } | null;
  overall: { done: number; total: number };
}

/** Cursor plus the phase-aware counts used by `arc view tasks`. */
export type TaskListAnalysisResult =
  | { status: "found"; cursor: TaskListCursor; tallies: TaskListTallies }
  | { status: "no-open-task"; tallies?: TaskListTallies }
  | { status: "malformed"; error: TaskListCursorMalformed };

/** Current parent-task block extraction result. */
export type CurrentTaskRegionResult =
  | { status: "found"; content: string }
  | { status: "no-open-task" }
  | { status: "malformed"; error: TaskListCursorMalformed };

const PARENT_TASK_RE = /^###\s+`\[(?<marker>[ x~])\]`\s+\*\*(?<body>.+?)\*\*(?:\s+.+)?\s*$/u;
const SUBTASK_RE =
  /^\s{4,}-\s+`\[(?<marker>[ x~])\]`\s+(?:(?:\*\*(?<boldBody>.+?)\*\*(?:\s+.+)?)|(?<plainBody>.+?))\s*$/u;
const TASK_HEADING_PREFIX_RE = /^#{1,6}\s+`?\[[ x~]\]/u;
const MARKED_CHECKBOX_BULLET_RE = /^(?<indent>\s*)-\s+`?\[[ x~]\]`?\s*(?<body>.*?)\s*$/u;
const SECTION_HEADING_RE = /^##\s+/u;
const PHASE_HEADING_RE = /^##\s+\*\*Phase\s+[^:]+:\*\*/u;
const TASK_SECTION_BOUNDARY_RE = /^#{2,3}\s+/u;
const TASK_BODY_RE = /^(?<id>\d+(?:\.[0-9A-Za-z]+)+)\s+(?<title>.+?)\s*$/u;
const TASK_ID_PREFIX_RE = /^\d+(?:\.[0-9A-Za-z]+)+(?:\s+|$)/u;
const NUMERIC_THIRD_SEGMENT_RE = /^\d+\.\d+\.\d+(?:\.|$)/u;

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
  const tasks: ParsedTask[] = [];
  let currentTask: ParsedTask | null = null;
  let phaseCount = 0;
  let currentPhaseIndex: number | null = null;

  const lines = content.split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;

    if (PHASE_HEADING_RE.test(line)) {
      phaseCount += 1;
      currentPhaseIndex = phaseCount;
      currentTask = null;
      continue;
    }

    if (TASK_HEADING_PREFIX_RE.test(line)) {
      const parsed = parseParentTask(line, lineNumber, currentPhaseIndex);
      if (parsed.status === "malformed") return parsed;
      currentTask = parsed.task;
      tasks.push(currentTask);
      continue;
    }

    const checkboxBullet = MARKED_CHECKBOX_BULLET_RE.exec(line);
    if (checkboxBullet !== null && checkboxBullet.groups !== undefined) {
      const indent = checkboxBullet.groups.indent ?? "";
      const body = checkboxBullet.groups.body ?? "";
      if (body.trim() === "") {
        return malformed(lineNumber, "task marker must include a valid id and title");
      }
      if (indent.length < 4) {
        if (hasTaskIdLikePrefix(body)) {
          return malformed(lineNumber, indent.length === 0
            ? "task checkbox marker appeared at root level"
            : "subtask marker does not match task-list bullet grammar");
        }
        continue;
      }
      if (currentTask === null) {
        return malformed(lineNumber, "subtask marker appeared before any parent task");
      }
      const parsed = parseSubtask(line, lineNumber);
      if (parsed.status === "malformed") return parsed;
      currentTask.subtasks.push(parsed.subtask);
      continue;
    }

    if (SECTION_HEADING_RE.test(line)) {
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
  return {
    status: "found",
    cursor: open.cursor,
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

/** Extract the current parent-task block using the analyzed section line hint. */
export function extractCurrentTaskRegion(content: string): CurrentTaskRegionResult {
  const analysis = analyzeTaskList(content);
  if (analysis.status === "malformed") return analysis;
  if (analysis.status === "no-open-task") return { status: "no-open-task" };
  const lines = content.split(/\r?\n/u);
  const start = analysis.cursor.section.lineHint - 1;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (TASK_SECTION_BOUNDARY_RE.test(lines[index] ?? "")) {
      end = index;
      break;
    }
  }
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

function hasTaskIdLikePrefix(body: string): boolean {
  const trimmed = body.trim();
  const bold = /^\*\*(?<body>.+?)\*\*(?:\s+.+)?\s*$/u.exec(trimmed);
  return TASK_ID_PREFIX_RE.test(bold?.groups?.body ?? trimmed);
}

function parseParentTask(
  line: string,
  lineNumber: number,
  phaseIndex: number | null,
): { status: "parsed"; task: ParsedTask } | { status: "malformed"; error: TaskListCursorMalformed } {
  const match = PARENT_TASK_RE.exec(line);
  if (match === null || match.groups === undefined) {
    return malformed(lineNumber, "parent task marker does not match task-list heading grammar");
  }

  const item = parseTaskBody(match.groups.body ?? "", lineNumber);
  if (item.status === "malformed") return item;

  return {
    status: "parsed",
    task: {
      item: item.item,
      marker: markerFromMatch(match.groups.marker),
      subtasks: [],
      phaseIndex,
    },
  };
}

function parseSubtask(
  line: string,
  lineNumber: number,
): { status: "parsed"; subtask: ParsedSubtask } | { status: "malformed"; error: TaskListCursorMalformed } {
  const match = SUBTASK_RE.exec(line);
  if (match === null || match.groups === undefined) {
    return malformed(lineNumber, "subtask marker does not match task-list bullet grammar");
  }

  const item = parseTaskBody(
    match.groups.boldBody ?? match.groups.plainBody ?? "",
    lineNumber,
  );
  if (item.status === "malformed") return item;

  return {
    status: "parsed",
    subtask: {
      item: item.item,
      marker: markerFromMatch(match.groups.marker),
    },
  };
}

function parseTaskBody(
  body: string,
  lineNumber: number,
): { status: "parsed"; item: TaskCursorItem } | { status: "malformed"; error: TaskListCursorMalformed } {
  const match = TASK_BODY_RE.exec(body.trim());
  const id = match?.groups?.id;
  const title = match?.groups?.title;
  if (
    id === undefined
    || title === undefined
    || NUMERIC_THIRD_SEGMENT_RE.test(id)
  ) {
    return malformed(lineNumber, "task marker must include a valid id and title");
  }

  return {
    status: "parsed",
    item: {
      id,
      title,
      lineHint: lineNumber,
    },
  };
}

function markerFromMatch(value: string | undefined): TaskMarker {
  return value === "x" || value === "~" ? value : " ";
}

function malformed(
  line: number,
  message: string,
): { status: "malformed"; error: TaskListCursorMalformed } {
  return { status: "malformed", error: { line, message } };
}
