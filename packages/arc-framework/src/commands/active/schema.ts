import { z } from "zod";
import { IntegrationBoundaryLocusSchema } from "../../scripts/review-gate/policy/integration-boundary-locus.js";

const MetaFileCandidateSchema = z.strictObject({
  path: z.string(),
  filename: z.string(),
  branch: z.string().nullable(),
  candidateId: z.string().nullable().optional(),
  integrationBoundary: IntegrationBoundaryLocusSchema.nullable().optional(),
  state: z.string().nullable(),
  nextTask: z.string().nullable(),
  taskList: z.string().nullable(),
  nextAction: z.string().nullable(),
  currentWorkflow: z.string().nullable(),
});

/** Strict result shared by standalone active resolution and derived session projection. */
export const ActiveSessionInitResultSchema = z.strictObject({
  mode: z.literal("session-init"),
  layout: z.enum(["full", "lite"]),
  resolution: z.enum(["none", "single", "multiple"]),
  /** Resolved meta path for a single candidate; null otherwise. */
  path: z.string().nullable(),
  /** Candidates awaiting disambiguation for a multiple resolution. */
  candidates: z.array(MetaFileCandidateSchema),
  /** Present only when a single Full-layout task list names a conventional companion stem. */
  companions: z.strictObject({ notes: z.string().nullable(), atomic: z.string().nullable() }).optional(),
  /** Present only for a single resolved meta; null when no safe task list is associated. */
  taskListPath: z.string().nullable().optional(),
  sessionType: z.enum(["planning", "execution", "prepublication", "integration"]).nullable(),
  currentWorkflow: z.string().nullable(),
  /** Resolved planning workflow for a single planning candidate; null otherwise. */
  planningStage: z.enum(["draft-design", "create-spec", "generate-tasks"]).nullable(),
  integrationBoundary: IntegrationBoundaryLocusSchema.nullable(),
  warnings: z.array(z.string()),
});
