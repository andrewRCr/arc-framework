/** Task-list entry preparation for delivery authoring. */

import { z } from "zod";

import {
  createDeliveryAuthoringSnapshot,
  type DeliveryAuthoringSnapshotV1,
} from "./authoring-schema.js";
import {
  renderDeliveryAuthoringMap,
  type DeliveryAuthoringSlotsV1,
} from "./authoring-map.js";
import type { DeliveryCompositionProjection } from "./compose.js";
import { bindDesignInventory } from "./design-inventory.js";
import { DeliveryPlanAuthoringInputV1Schema } from "./schema.js";
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

const DeliveryFromTasksFactsSchema = z.strictObject({
  phaseGroups: z.array(z.strictObject({
    phaseId: z.string().min(1),
    title: z.string().min(1),
    taskIds: z.array(z.string().min(1)).min(1),
  })),
  membershipEligibility: z.array(z.strictObject({
    taskId: z.string().min(1),
    eligibleForMembership: z.boolean(),
  })),
});

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

/** Resolve authored task boundaries into the entry-neutral composition projection. */
export function resolveDeliveryFromTasksProjection(_input: {
  readonly snapshot: DeliveryAuthoringSnapshotV1;
  readonly slots: DeliveryAuthoringSlotsV1;
}): {
  readonly status: "refused";
  readonly reason:
    | "from-tasks-facts-malformed"
    | "boundary-member-mismatch"
    | "verification-task-ineligible"
    | "authoring-projection-invalid";
}
  | { readonly status: "resolved"; readonly projection: DeliveryCompositionProjection } {
  const input = _input;
  if (input.snapshot.source.entry !== "from-tasks") {
    return { status: "refused", reason: "from-tasks-facts-malformed" };
  }
  const facts = DeliveryFromTasksFactsSchema.safeParse(input.snapshot.source.facts);
  if (!facts.success || !eligibilityMatchesSnapshot(input.snapshot, facts.data)) {
    return { status: "refused", reason: "from-tasks-facts-malformed" };
  }
  const segments = input.slots.boundary.kind === "phase-aligned"
    ? facts.data.phaseGroups.map((phase, index) => ({
      chunkKey: input.slots.members[index]?.chunkKey ?? "",
      sourceIds: phase.taskIds,
    }))
    : input.slots.boundary.segments;
  if (segments.some((segment) => (
    segment.sourceIds.includes(input.snapshot.tasks.verificationTaskId)
  ))) {
    return { status: "refused", reason: "verification-task-ineligible" };
  }
  if (segments.length !== input.slots.members.length
    || segments.some((segment, index) => segment.chunkKey !== input.slots.members[index]?.chunkKey)) {
    return { status: "refused", reason: "boundary-member-mismatch" };
  }

  const authoring = DeliveryPlanAuthoringInputV1Schema.safeParse({
    schemaVersion: 1,
    semanticsVersion: "delivery-plan/v1",
    workUnitId: input.snapshot.originalWorkUnitId,
    design: {
      artifacts: input.snapshot.design.artifacts.map(({ artifactId }) => ({ artifactId })),
      elements: input.snapshot.design.elements.map(({ elementId }) => ({ elementId })),
    },
    tasks: {
      implementation: input.snapshot.tasks.implementation.map(({ taskId }) => ({ taskId })),
      verificationTaskId: input.snapshot.tasks.verificationTaskId,
    },
    entry: "from-tasks",
    projection: input.slots.projection,
    members: input.slots.members.map((member, index) => ({
      ...member,
      taskIds: segments[index]?.sourceIds ?? [],
    })),
    seams: input.slots.seams,
  });
  if (!authoring.success) {
    return { status: "refused", reason: "authoring-projection-invalid" };
  }
  return {
    status: "resolved",
    projection: {
      authoring: authoring.data,
      boundary: input.slots.boundary,
      contributionStepIds: input.snapshot.tasks.implementation.map((task) => task.taskId),
      memberContributionSteps: segments.map((segment) => ({
        chunkKey: segment.chunkKey,
        contributionStepIds: segment.sourceIds,
      })),
    },
  };
}

function eligibilityMatchesSnapshot(
  snapshot: DeliveryAuthoringSnapshotV1,
  facts: z.infer<typeof DeliveryFromTasksFactsSchema>,
): boolean {
  return JSON.stringify(facts.membershipEligibility) === JSON.stringify([
    ...snapshot.tasks.implementation.map((task) => ({
      taskId: task.taskId,
      eligibleForMembership: true,
    })),
    { taskId: snapshot.tasks.verificationTaskId, eligibleForMembership: false },
  ]);
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
