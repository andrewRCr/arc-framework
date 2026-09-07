/** Semantic task-inventory extraction from structurally scanned task lists. */

import { canonicalDigest, type CanonicalDigest } from "../kernel/index.js";
import { scanTaskDescriptorExtents } from "../markdown/descriptor-spacing.js";
import { scanTaskListStructure } from "../task-list/scanner.js";

/** One parent task and the normalized intent its semantic digest covers. */
export interface TaskGoalInventoryEntry {
  readonly taskId: string;
  readonly goal: string;
  readonly semanticDigest: CanonicalDigest;
}

/** One task's role in the ordered delivery inventory. */
export type DeliveryTaskRole =
  | { readonly kind: "implementation" }
  | { readonly kind: "verification"; readonly scope: string };

/** One normalized parent task bound into a delivery plan. */
export interface DeliveryTaskInventoryEntry {
  readonly taskId: string;
  readonly semanticDigest: CanonicalDigest | null;
  readonly role: DeliveryTaskRole;
}

/** Ordered task inventory with role- and scope-typed verification parents. */
export interface DeliveryTaskInventory {
  readonly inventoryDigest: CanonicalDigest;
  readonly parents: readonly DeliveryTaskInventoryEntry[];
}

/** Return whether one task is the terminal work-unit verifier. */
export function isWorkUnitVerificationTask(
  task: Pick<DeliveryTaskInventoryEntry, "role">,
): boolean {
  return task.role.kind === "verification" && task.role.scope === "work-unit";
}

/** Return whether one task participates in delivery-member assignment. */
export function isDeliveryTaskAssignable(
  task: Pick<DeliveryTaskInventoryEntry, "role">,
): boolean {
  return !isWorkUnitVerificationTask(task);
}

/** Deterministic task-inventory construction result. */
export type DeliveryTaskInventoryResult =
  | { readonly status: "ok"; readonly inventory: DeliveryTaskInventory }
  | {
    readonly status: "refused";
    readonly reason:
      | "task-list-malformed"
      | "verification-phase-missing"
      | "work-unit-verification-task-ambiguous";
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
 * Build the ordered parent inventory and classify verification scope.
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

  const parents = scan.events.filter(
    (event): event is Extract<typeof event, { type: "parent" }> => event.type === "parent",
  );
  if (new Set(parents.map((parent) => parent.item.id)).size !== parents.length) {
    return { status: "refused", reason: "task-list-malformed" };
  }
  const verificationParents = parents.filter((parent) => parent.line > finalPhase.line);
  if (verificationParents.length !== 1) {
    return { status: "refused", reason: "work-unit-verification-task-ambiguous" };
  }
  const verificationTask = verificationParents[0];
  if (verificationTask === undefined) {
    return { status: "refused", reason: "work-unit-verification-task-ambiguous" };
  }

  const goalInventory = extractTaskGoalInventory(content);
  const implementationParents = parents.filter((parent) => parent.line < finalPhase.line);
  if (implementationParents.some((parent) => {
    const goals = goalInventory.filter((entry) => entry.taskId === parent.item.id);
    return goals.length !== 1 || goals[0]?.goal === "";
  })) {
    return { status: "refused", reason: "task-list-malformed" };
  }

  const semanticDigestByTaskId = new Map(goalInventory.map((entry) => [entry.taskId, entry.semanticDigest]));
  const lines = content.split(/\r?\n/u);
  const parentsInventory: DeliveryTaskInventoryEntry[] = parents.map((parent) => {
    if (parent === verificationTask) {
      return {
        taskId: parent.item.id,
        semanticDigest: null,
        role: { kind: "verification", scope: "work-unit" },
      };
    }
    const memberVerification = /— validate criteria at member scope\s*$/u.test(lines[parent.line - 1] ?? "");
    return {
      taskId: parent.item.id,
      semanticDigest: semanticDigestByTaskId.get(parent.item.id) ?? null,
      role: memberVerification
        ? { kind: "verification", scope: "member" }
        : { kind: "implementation" },
    };
  });
  return {
    status: "ok",
    inventory: {
      inventoryDigest: canonicalDigest(parentsInventory),
      parents: parentsInventory,
    },
  };
}
