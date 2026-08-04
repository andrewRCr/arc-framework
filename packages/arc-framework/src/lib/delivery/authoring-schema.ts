/** Canonical machine-owned snapshot paired with an editable delivery authoring map. */

import { z } from "zod";

import { SlugSchema } from "../kernel/index.js";
import { ParentTaskIdSchema } from "../task-list/scanner.js";
import {
  DeliveryArtifactBasenameSchema,
  DeliveryCanonicalDigestSchema,
  DeliveryOpaqueIdSchema,
  DeliveryPlanIdSchema,
} from "./schema.js";

const DistinctOpaqueSequenceSchema = z.array(DeliveryOpaqueIdSchema).refine(
  (values) => new Set(values).size === values.length,
  "identity sequence must contain distinct values",
);

/** Runtime authority for the bound design inventory carried during authoring. */
export const DeliveryAuthoringDesignInventorySchema = z.strictObject({
  artifacts: z.array(z.strictObject({
    artifactId: DeliveryArtifactBasenameSchema,
    revisionDigest: DeliveryCanonicalDigestSchema,
  })).min(1).max(2),
  elements: z.array(z.strictObject({
    elementId: DeliveryOpaqueIdSchema,
    semanticDigest: DeliveryCanonicalDigestSchema,
  })),
});

/** Runtime authority for the progress-insensitive parent-task inventory. */
export const DeliveryAuthoringTaskInventorySchema = z.strictObject({
  inventoryDigest: DeliveryCanonicalDigestSchema,
  implementation: z.array(z.strictObject({
    taskId: ParentTaskIdSchema,
    semanticDigest: DeliveryCanonicalDigestSchema,
  })),
  verificationTaskId: ParentTaskIdSchema,
});

/** Strict canonical snapshot owned by the CLI rather than the map author. */
export const DeliveryAuthoringSnapshotV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("delivery-authoring/v1"),
  mapId: SlugSchema,
  originalWorkUnitId: SlugSchema,
  planId: DeliveryPlanIdSchema,
  expectedCurrentPlanDigest: DeliveryCanonicalDigestSchema.nullable(),
  candidatePlanDigest: DeliveryCanonicalDigestSchema.nullable(),
  design: DeliveryAuthoringDesignInventorySchema,
  tasks: DeliveryAuthoringTaskInventorySchema,
  source: z.strictObject({
    entry: z.enum(["from-tasks", "from-branch"]),
    inputs: z.json(),
    facts: z.json(),
    identitySequence: DistinctOpaqueSequenceSchema,
  }),
  identityOrder: z.strictObject({
    designArtifactIds: DistinctOpaqueSequenceSchema,
    designElementIds: DistinctOpaqueSequenceSchema,
    taskIds: z.array(ParentTaskIdSchema).refine(
      (values) => new Set(values).size === values.length,
      "task identity sequence must contain distinct values",
    ),
    sourceIds: DistinctOpaqueSequenceSchema,
  }),
});
export type DeliveryAuthoringSnapshotV1 = z.infer<typeof DeliveryAuthoringSnapshotV1Schema>;

/** Inputs whose identity-order projection the constructor pins in the snapshot. */
export interface CreateDeliveryAuthoringSnapshotInput {
  readonly mapId: string;
  readonly originalWorkUnitId: string;
  readonly planId: string;
  readonly expectedCurrentPlanDigest: string | null;
  readonly design: unknown;
  readonly tasks: unknown;
  readonly source: {
    readonly entry: "from-tasks" | "from-branch";
    readonly inputs: unknown;
    readonly facts: unknown;
    readonly identitySequence: readonly string[];
  };
}

/** Build and validate the canonical snapshot while deriving every ordered identity projection. */
export function createDeliveryAuthoringSnapshot(
  input: CreateDeliveryAuthoringSnapshotInput,
): DeliveryAuthoringSnapshotV1 {
  const design = DeliveryAuthoringDesignInventorySchema.parse(input.design);
  const tasks = DeliveryAuthoringTaskInventorySchema.parse(input.tasks);
  return DeliveryAuthoringSnapshotV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-authoring/v1",
    mapId: input.mapId,
    originalWorkUnitId: input.originalWorkUnitId,
    planId: input.planId,
    expectedCurrentPlanDigest: input.expectedCurrentPlanDigest,
    candidatePlanDigest: null,
    design,
    tasks,
    source: input.source,
    identityOrder: {
      designArtifactIds: design.artifacts.map((artifact) => artifact.artifactId),
      designElementIds: design.elements.map((element) => element.elementId),
      taskIds: [
        ...tasks.implementation.map((task) => task.taskId),
        tasks.verificationTaskId,
      ],
      sourceIds: input.source.identitySequence,
    },
  });
}
