/**
 * Runtime-validated semantic addresses for the canonical ARC repository layout.
 */

import { z } from "zod";

import { ArchiveQuarterSchema, ArchiveSequenceSchema, SlugSchema, validateManagedPath, type Slug } from "../kernel/index.js";
import { companionKeyForFile, companionStoredName, validateCompanionKey } from "./companion-key.js";

/** Runtime authority for project lifecycle placement roots. */
export const ArcPlacementTierSchema = z.enum(["active", "planned", "provisional", "completed"]);
/** A project lifecycle placement root. */
export type ArcPlacementTier = z.infer<typeof ArcPlacementTierSchema>;

/** Runtime authority for conventional work-unit artifact names. */
export const WorkUnitArtifactKindSchema = z.enum(["meta", "draft", "spec", "tasks", "notes"]);
/** A conventional work-unit artifact kind. */
export type WorkUnitArtifactKind = z.infer<typeof WorkUnitArtifactKindSchema>;

/** Conventional companion names, excluding the two names with paired-spec spellings. */
const CompanionNameSchema = SlugSchema.refine(name => name !== "spec-prd" && name !== "spec-rfc");
const RESERVED_COMPANION_KEYS: ReadonlySet<string> = new Set([
  ...WorkUnitArtifactKindSchema.options, "errand", "inbound", "cohort", "spec-prd", "spec-rfc",
]);

/** Decode a companion filename after fixed forms, or refuse a reserved root filename. */
export function companionFileKey(key: string, slug: Slug): string | null {
  if (key.startsWith("cohort-")) return null;
  if (key.includes("/")) return key;
  if (key === `spec-${slug}-prd.md` || key === `spec-${slug}-rfc.md`) return null;
  const suffix = `-${slug}.md`;
  const name = key.endsWith(suffix) ? key.slice(0, -suffix.length) : "";
  if (CompanionNameSchema.safeParse(name).success) return RESERVED_COMPANION_KEYS.has(name) ? null : name;
  if (key === `spec-prd-${slug}.md` || key === `spec-rfc-${slug}.md`) return key;
  const artifact = /^([a-z]+)-(.+)\.md$/u.exec(key);
  if (WorkUnitArtifactKindSchema.safeParse(artifact?.[1]).success && SlugSchema.safeParse(artifact?.[2]).success) return null;
  return companionKeyForFile(slug, key);
}

function hasDistinctCompanionKey({ key, slug, placement }: { key: string; slug: Slug; placement: WorkUnitPlacement }): boolean {
  let file: string;
  try { file = companionStoredName(slug, key); } catch { return false; }
  if (placement.kind === "active" && placement.scope.kind === "project" && placement.scope.location?.kind === "own"
    && placement.scope.location.layoutActive === "flat" && (file === "in-flight" || file.startsWith("in-flight/"))) return false;
  return companionFileKey(file, slug) === key;
}

/** Runtime authority for code-owned project documents regenerated from tracked lifecycle state. */
export const ProjectDocumentKindSchema = z.enum(["roadmap"]);
/** A code-owned project document regenerated from tracked lifecycle state. */
export type ProjectDocumentKind = z.infer<typeof ProjectDocumentKindSchema>;

/** Runtime authority for top-level procedure families. */
export const ProcedureFamilySchema = z.enum(["methods", "workflows"]);
/** A top-level procedure family. */
export type ProcedureFamily = z.infer<typeof ProcedureFamilySchema>;

/** Shared archive value authorities, re-exported for layout consumers. */
export { ArchiveQuarterSchema, ArchiveSequenceSchema, type ArchiveQuarter, type ArchiveSequence } from "../kernel/index.js";

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

function companionKeyRefinement(value: string, context: z.RefinementCtx): void {
  try { validateCompanionKey(value); } catch (error) {
    context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "invalid companion key" });
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
/** The checkout's own active folder carries its claim and effective physical layout explicitly. */
export const OwnActiveLocationSchema = z.strictObject({
  kind: z.literal("own"), claim: SlugSchema, layoutActive: z.enum(["nested", "flat"]),
});
/** Coordinates of the checkout's own active folder. */
export type OwnActiveLocation = z.infer<typeof OwnActiveLocationSchema>;
const ProjectWorkUnitActiveScopeSchema = ProjectActiveScopeSchema.extend({
  location: z.discriminatedUnion("kind", [OwnActiveLocationSchema, z.strictObject({ kind: z.literal("another") })]).optional(),
});
const IdentityInboxScopeSchema = z.strictObject({ kind: z.literal("identity"), identity: SlugSchema });
const ContributorActiveScopeSchema = z.strictObject({
  kind: z.literal("contributor"),
  identity: SlugSchema,
});

