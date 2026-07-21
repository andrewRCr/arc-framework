/** Storage-agnostic semantic contract for work-unit metadata. */

import { z } from "zod";

import {
  PrioritySchema,
  WorkClassSchema,
  WorkUnitStateSchema,
} from "../kernel/index.js";

const SemanticStringSchema = z.string()
  .min(1)
  .regex(/^(?!—$|\[(?:none|internal|TBD)\]$).+$/);

/** Resolved or deliberately unresolved work-unit weight. */
export const MetaWorkClassSchema = z.union([WorkClassSchema, z.literal("TBD")]);

/** Resolved or deliberately unresolved work-unit priority. */
export const MetaPrioritySchema = z.union([PrioritySchema, z.literal("TBD")]);

/** Semantic origin value, including the internal-origin token. */
export const MetaOriginSchema = SemanticStringSchema;

/** Complete durable semantic record independent of its Markdown projection. */
export const MetaRecordSchema = z.strictObject({
  state: WorkUnitStateSchema,
  owner: SemanticStringSchema,
  branch: SemanticStringSchema.nullable(),
  workClass: MetaWorkClassSchema,
  priority: MetaPrioritySchema,
  cohort: SemanticStringSchema.nullable(),
  dependsOn: z.array(SemanticStringSchema),
  origin: MetaOriginSchema,
  design: z.array(SemanticStringSchema),
  taskList: SemanticStringSchema.nullable(),
  currentWorkflow: SemanticStringSchema.nullable(),
  lastCompleted: SemanticStringSchema.nullable(),
  nextTask: SemanticStringSchema.nullable(),
  blockers: SemanticStringSchema.nullable(),
  nextAction: SemanticStringSchema.nullable(),
  prUrl: SemanticStringSchema.nullable(),
  completed: SemanticStringSchema.nullable(),
});

export type MetaWorkClass = z.infer<typeof MetaWorkClassSchema>;
export type MetaPriority = z.infer<typeof MetaPrioritySchema>;
export type MetaOrigin = z.infer<typeof MetaOriginSchema>;
export type MetaRecord = z.infer<typeof MetaRecordSchema>;
