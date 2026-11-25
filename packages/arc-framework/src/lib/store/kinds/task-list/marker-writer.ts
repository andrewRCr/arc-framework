/** Exact marker edits over structurally scanned task lines. */

import { scanTaskListStructure } from "../../../task-list/scanner.js";

/** Complete or defer one uniquely identified task without changing other content.
 * @param content - Whole task-list Markdown.
 * @param taskId - Exact identifier among scanned parent and subtask lines.
 * @param marker - Completed or deferred marker.
 * @returns Content with only the selected task marker changed.
 */
export function writeTaskMarker(content: string, taskId: string, marker: "x" | "~"): string {
  const scan = scanTaskListStructure(content);
  if (scan.status === "malformed") throw new Error(`Malformed task list: ${scan.error.message}`);
  const matches = scan.events.filter((event) => (event.type === "parent" || event.type === "subtask")
    && event.item.id === taskId);
  const target = matches[0];
  if (matches.length !== 1 || target === undefined) {
    throw new Error(`Task ${taskId} matched ${matches.length} task lines; expected exactly one.`);
  }
  const lines = content.split("\n");
  const line = lines[target.line - 1];
  if (line === undefined) throw new Error("Scanned task line is unavailable.");
  lines[target.line - 1] = line.replace(/`\[[ x~]\]`/u, `\`[${marker}]\``);
  const next = lines.join("\n");
  const nextScan = scanTaskListStructure(next);
  if (nextScan.status === "malformed") throw new Error(`Malformed task list after marker write: ${nextScan.error.message}`);
  return next;
}
