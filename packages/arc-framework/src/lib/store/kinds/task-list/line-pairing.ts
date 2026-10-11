/** Identifier-based pairing of task-list scanner items across stored and proposed versions. */
import { scanTaskListStructure, type TaskListStructureEvent } from "../../../task-list/scanner.js";
/** One parent or subtask, retaining the scanner's physical line and marker. */
export type TaskLine = Extract<TaskListStructureEvent, { type: "parent" | "subtask" }>;
/** One next task line and its file-order identifier counterpart, when present. */
export interface TaskLinePair { readonly next: TaskLine; readonly prior?: TaskLine }
/** Paired next lines and unpaired prior lines with explicit scan availability. */
export interface TaskLinePairing {
  readonly priorReadable: boolean;
  readonly nextReadable: boolean;
  readonly pairs: readonly TaskLinePair[];
  readonly removed: readonly TaskLine[];
}
/** Pair task lines by identifier, including repeated identifiers in file order.
 * @param priorContent - Stored bytes; absent on creation.
 * @param nextContent - Proposed bytes; absent on removal.
 * @returns Ordered pairs and unmatched prior lines; an invalid scan supplies no lines.
 */
export function pairTaskLines(priorContent: string | undefined, nextContent: string | undefined): TaskLinePairing {
  const prior = scannedLines(priorContent), next = scannedLines(nextContent);
  const queues = new Map<string, TaskLine[]>();
  for (const line of prior.lines) {
    const queue = queues.get(line.item.id) ?? [];
    queue.push(line);
    queues.set(line.item.id, queue);
  }
  const paired = new Set<TaskLine>();
  const pairs = next.lines.map((line): TaskLinePair => {
    const counterpart = queues.get(line.item.id)?.shift();
    if (counterpart !== undefined) paired.add(counterpart);
    return { next: line, ...(counterpart === undefined ? {} : { prior: counterpart }) };
  });
  return { priorReadable: prior.readable, nextReadable: next.readable, pairs,
    removed: prior.lines.filter((line) => !paired.has(line)) };
}

function scannedLines(content: string | undefined): { readonly readable: boolean; readonly lines: readonly TaskLine[] } {
  if (content === undefined) return { readable: true, lines: [] };
  const scan = scanTaskListStructure(content);
  return scan.status === "malformed" ? { readable: false, lines: [] }
    : { readable: true, lines: scan.events.filter((event): event is TaskLine => event.type === "parent" || event.type === "subtask") };
}
