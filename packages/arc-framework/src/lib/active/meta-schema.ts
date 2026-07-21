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

/** Exact Markdown-label to semantic-key mapping for managed meta fields. */
export const META_FIELD_KEYS = [
  { name: "State", key: "state" },
  { name: "Owner", key: "owner" },
  { name: "Branch", key: "branch" },
  { name: "Class", key: "workClass" },
  { name: "Priority", key: "priority" },
  { name: "Cohort", key: "cohort" },
  { name: "Depends On", key: "dependsOn" },
  { name: "Origin", key: "origin" },
  { name: "Design", key: "design" },
  { name: "Task List", key: "taskList" },
  { name: "Current Workflow", key: "currentWorkflow" },
  { name: "Last Completed", key: "lastCompleted" },
  { name: "Next Task", key: "nextTask" },
  { name: "Blockers", key: "blockers" },
  { name: "Next Action", key: "nextAction" },
  { name: "PR URL", key: "prUrl" },
  { name: "Completed", key: "completed" },
] as const;

export type MetaFieldName = (typeof META_FIELD_KEYS)[number]["name"];
export type MetaSemanticKey = (typeof META_FIELD_KEYS)[number]["key"];

const ProjectionValueSchema = z.string().nullable();
type MetaProjectionShape = { [K in MetaFieldName]: typeof ProjectionValueSchema };
const metaProjectionShape = Object.fromEntries(
  META_FIELD_KEYS.map(({ name }) => [name, ProjectionValueSchema]),
) as MetaProjectionShape;

/** Complete tokenizer output keyed by the current Markdown labels. */
export const MetaProjectionRecordSchema = z.strictObject(metaProjectionShape);

const ParsedStringSchema = SemanticStringSchema.nullable();

/** Tolerant semantic adapter record recovered from a Markdown projection. */
export const ParsedMetaRecordSchema = z.strictObject({
  state: ParsedStringSchema,
  owner: ParsedStringSchema,
  branch: ParsedStringSchema,
  workClass: ParsedStringSchema,
  priority: ParsedStringSchema,
  cohort: ParsedStringSchema,
  dependsOn: z.array(SemanticStringSchema),
  origin: ParsedStringSchema,
  design: z.array(SemanticStringSchema),
  taskList: ParsedStringSchema,
  currentWorkflow: ParsedStringSchema,
  lastCompleted: ParsedStringSchema,
  nextTask: ParsedStringSchema,
  blockers: ParsedStringSchema,
  nextAction: ParsedStringSchema,
  prUrl: ParsedStringSchema,
  completed: ParsedStringSchema,
});

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
export type MetaProjectionRecord = z.infer<typeof MetaProjectionRecordSchema>;
export type ParsedMetaRecord = z.infer<typeof ParsedMetaRecordSchema>;
export type MetaRecord = z.infer<typeof MetaRecordSchema>;
