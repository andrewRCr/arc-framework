/** Semantic task-inventory extraction from structurally scanned task lists. */

import { canonicalDigest, type CanonicalDigest } from "../kernel/index.js";
import { scanTaskDescriptorExtents } from "../markdown/descriptor-spacing.js";

/** One implementation parent and the normalized intent its semantic digest covers. */
export interface TaskGoalInventoryEntry {
  readonly taskId: string;
  readonly goal: string;
  readonly semanticDigest: CanonicalDigest;
}

/** Extract parent-task Goal text and semantic digests in task-list order. */
export function extractTaskGoalInventory(content: string): readonly TaskGoalInventoryEntry[] {
  const lines = content.split(/\r?\n/u);
  const entries: TaskGoalInventoryEntry[] = [];

  for (const extent of scanTaskDescriptorExtents(content)) {
    if (extent.label !== "Goal") continue;
    const physicalLines = lines.slice(extent.startLine - 1, extent.endLine);
    const first = /^- _Goal:_(?:\s+(?<text>.*))?$/u.exec(physicalLines[0] ?? "");
    if (first === null) continue;
    const goal = [first.groups?.text ?? "", ...physicalLines.slice(1)]
      .join(" ")
      .replace(/\s+/gu, " ")
      .trim();
    entries.push({
      taskId: extent.parent.id,
      goal,
      semanticDigest: canonicalDigest({ goal }),
    });
  }
  return entries;
}
