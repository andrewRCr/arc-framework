/**
 * Static bands, headers, and task-region formatting for `arc view`.
 *
 * @module
 */

import type { ViewKind } from "./types.js";
import type { ViewClock } from "./clock.js";
import {
  analyzeTaskList,
  extractCurrentTaskRegion,
  type TaskListCursorMalformed,
  type TaskListTallies,
} from "../task-list/cursor.js";

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
export function formatTaskBand(tallies: TaskListTallies, now: Date, clock: ViewClock = "24h"): string {
  const subtask = tallies.subtask === null
    ? ""
    : ` (subtask ${tallies.subtask.current}/${tallies.subtask.total})`;
  return `Phase ${tallies.phase.current}/${tallies.phase.total} · `
    + `Task ${tallies.taskId}${subtask} · `
    + `${tallies.overall.done}/${tallies.overall.total} overall · `
    + `rendered ${formatTime(now, clock)}`;
}

/** Format the non-task artifact header. */
export function formatArtifactHeader(
  kind: ViewKind,
  workUnit: string | null,
  lineCount: number,
  now: Date,
  clock: ViewClock = "24h",
): string {
  const unit = lineCount === 1 ? "line" : "lines";
  return `${kind} · ${workUnit ?? "global"} · ${lineCount} ${unit} · rendered ${formatTime(now, clock)}`;
}

/** Prepare one static document for plain output or pager rendering. */
export function prepareViewDocument(input: {
  kind: ViewKind;
  workUnit: string | null;
  content: string;
  current: boolean;
  now: Date;
  clock?: ViewClock;
  warnings?: readonly string[];
}): PreparedViewDocument {
  const clock = input.clock ?? "24h";
  const warnings = [...(input.warnings ?? [])];
  if (input.kind !== "tasks") {
    return {
      content: `${formatArtifactHeader(
        input.kind,
        input.workUnit,
        countLogicalLines(input.content),
        input.now,
        clock,
      )}\n\n${input.content}`,
      warnings,
      bypassPager: false,
    };
  }

  if (input.current) return prepareCurrentRegion(input.content, warnings);
  const analysis = analyzeTaskList(input.content);
  if (analysis.status === "malformed") {
    return {
      content: input.content,
      warnings: [...warnings, formatMalformedWarning(analysis.error)],
      bypassPager: false,
    };
  }
  if (analysis.status === "no-open-task") {
    return {
      content: analysis.tallies === undefined
        ? input.content
        : `${formatTaskBand(analysis.tallies, input.now, clock)}\n\n${input.content}`,
      warnings,
      bypassPager: false,
    };
  }

  return {
    content: `${formatTaskBand(analysis.tallies, input.now, clock)}\n\n${input.content}`,
    warnings,
    anchor: {
      line: Math.max(1, (analysis.phaseHeadingLine ?? analysis.cursor.section.lineHint) - 1) + 2,
      id: analysis.cursor.section.id,
    },
    bypassPager: false,
  };
}

function prepareCurrentRegion(content: string, inheritedWarnings: readonly string[]): PreparedViewDocument {
  const region = extractCurrentTaskRegion(content);
  if (region.status === "malformed") {
    return {
      content: "Current task unavailable: task list is malformed.\n",
      warnings: [...inheritedWarnings, formatMalformedWarning(region.error)],
      bypassPager: true,
    };
  }
  if (region.status === "no-open-task") {
    return { content: "No open task.\n", warnings: [...inheritedWarnings], bypassPager: true };
  }
  return {
    content: withTrailingNewline(region.content),
    warnings: [...inheritedWarnings],
    bypassPager: true,
  };
}

function formatMalformedWarning(error: TaskListCursorMalformed): string {
  return `Task list is malformed at line ${error.line}: ${error.message}.`;
}

function formatTime(now: Date, clock: ViewClock): string {
  const minutes = String(now.getMinutes()).padStart(2, "0");
  if (clock === "24h") return `${String(now.getHours()).padStart(2, "0")}:${minutes}`;
  const hours = now.getHours();
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

function countLogicalLines(content: string): number {
  if (content === "") return 0;
  const separators = content.match(/\r\n|\r|\n/gu)?.length ?? 0;
  return separators + (/\r\n$|[\r\n]$/u.test(content) ? 0 : 1);
}

function withTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}