const ActivePlacementSchema = z.strictObject({
  kind: z.literal("active"),
  scope: z.discriminatedUnion("kind", [ProjectWorkUnitActiveScopeSchema, ContributorActiveScopeSchema]),
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
const ErrandPlacementSchema = z.discriminatedUnion("kind", [
  ActivePlacementSchema,
  z.strictObject({ kind: z.literal("completed"), quarter: ArchiveQuarterSchema }),
]);

/** Runtime authority for caller-selected physical work-unit placement. */
export const WorkUnitPlacementSchema = z.discriminatedUnion("kind", [
  ActivePlacementSchema,
  BacklogPlacementSchema,
  CompletedPlacementSchema,
]);
/** A caller-selected physical work-unit placement. */
export type WorkUnitPlacement = z.infer<typeof WorkUnitPlacementSchema>;

function matchesOwnClaim(address: { placement: WorkUnitPlacement | z.infer<typeof ErrandPlacementSchema>; slug: Slug }): boolean {
  const placement = address.placement;
  return placement.kind !== "active" || placement.scope.kind !== "project"
    || placement.scope.location?.kind !== "own" || placement.scope.location.claim === address.slug;
}

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
  z.strictObject({ kind: z.literal("work-unit-export"), slug: SlugSchema }),
  z.strictObject({ kind: z.literal("candidate-record"), slug: SlugSchema }),
  z.strictObject({ kind: z.literal("integration-boundary-record"), slug: SlugSchema }),
  z.strictObject({ kind: z.literal("transition-record"), origin: SlugSchema }),
  z.strictObject({ kind: z.literal("editor-document-root") }),
  z.strictObject({ kind: z.literal("editor-document"), schema: SlugSchema }),
  z.strictObject({ kind: z.literal("inbox"), scope: z.discriminatedUnion("kind", [ProjectActiveScopeSchema, IdentityInboxScopeSchema]) }),
  z.strictObject({ kind: z.literal("placement-root"), tier: ArcPlacementTierSchema }),
  z.strictObject({
    kind: z.literal("work-unit-container"),
    placement: WorkUnitPlacementSchema,
    slug: SlugSchema,
  }).refine(matchesOwnClaim, "An own location must name the checkout's claimed work item."),
  z.strictObject({
    kind: z.literal("work-unit-artifact"),
    placement: WorkUnitPlacementSchema,
    slug: SlugSchema,
    artifact: WorkUnitArtifactKindSchema,
  }).refine(matchesOwnClaim, "An own location must name the checkout's claimed work item."),
  z.strictObject({ kind: z.literal("work-unit-companion"), placement: WorkUnitPlacementSchema, slug: SlugSchema,
    key: z.string().superRefine(companionKeyRefinement),
  }).refine(matchesOwnClaim, "An own location must name the checkout's claimed work item.")
    .refine(hasDistinctCompanionKey, "The companion key is reserved or has an earlier filename interpretation."),
  z.strictObject({ kind: z.literal("work-unit-spec-part"), placement: WorkUnitPlacementSchema, slug: SlugSchema,
    part: z.enum(["prd", "rfc"]),
  }).refine(matchesOwnClaim, "An own location must name the checkout's claimed work item."),
  z.strictObject({ kind: z.literal("work-unit-inbound"), placement: WorkUnitPlacementSchema, slug: SlugSchema,
  }).refine(matchesOwnClaim, "An own location must name the checkout's claimed work item."),
  z.strictObject({ kind: z.literal("errand-description"), placement: ErrandPlacementSchema, slug: SlugSchema,
  }).refine(matchesOwnClaim, "An own location must name the checkout's claimed work item."),
  z.strictObject({ kind: z.literal("cohort-copy"), cohort: SlugSchema, location: OwnActiveLocationSchema }),
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
  z.strictObject({ kind: z.literal("user-root"), identity: SlugSchema }),
  z.strictObject({ kind: z.literal("scratch-document"), identity: SlugSchema,
    key: z.string().superRefine(managedPathRefinement).refine(key => key.startsWith("scratch/") && key.length > "scratch/".length)
      .refine(key => key !== "scratch/SESSION-NOTES.md", "The scratch key is reserved for session context."),
  }),
  z.strictObject({
    kind: z.literal("user-document"),
    identity: SlugSchema,
    document: UserDocumentSchema,
  }),
]);
/** A complete semantic ARC layout address. */
export type ArcLayoutAddress = z.infer<typeof ArcLayoutAddressSchema>;
