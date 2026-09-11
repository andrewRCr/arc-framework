/**
 * Line-oriented structural scanner for ARC task lists.
 *
 * @module
 */

import { z } from "zod";

/** Runtime authority for canonical parent-task identities. */
export const ParentTaskIdSchema = z.string()
  .regex(/^\d+(?:\.[0-9A-Za-z]+)+$/u)
  .refine((value) => !/^\d+\.\d+\.\d+(?:\.|$)/u.test(value), {
    error: "Numeric third task-id segments are not executable parent ids",
  });

/** Supported task checkbox markers. */
export type TaskMarker = " " | "x" | "~";

/** Canonical task identity parsed from a task marker. */
export interface TaskStructureItem {
  id: string;
  title: string;
  lineHint: number;
}

/** Stable structural events emitted for task-list consumers. */
export type TaskListStructureEvent =
  | { type: "phase"; line: number; id: string; title: string }
  | { type: "parent"; line: number; marker: TaskMarker; item: TaskStructureItem }
  | { type: "subtask"; line: number; marker: TaskMarker; item: TaskStructureItem }
  | { type: "section"; line: number }
  | { type: "fence"; line: number }
  | { type: "content"; line: number; text: string };

/** Scanner failure for a task-shaped marker outside the canonical grammar. */
export interface TaskListStructureError {
  line: number;
  message: string;
}

/** Complete structural scan result. */
export type TaskListStructureResult =
  | { status: "scanned"; events: TaskListStructureEvent[] }
  | { status: "malformed"; error: TaskListStructureError };

const PARENT_TASK_RE = /^###\s+`\[(?<marker>[ x~])\]`\s+\*\*(?<body>.+?)\*\*(?:\s+.+)?\s*$/u;
const SUBTASK_RE =
  /^\s{4,}-\s+`\[(?<marker>[ x~])\]`\s+(?:(?:\*\*(?<boldBody>.+?)\*\*(?:\s+.+)?)|(?<plainBody>.+?))\s*$/u;
const TASK_HEADING_PREFIX_RE = /^#{1,6}\s+`?\[[ x~]\]/u;
const MARKED_CHECKBOX_BULLET_RE = /^(?<indent>\s*)-\s+`?\[[ x~]\]`?\s*(?<body>.*?)\s*$/u;
const SECTION_HEADING_RE = /^##\s+/u;
const PARENT_BOUNDARY_HEADING_RE = /^#{1,3}\s+/u;
const DELIVERY_PLAN_HEADING_RE = /^##\s+Delivery Plan\s*$/u;
const PHASE_HEADING_RE = /^##\s+\*\*Phase\s+(?<id>[^:]+):\*\*\s+(?<title>.+?)\s*$/u;
const TASK_BODY_RE = /^(?<id>\S+)\s+(?<title>.+?)\s*$/u;
const TASK_ID_PREFIX_RE = /^\d+(?:\.[0-9A-Za-z]+)+(?:\s+|$)/u;
const FENCE_RE = /^ {0,3}(?<run>`{3,}|~{3,})(?<rest>.*)$/u;

interface OpenFence {
  marker: "`" | "~";
  length: number;
}

/**
 * Scan task-list Markdown into validated structural events.
 *
 * @param content - Raw task-list Markdown
 * @returns Structural events or the first malformed task marker
 */
