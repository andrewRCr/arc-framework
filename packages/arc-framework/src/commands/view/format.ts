/**
 * Static bands, headers, and task-region formatting for `arc view`.
 */

import type { ViewKind } from "./types.js";
import {
  analyzeTaskList,
  extractCurrentTaskRegion,
  type TaskListCursorMalformed,
  type TaskListTallies,
} from "../../lib/task-list/cursor.js";

export interface ViewDocumentAnchor {
  line: number;
  id: string;
}

export interface PreparedViewDocument {
  content: string;
  warnings: string[];
  anchor?: ViewDocumentAnchor;
  bypassPager: boolean;
}

/** Format the tasks-specific phase/task/overall status band. */
export function formatTaskBand(tallies: TaskListTallies, now: Date): string {
  const subtask = tallies.subtask === null
    ? ""
    : ` (subtask ${tallies.subtask.current}/${tallies.subtask.total})`;
  return `Phase ${tallies.phase.current}/${tallies.phase.total} · `
    + `Task ${tallies.taskId}${subtask} · `
    + `${tallies.overall.done}/${tallies.overall.total} overall · `
    + `rendered ${formatTime(now)}`;
}

/** Format the non-task artifact header. */
export function formatArtifactHeader(kind: ViewKind, workUnit: string | null, now: Date): string {
  return `${kind} · ${workUnit ?? "global"} · rendered ${formatTime(now)}`;
}

/** Prepare one static document for plain output or pager rendering. */
export function prepareViewDocument(input: {
  kind: ViewKind;
  workUnit: string | null;
  content: string;
  current: boolean;
  now: Date;
}): PreparedViewDocument {
  if (input.kind !== "tasks") {
    return {
      content: `${formatArtifactHeader(input.kind, input.workUnit, input.now)}\n\n${input.content}`,
      warnings: [],
      bypassPager: false,
    };
  }

  if (input.current) return prepareCurrentRegion(input.content);
  const analysis = analyzeTaskList(input.content);
  if (analysis.status === "malformed") {
    return {
      content: input.content,
      warnings: [formatMalformedWarning(analysis.error)],
      bypassPager: false,
    };
  }
  if (analysis.status === "no-open-task") {
    return {
      content: analysis.tallies === undefined
        ? input.content
        : `${formatTaskBand(analysis.tallies, input.now)}\n\n${input.content}`,
      warnings: [],
      bypassPager: false,
    };
  }

  return {
    content: `${formatTaskBand(analysis.tallies, input.now)}\n\n${input.content}`,
    warnings: [],
    anchor: {
      line: analysis.cursor.section.lineHint + 2,
      id: analysis.cursor.section.id,
    },
    bypassPager: false,
  };
}

function prepareCurrentRegion(content: string): PreparedViewDocument {
  const region = extractCurrentTaskRegion(content);
  if (region.status === "malformed") {
    return {
      content: "Current task unavailable: task list is malformed.\n",
      warnings: [formatMalformedWarning(region.error)],
      bypassPager: true,
    };
  }
  if (region.status === "no-open-task") {
    return { content: "No open task.\n", warnings: [], bypassPager: true };
  }
  return {
    content: withTrailingNewline(region.content),
    warnings: [],
    bypassPager: true,
  };
}

function formatMalformedWarning(error: TaskListCursorMalformed): string {
  return `Task list is malformed at line ${error.line}: ${error.message}.`;
}

function formatTime(now: Date): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function withTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}
