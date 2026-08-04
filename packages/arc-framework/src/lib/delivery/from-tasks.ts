/** Task-list entry preparation for delivery authoring. */

import {
  createDeliveryAuthoringSnapshot,
  type DeliveryAuthoringSnapshotV1,
} from "./authoring-schema.js";
import { renderDeliveryAuthoringMap } from "./authoring-map.js";
import { bindDesignInventory } from "./design-inventory.js";
import { buildDeliveryTaskInventory, type DeliveryTaskInventory } from "./task-inventory.js";
import { scanTaskListStructure } from "../task-list/scanner.js";

/** Inputs for one task-list-derived authoring map. */
export interface PrepareDeliveryFromTasksAuthoringInput {
  readonly mapId: string;
  readonly planId: string;
  readonly workUnitId: string;
  readonly expectedCurrentPlanDigest: string | null;
  readonly taskListPath: string;
  readonly taskListContent: string;
  readonly designInventory: unknown;
}

/** One authoring-only phase group derived from structural scanner events. */
export interface DeliveryTaskPhaseGroup {
  readonly phaseId: string;
  readonly title: string;
  readonly taskIds: readonly string[];
}

/** Machine facts pinned for the task-list entry. */
export interface DeliveryFromTasksFacts {
  readonly phaseGroups: readonly DeliveryTaskPhaseGroup[];
  readonly membershipEligibility: readonly {
    readonly taskId: string;
    readonly eligibleForMembership: boolean;
  }[];
}

/** Result of preparing transient task-list authoring state. */
export type PrepareDeliveryFromTasksAuthoringResult =
  | {
    readonly status: "prepared";
    readonly snapshot: DeliveryAuthoringSnapshotV1;
    readonly markdown: string;
  }
  | {
    readonly status: "refused";
    readonly reason:
      | "invalid-design-inventory"
      | "task-list-malformed"
      | "verification-phase-missing"
      | "verification-task-ambiguous"
      | "invalid-authoring-identity";
  };

/**
 * Prepare one task-list-derived authoring map without writing repository state.
 *
 * @param input - Validated identity coordinates plus untrusted design and task-list input
 * @returns A complete transient pair or a typed refusal
 */
export function prepareDeliveryFromTasksAuthoring(
  input: PrepareDeliveryFromTasksAuthoringInput,
): PrepareDeliveryFromTasksAuthoringResult {
  const design = bindDesignInventory(input.designInventory);
  if (design.status === "refused") return design;
  const tasks = buildDeliveryTaskInventory(input.taskListContent);
  if (tasks.status === "refused") return tasks;
  const facts = deriveFromTasksFacts(input.taskListContent, tasks.inventory);
  if (facts.status === "refused") return facts;

  try {
    const snapshot = createDeliveryAuthoringSnapshot({
      mapId: input.mapId,
      originalWorkUnitId: input.workUnitId,
      planId: input.planId,
      expectedCurrentPlanDigest: input.expectedCurrentPlanDigest,
      design: design.inventory,
      tasks: tasks.inventory,
      source: {
        entry: "from-tasks",
        inputs: { taskListPath: input.taskListPath },
        facts: facts.value,
        identitySequence: facts.value.phaseGroups.flatMap((phase) => [
          `phase:${phase.phaseId}`,
          ...phase.taskIds.map((taskId) => `task:${taskId}`),
        ]).concat(`task:${tasks.inventory.verificationTaskId}`),
      },
    });
    return {
      status: "prepared",
      snapshot,
      markdown: renderDeliveryAuthoringMap(snapshot),
    };
  } catch {
    return { status: "refused", reason: "invalid-authoring-identity" };
  }
}

function deriveFromTasksFacts(
  content: string,
  tasks: DeliveryTaskInventory,
): { readonly status: "ok"; readonly value: DeliveryFromTasksFacts }
  | { readonly status: "refused"; readonly reason: "task-list-malformed" } {
  const scan = scanTaskListStructure(content);
  if (scan.status === "malformed") return { status: "refused", reason: "task-list-malformed" };
  const implementation = new Set(tasks.implementation.map((task) => task.taskId));
  const groups: { phaseId: string; title: string; taskIds: string[] }[] = [];
  let current: { phaseId: string; title: string; taskIds: string[] } | null = null;
  for (const event of scan.events) {
    if (event.type === "phase") {
      current = { phaseId: event.id, title: event.title, taskIds: [] };
      groups.push(current);
      continue;
    }
    if (event.type !== "parent" || !implementation.has(event.item.id)) continue;
    if (current === null) return { status: "refused", reason: "task-list-malformed" };
    current.taskIds.push(event.item.id);
  }
  const phaseGroups = groups.filter((group) => group.taskIds.length > 0);
  if (phaseGroups.flatMap((group) => group.taskIds).length !== implementation.size
    || new Set(phaseGroups.map((group) => group.phaseId)).size !== phaseGroups.length) {
    return { status: "refused", reason: "task-list-malformed" };
  }
  return {
    status: "ok",
    value: {
      phaseGroups,
      membershipEligibility: [
        ...tasks.implementation.map((task) => ({
          taskId: task.taskId,
          eligibleForMembership: true,
        })),
        { taskId: tasks.verificationTaskId, eligibleForMembership: false },
      ],
    },
  };
}
