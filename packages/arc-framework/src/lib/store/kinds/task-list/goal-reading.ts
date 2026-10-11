/** Owned task Goal text, normalized like the delivery inventory's semantic intent. */
import { scanTaskDescriptorExtents } from "../../../markdown/descriptor-spacing.js";
import { scanTaskListStructure } from "../../../task-list/scanner.js";
import type { TaskLine } from "./line-pairing.js";

/** Read each task's own opening Goals, keyed by its physical task line.
 * @param content - Whole stored or proposed task-list content.
 * @returns Own normalized Goals, keeping repeated identifiers and task roles independent.
 */
export function readTaskGoals(content: string | undefined): ReadonlyMap<number, readonly string[]> {
  const result = new Map<number, string[]>();
  if (content === undefined) return result;
  const scan = scanTaskListStructure(content);
  if (scan.status === "malformed") return result;
  const lines = content.split(/\r?\n/u);
  for (const extent of scanTaskDescriptorExtents(content)) {
    if (extent.label !== "Goal") continue;
    const goals = result.get(extent.parent.lineHint) ?? [];
    goals.push(normalizedGoal(lines.slice(extent.startLine - 1, extent.endLine)));
    result.set(extent.parent.lineHint, goals);
  }
  const boundaries = scan.events.filter((event) => event.type !== "content");
  for (const [index, event] of boundaries.entries()) {
    if (event.type !== "subtask") continue;
    const end = boundaries[index + 1]?.line ?? lines.length + 1;
    result.set(event.line, subtaskGoals(lines, event, end));
  }
  return result;
}

function subtaskGoals(lines: readonly string[], task: TaskLine, end: number): string[] {
  const ownIndent = indentation(lines[task.line - 1] ?? "");
  const body: string[] = [];
  for (const line of lines.slice(task.line, end - 1)) {
    if (line.trim() !== "" && indentation(line) <= ownIndent) break;
    body.push(line);
  }
  const indents = body.filter((line) => line.trim() !== "").map(indentation);
  if (indents.length === 0) return [];
  const base = indents.reduce((minimum, value) => Math.min(minimum, value));
  // Dedent only this task's body into the existing root descriptor grammar.
  const projected = [`### \`[ ]\` **${task.item.id} ${task.item.title}**`, ...body.map((line) => line.slice(base))].join("\n");
  const projectedLines = projected.split("\n");
  return scanTaskDescriptorExtents(projected).filter((extent) => extent.label === "Goal")
    .map((extent) => normalizedGoal(projectedLines.slice(extent.startLine - 1, extent.endLine)));
}
function indentation(line: string): number { return /^\s*/u.exec(line)?.[0].length ?? 0; }
function normalizedGoal(lines: readonly string[]): string {
  return [lines[0]?.replace(/^- _Goal:_(?:\s|$)/u, "") ?? "", ...lines.slice(1)].join(" ").replace(/\s+/gu, " ").trim();
}