export function scanTaskListStructure(content: string): TaskListStructureResult {
  const events: TaskListStructureEvent[] = [];
  let currentParent: Extract<TaskListStructureEvent, { type: "parent" }> | null = null;
  let openFence: OpenFence | null = null;
  let inDeliveryPlan = false;

  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    const lineNumber = index + 1;

    if (inDeliveryPlan) {
      if (openFence !== null) {
        if (isClosingFence(line, openFence)) openFence = null;
        continue;
      }
      const deliveryFence = parseOpeningFence(line);
      if (deliveryFence !== null) {
        openFence = deliveryFence;
        continue;
      }
      if (!SECTION_HEADING_RE.test(line)) continue;
      inDeliveryPlan = false;
    }

    if (openFence !== null) {
      if (isClosingFence(line, openFence)) openFence = null;
      continue;
    }

    const openingFence = parseOpeningFence(line);
    if (openingFence !== null) {
      openFence = openingFence;
      events.push({ type: "fence", line: lineNumber });
      continue;
    }

    if (DELIVERY_PLAN_HEADING_RE.test(line)) {
      events.push({ type: "section", line: lineNumber });
      currentParent = null;
      inDeliveryPlan = true;
      continue;
    }

    const phase = PHASE_HEADING_RE.exec(line);
    if (phase?.groups?.id !== undefined && phase.groups.title !== undefined) {
      events.push({
        type: "phase",
        line: lineNumber,
        id: phase.groups.id.trim(),
        title: phase.groups.title.trim(),
      });
      currentParent = null;
      continue;
    }

    if (TASK_HEADING_PREFIX_RE.test(line)) {
      const parsed = parseParentTask(line, lineNumber);
      if (parsed.status === "malformed") return parsed;
      events.push(parsed.event);
      currentParent = parsed.event;
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
        if (currentParent !== null) {
          return malformed(
            lineNumber,
            `anonymous checkbox at line ${lineNumber} appears inside parent task ${currentParent.item.id} at line ${currentParent.line}`,
          );
        }
        events.push({ type: "content", line: lineNumber, text: line });
        continue;
      }
      if (currentParent === null) {
        return malformed(lineNumber, "subtask marker appeared before any parent task");
      }
      const parsed = parseSubtask(line, lineNumber);
      if (parsed.status === "malformed") return parsed;
      if (currentParent.marker === "x" && parsed.event.marker === " ") {
        return malformed(
          lineNumber,
          `open subtask ${parsed.event.item.id} at line ${lineNumber} appears beneath completed parent ${currentParent.item.id} at line ${currentParent.line}`,
        );
      }
      events.push(parsed.event);
      continue;
    }

    if (PARENT_BOUNDARY_HEADING_RE.test(line)) {
      events.push(SECTION_HEADING_RE.test(line)
        ? { type: "section", line: lineNumber }
        : { type: "content", line: lineNumber, text: line });
      currentParent = null;
      continue;
    }

    events.push({ type: "content", line: lineNumber, text: line });
  }

  return { status: "scanned", events };
}

function parseOpeningFence(line: string): OpenFence | null {
  const match = FENCE_RE.exec(line);
  const run = match?.groups?.run;
  const rest = match?.groups?.rest ?? "";
  if (run === undefined || (run.startsWith("`") && rest.includes("`"))) return null;
  return { marker: run[0] as "`" | "~", length: run.length };
}

function isClosingFence(line: string, fence: OpenFence): boolean {
  const match = FENCE_RE.exec(line);
  const run = match?.groups?.run;
  const rest = match?.groups?.rest ?? "";
  return run !== undefined
    && run[0] === fence.marker
    && run.length >= fence.length
    && rest.trim() === "";
}

function parseParentTask(
  line: string,
  lineNumber: number,
): { status: "parsed"; event: Extract<TaskListStructureEvent, { type: "parent" }> }
  | { status: "malformed"; error: TaskListStructureError } {
  const match = PARENT_TASK_RE.exec(line);
  if (match === null || match.groups === undefined) {
    return malformed(lineNumber, "parent task marker does not match task-list heading grammar");
  }

  const item = parseTaskBody(match.groups.body ?? "", lineNumber);
  if (item.status === "malformed") return item;
  return {
    status: "parsed",
    event: { type: "parent", line: lineNumber, marker: markerFromMatch(match.groups.marker), item: item.item },
  };
}

function parseSubtask(
  line: string,
  lineNumber: number,
): { status: "parsed"; event: Extract<TaskListStructureEvent, { type: "subtask" }> }
  | { status: "malformed"; error: TaskListStructureError } {
  const match = SUBTASK_RE.exec(line);
  if (match === null || match.groups === undefined) {
    return malformed(lineNumber, "subtask marker does not match task-list bullet grammar");
  }

  const item = parseTaskBody(match.groups.boldBody ?? match.groups.plainBody ?? "", lineNumber);
  if (item.status === "malformed") return item;
  return {
    status: "parsed",
    event: { type: "subtask", line: lineNumber, marker: markerFromMatch(match.groups.marker), item: item.item },
  };
}

function parseTaskBody(
  body: string,
  lineNumber: number,
): { status: "parsed"; item: TaskStructureItem }
  | { status: "malformed"; error: TaskListStructureError } {
  const match = TASK_BODY_RE.exec(body.trim());
  const id = match?.groups?.id;
  const title = match?.groups?.title;
  const parsedId = ParentTaskIdSchema.safeParse(id);
  if (!parsedId.success || title === undefined) {
    return malformed(lineNumber, "task marker must include a valid id and title");
  }
  return { status: "parsed", item: { id: parsedId.data, title, lineHint: lineNumber } };
}

function hasTaskIdLikePrefix(body: string): boolean {
  const trimmed = body.trim();
  const bold = /^\*\*(?<body>.+?)\*\*(?:\s+.+)?\s*$/u.exec(trimmed);
  return TASK_ID_PREFIX_RE.test(bold?.groups?.body ?? trimmed);
}

function markerFromMatch(value: string | undefined): TaskMarker {
  return value === "x" || value === "~" ? value : " ";
}

function malformed(
  line: number,
  message: string,
): { status: "malformed"; error: TaskListStructureError } {
  return { status: "malformed", error: { line, message } };
}
