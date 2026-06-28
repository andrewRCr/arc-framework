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

const PARENT_TASK_RE = /^###\s+`\[(?<marker>[ x~])\]`\s+\*\*(?<body>.+?)\*\*/u;
const SUBTASK_RE =
  /^\s*-\s+`\[(?<marker>[ x~])\]`\s+(?:(?:\*\*(?<boldBody>.+?)\*\*)|(?<plainBody>.+?))\s*$/u;
const MARKED_PARENT_PREFIX_RE = /^###\s+`\[[ x~]\]`/u;
const MARKED_SUBTASK_PREFIX_RE = /^\s*-\s+`\[[ x~]\]`/u;

/**
 * Resolve the current execution cursor from a task list.
 *
 * @param content - Raw task-list markdown
 * @returns The first open task cursor, no-open-task, or a malformed marker
 */
export function resolveTaskListCursor(content: string): TaskListCursorResult {
  const tasks: ParsedTask[] = [];
  let currentTask: ParsedTask | null = null;

  const lines = content.split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;

    if (MARKED_PARENT_PREFIX_RE.test(line)) {
      const parsed = parseParentTask(line, lineNumber);
      if (parsed.status === "malformed") return parsed;
      currentTask = parsed.task;
      tasks.push(currentTask);
      continue;
    }

    if (MARKED_SUBTASK_PREFIX_RE.test(line)) {
      if (currentTask === null) {
        return malformed(lineNumber, "subtask marker appeared before any parent task");
      }
      const parsed = parseSubtask(line, lineNumber);
      if (parsed.status === "malformed") return parsed;
      currentTask.subtasks.push(parsed.subtask);
    }
  }

  const cursor = firstOpenCursor(tasks);
  return cursor === null ? { status: "no-open-task" } : { status: "found", cursor };
}

function firstOpenCursor(tasks: readonly ParsedTask[]): TaskListCursor | null {
  for (const task of tasks) {
    if (task.marker !== " ") continue;
    const openSubtask = task.subtasks.find((subtask) => subtask.marker === " ");
    return {
      section: task.item,
      leaf: openSubtask?.item ?? task.item,
    };
  }
  return null;
}

function parseParentTask(
  line: string,
  lineNumber: number,
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
  const match = /^(\S+)\s+(.+?)\s*$/u.exec(body.trim());
  if (match === null) {
    return malformed(lineNumber, "task marker must include an id and title");
  }

  return {
    status: "parsed",
    item: {
      id: match[1] as string,
      title: match[2] as string,
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
