/** Semantic task-inventory extraction from structurally scanned task lists. */

import { canonicalDigest, type CanonicalDigest } from "../kernel/index.js";
import { scanTaskDescriptorExtents } from "../markdown/descriptor-spacing.js";
import { scanTaskListStructure, type TaskStructureItem } from "../task-list/scanner.js";

/** One implementation parent and the normalized intent its semantic digest covers. */
export interface TaskGoalInventoryEntry {
  readonly taskId: string;
  readonly goal: string;
  readonly semanticDigest: CanonicalDigest;
}

/** One normalized implementation task bound into a delivery plan. */
export interface DeliveryTaskInventoryEntry {
  readonly taskId: string;
  readonly semanticDigest: CanonicalDigest;
}

/** Task inventory bound to the final phase's sole verification parent. */
export interface DeliveryTaskInventory {
  readonly inventoryDigest: CanonicalDigest;
  readonly implementation: readonly DeliveryTaskInventoryEntry[];
  readonly verificationTaskId: string;
}

/** Deterministic task-inventory construction result. */
export type DeliveryTaskInventoryResult =
  | { readonly status: "ok"; readonly inventory: DeliveryTaskInventory }
  | {
    readonly status: "refused";
    readonly reason:
      | "task-list-malformed"
      | "verification-phase-missing"
      | "verification-task-ambiguous";
  };

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

/**
 * Build the implementation inventory and locate its verification parent.
 *
 * @param content - Raw task-list Markdown
 * @returns The bound inventory or a structural refusal
 */
export function buildDeliveryTaskInventory(content: string): DeliveryTaskInventoryResult {
  const scan = scanTaskListStructure(content);
  if (scan.status === "malformed") {
    return { status: "refused", reason: "task-list-malformed" };
  }

  const phases = scan.events.filter((event) => event.type === "phase");
  const finalPhase = phases.at(-1);
  if (finalPhase === undefined || finalPhase.title !== "Verification") {
    return { status: "refused", reason: "verification-phase-missing" };
  }

  const verificationParents: TaskStructureItem[] = [];
  for (const event of scan.events) {
    if (event.type === "parent" && event.line > finalPhase.line) {
      verificationParents.push(event.item);
    }
  }
  if (verificationParents.length !== 1) {
    return { status: "refused", reason: "verification-task-ambiguous" };
  }
  const verificationTask = verificationParents[0];
  if (verificationTask === undefined) {
    return { status: "refused", reason: "verification-task-ambiguous" };
  }

  const implementation = extractTaskGoalInventory(content)
    .filter((entry) => entry.taskId !== verificationTask.id)
    .map(({ taskId, semanticDigest }) => ({ taskId, semanticDigest }));
  return {
    status: "ok",
    inventory: {
      inventoryDigest: canonicalDigest(implementation),
      implementation,
      verificationTaskId: verificationTask.id,
    },
  };
}
