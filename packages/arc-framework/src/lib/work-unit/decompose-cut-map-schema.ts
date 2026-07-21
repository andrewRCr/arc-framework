/** Structural schemas for version-2 decomposition allocation maps. */

import { z } from "zod";

import { isCanonicalDigest, type CanonicalDigest } from "../canonical/canonical-json.js";
import { isManagedPath } from "../canonical/managed-path.js";
import { SlugSchema, WorkClassSchema, WorkUnitStateSchema } from "../kernel/index.js";
import { isSafeCohortPath, validateCohortPath } from "../active/cohort-path.js";
import { normalizeDecomposeHeadingSource } from "./decompose-heading.js";

const NonEmptyStringSchema = z.string().trim().min(1);
const ArtifactBasenameSchema = z.string().min(1).refine(
  (value) => !value.includes("/") && !value.includes("\\") && value !== "." && value !== ".."
    && !value.includes("\0") && value.normalize("NFC") === value,
  "must be a slash-free NFC basename",
);
const ManagedDocumentPathSchema = z.string().min(1).refine(isManagedPath, "must be a managed repository-relative path");
const CohortPathSchema = z.string().min(1).refine(
  (value) => value.trim() !== "[none]" && isSafeCohortPath(value) && validateCohortPath(value) === null,
  "must be a safe cohort path",
);
const CanonicalDigestSchema = z.custom<CanonicalDigest>(isCanonicalDigest, "must be a canonical digest");

export const TransformShapeSchema = z.enum(["symmetric", "extraction", "backlog-stub-source", "heterogeneous-home"]);
export const ParentPositionSchema = z.enum(["standalone", "in-cohort", "at-cap"]);
export const OriginLocationSchema = z.enum(["provisional", "planned", "active"]);
export const OriginDispositionSchema = z.enum(["keep-active", "park"]);
export const ExistingHomeKindSchema = z.enum(["fold", "atomic-edit"]);
export const DecomposeSourceOwnershipSchema = z.enum(["destination-owned", "cohort-shared"]);
export const OriginPhaseSchema = WorkUnitStateSchema.extract(["Planning", "Active"]);

export const OriginPositionSchema = z.strictObject({
  slug: SlugSchema,
  phase: OriginPhaseSchema,
  location: OriginLocationSchema,
});

const DropDispositionSchema = z.strictObject({ kind: z.literal("drop"), reason: NonEmptyStringSchema });
export const TargetSetSchema = z.array(SlugSchema).min(1);

export const DecomposeEdgeDispositionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("targets"), targets: TargetSetSchema }),
  DropDispositionSchema,
]);
export const DecomposeIncomingEdgeDispositionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("replace"), replacementTargets: TargetSetSchema }),
  DropDispositionSchema,
]);

export const DecomposeContentLocatorSchema = z.discriminatedUnion("kind", [
  z.strictObject({ artifact: ArtifactBasenameSchema, kind: z.literal("preamble") }),
  z.strictObject({
    artifact: ArtifactBasenameSchema,
    kind: z.literal("section"),
    headingSource: z.string().refine((value) => normalizeDecomposeHeadingSource(value) === value, "must be normalized"),
    occurrence: z.number().int().nonnegative(),
  }),
  z.strictObject({ artifact: ArtifactBasenameSchema, kind: z.literal("whole-file") }),
]);

export const DecomposeSourceDispositionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("target"),
    destinationId: NonEmptyStringSchema,
    targetLocator: DecomposeContentLocatorSchema,
  }),
  DropDispositionSchema,
]);

export const DecomposeExistingTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("work-unit"), slug: SlugSchema }),
  z.strictObject({ kind: z.literal("draft-block"), slug: SlugSchema, locator: DecomposeContentLocatorSchema }),
  z.strictObject({ kind: z.literal("document"), path: ManagedDocumentPathSchema }),
]);

