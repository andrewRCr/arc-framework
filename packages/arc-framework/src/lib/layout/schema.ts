/**
 * Runtime-validated semantic addresses for the canonical ARC repository layout.
 */

import { z } from "zod";

import { SlugSchema, validateManagedPath } from "../kernel/index.js";

/** Runtime authority for project lifecycle placement roots. */
export const ArcPlacementTierSchema = z.enum(["active", "planned", "provisional", "completed"]);
/** A project lifecycle placement root. */
export type ArcPlacementTier = z.infer<typeof ArcPlacementTierSchema>;

/** Runtime authority for conventional work-unit artifact names. */
export const WorkUnitArtifactKindSchema = z.enum(["meta", "draft", "spec", "tasks", "notes"]);
/** A conventional work-unit artifact kind. */
export type WorkUnitArtifactKind = z.infer<typeof WorkUnitArtifactKindSchema>;

/** Runtime authority for code-owned project documents regenerated from tracked lifecycle state. */
export const ProjectDocumentKindSchema = z.enum(["roadmap"]);
/** A code-owned project document regenerated from tracked lifecycle state. */
export type ProjectDocumentKind = z.infer<typeof ProjectDocumentKindSchema>;

/** Runtime authority for top-level procedure families. */
export const ProcedureFamilySchema = z.enum(["methods", "workflows"]);
/** A top-level procedure family. */
export type ProcedureFamily = z.infer<typeof ProcedureFamilySchema>;

/** Runtime authority for completed-archive quarters. */
export const ArchiveQuarterSchema = z.string().regex(/^\d{4}-q[1-4]$/u).brand<"ArchiveQuarter">();
/** A validated completed-archive quarter. */
export type ArchiveQuarter = z.infer<typeof ArchiveQuarterSchema>;

/** Runtime authority for completed-archive sequence identifiers. */
export const ArchiveSequenceSchema = z.string().regex(/^(?:0[1-9]|[1-9][0-9]+)$/u).brand<"ArchiveSequence">();
/** A validated completed-archive sequence identifier. */
export type ArchiveSequence = z.infer<typeof ArchiveSequenceSchema>;

function managedPathRefinement(value: string, context: z.RefinementCtx): void {
  try {
    validateManagedPath(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "invalid managed path",
    });
  }
}

/** Runtime authority for paths relative to the package template root. */
export const TemplateRelativePathSchema = z.string()
  .superRefine(managedPathRefinement)
  .brand<"TemplateRelativePath">();
/** A validated path relative to the package template root. */
export type TemplateRelativePath = z.infer<typeof TemplateRelativePathSchema>;

/** Runtime authority for transformed template output paths. */
export const TemplateOutputPathSchema = z.string()
  .superRefine(managedPathRefinement)
  .brand<"TemplateOutputPath">();
/** A validated transformed template output path. */
export type TemplateOutputPath = z.infer<typeof TemplateOutputPathSchema>;

const ProjectActiveScopeSchema = z.strictObject({ kind: z.literal("project") });
const ContributorActiveScopeSchema = z.strictObject({
  kind: z.literal("contributor"),
  identity: SlugSchema,
});

const ActivePlacementSchema = z.strictObject({
  kind: z.literal("active"),
  scope: z.discriminatedUnion("kind", [ProjectActiveScopeSchema, ContributorActiveScopeSchema]),
});
const BacklogPlacementSchema = z.strictObject({
  kind: z.literal("backlog"),
  commitment: z.enum(["planned", "provisional"]),
  cohort: z.array(SlugSchema).max(2),
});
const CompletedPlacementSchema = z.strictObject({
  kind: z.literal("completed"),
  quarter: ArchiveQuarterSchema,
  sequence: ArchiveSequenceSchema,
});

/** Runtime authority for caller-selected physical work-unit placement. */
export const WorkUnitPlacementSchema = z.discriminatedUnion("kind", [
  ActivePlacementSchema,
  BacklogPlacementSchema,
  CompletedPlacementSchema,
]);
/** A caller-selected physical work-unit placement. */
export type WorkUnitPlacement = z.infer<typeof WorkUnitPlacementSchema>;

const PlannedCohortPlacementSchema = z.strictObject({ kind: z.literal("planned") });
const CompletedCohortPlacementSchema = z.strictObject({
  kind: z.literal("completed"),
  quarter: ArchiveQuarterSchema,
  sequence: ArchiveSequenceSchema,
  closeout: z.enum(["leaf", "parent"]),
});
const CohortCoordinateSchema = z.union([
  z.tuple([SlugSchema]),
  z.tuple([SlugSchema, SlugSchema]),
]);

const UserDocumentSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("session-notes"), workUnit: SlugSchema }),
  z.strictObject({ kind: z.literal("working-memory") }),
]);

/** Runtime authority for complete semantic ARC layout addresses. */
export const ArcLayoutAddressSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("arc-root") }),
  z.strictObject({ kind: z.literal("placement-root"), tier: ArcPlacementTierSchema }),
  z.strictObject({
    kind: z.literal("work-unit-container"),
    placement: WorkUnitPlacementSchema,
    slug: SlugSchema,
  }),
  z.strictObject({
    kind: z.literal("work-unit-artifact"),
    placement: WorkUnitPlacementSchema,
    slug: SlugSchema,
    artifact: WorkUnitArtifactKindSchema,
  }),
  z.strictObject({
    kind: z.literal("cohort-document"),
    cohort: CohortCoordinateSchema,
    placement: z.discriminatedUnion("kind", [
      PlannedCohortPlacementSchema,
      CompletedCohortPlacementSchema,
    ]),
  }),
  z.strictObject({ kind: z.literal("procedure-root"), family: ProcedureFamilySchema }),
  z.strictObject({ kind: z.literal("project-document"), document: ProjectDocumentKindSchema }),
  z.strictObject({
    kind: z.literal("user-document"),
    identity: SlugSchema,
    document: UserDocumentSchema,
  }),
]);
/** A complete semantic ARC layout address. */
export type ArcLayoutAddress = z.infer<typeof ArcLayoutAddressSchema>;
