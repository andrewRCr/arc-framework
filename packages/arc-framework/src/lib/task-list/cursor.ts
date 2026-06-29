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

const PARENT_TASK_RE = /^###\s+`\[(?<marker>[ x~])\]`\s+\*\*(?<body>.+?)\*\*(?:\s+.+)?\s*$/u;
const SUBTASK_RE =
  /^\s{4,}-\s+`\[(?<marker>[ x~])\]`\s+(?:(?:\*\*(?<boldBody>.+?)\*\*(?:\s+.+)?)|(?<plainBody>.+?))\s*$/u;
const TASK_HEADING_PREFIX_RE = /^###\s+`?\[[ x~]\]/u;
const MARKED_CHECKBOX_BULLET_RE = /^(?<indent>\s*)-\s+`?\[[ x~]\]`?\s*(?<body>.*?)\s*$/u;
const SECTION_HEADING_RE = /^##\s+/u;
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
  const tasks: ParsedTask[] = [];
  let currentTask: ParsedTask | null = null;

  const lines = content.split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;

    if (TASK_HEADING_PREFIX_RE.test(line)) {
      const parsed = parseParentTask(line, lineNumber);
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

function hasTaskIdLikePrefix(body: string): boolean {
  const trimmed = body.trim();
  const bold = /^\*\*(?<body>.+?)\*\*(?:\s+.+)?\s*$/u.exec(trimmed);
  return TASK_ID_PREFIX_RE.test(bold?.groups?.body ?? trimmed);
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