export const NewMemberEntrySchema = z.strictObject({
  kind: z.literal("new-member"),
  destinationId: NonEmptyStringSchema,
  slug: SlugSchema,
  workClass: WorkClassSchema,
});
export const SurvivingOriginEntrySchema = z.strictObject({
  kind: z.literal("surviving-origin"),
  destinationId: NonEmptyStringSchema,
  slug: SlugSchema,
  disposition: OriginDispositionSchema,
});
export const ExistingHomeEntrySchema = z.strictObject({
  kind: z.literal("existing-home"),
  destinationId: NonEmptyStringSchema,
  target: DecomposeExistingTargetSchema,
  home: ExistingHomeKindSchema,
});
export const CohortCoordinationEntrySchema = z.strictObject({
  kind: z.literal("cohort-coordination"),
  destinationId: NonEmptyStringSchema,
  cohort: CohortPathSchema,
});
export const DecomposeAllocationEntrySchema = z.discriminatedUnion("kind", [
  NewMemberEntrySchema,
  SurvivingOriginEntrySchema,
  ExistingHomeEntrySchema,
  CohortCoordinationEntrySchema,
]);

export const InternalEdgeSchema = z.strictObject({ from: SlugSchema, to: SlugSchema });
export const SourceAllocationSchema = z.strictObject({
  sourceId: CanonicalDigestSchema,
  ownership: DecomposeSourceOwnershipSchema,
  disposition: DecomposeSourceDispositionSchema,
});
export const IncomingEdgeSchema = z.strictObject({
  dependent: SlugSchema,
  disposition: DecomposeIncomingEdgeDispositionSchema,
});
export const OutgoingEdgeSchema = z.strictObject({
  prerequisite: SlugSchema,
  disposition: DecomposeEdgeDispositionSchema,
});

/** Strict structural version-2 allocation map; graph invariants compose separately. */
export const DecomposeAllocationMapStructuralSchema = z.strictObject({
  schemaVersion: z.literal(2),
  origin: OriginPositionSchema,
  shape: TransformShapeSchema,
  parentPosition: ParentPositionSchema,
  cohort: CohortPathSchema.optional(),
  entries: z.array(DecomposeAllocationEntrySchema),
  internalEdges: z.array(InternalEdgeSchema),
  sourceAllocations: z.array(SourceAllocationSchema),
  incomingEdges: z.array(IncomingEdgeSchema),
  outgoingEdges: z.array(OutgoingEdgeSchema),
});

export type TransformShape = z.infer<typeof TransformShapeSchema>;
export type ParentPosition = z.infer<typeof ParentPositionSchema>;
export type OriginLocation = z.infer<typeof OriginLocationSchema>;
export type OriginDisposition = z.infer<typeof OriginDispositionSchema>;
export type ExistingHomeKind = z.infer<typeof ExistingHomeKindSchema>;
export type DecomposeSourceOwnership = z.infer<typeof DecomposeSourceOwnershipSchema>;
export type OriginPosition = z.infer<typeof OriginPositionSchema>;
export type DecomposeEdgeDisposition = z.infer<typeof DecomposeEdgeDispositionSchema>;
export type DecomposeIncomingEdgeDisposition = z.infer<typeof DecomposeIncomingEdgeDispositionSchema>;
export type DecomposeContentLocator = z.infer<typeof DecomposeContentLocatorSchema>;
export type DecomposeSourceDisposition = z.infer<typeof DecomposeSourceDispositionSchema>;
export type DecomposeExistingTarget = z.infer<typeof DecomposeExistingTargetSchema>;
export type NewMemberEntry = z.infer<typeof NewMemberEntrySchema>;
export type SurvivingOriginEntry = z.infer<typeof SurvivingOriginEntrySchema>;
export type ExistingHomeEntry = z.infer<typeof ExistingHomeEntrySchema>;
export type CohortCoordinationEntry = z.infer<typeof CohortCoordinationEntrySchema>;
export type DecomposeAllocationEntry = z.infer<typeof DecomposeAllocationEntrySchema>;
export type InternalEdge = z.infer<typeof InternalEdgeSchema>;
export type SourceAllocation = z.infer<typeof SourceAllocationSchema>;
export type IncomingEdge = z.infer<typeof IncomingEdgeSchema>;
export type OutgoingEdge = z.infer<typeof OutgoingEdgeSchema>;
export type DecomposeAllocationMap = z.infer<typeof DecomposeAllocationMapStructuralSchema>;
