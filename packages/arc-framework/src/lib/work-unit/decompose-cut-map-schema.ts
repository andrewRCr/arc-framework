/** Structural schemas for version-2 decomposition allocation maps. */

import { z } from "zod";

import { isCanonicalDigest, type CanonicalDigest } from "../canonical/canonical-json.js";
import { isManagedPath } from "../canonical/managed-path.js";
import { SlugSchema, WorkClassSchema, WorkUnitStateSchema } from "../kernel/index.js";
import { isSafeCohortPath, validateCohortPath } from "../active/cohort-path.js";
import { normalizeDecomposeHeadingSource } from "./decompose-heading.js";

const NonEmptyStringSchema = z.string().refine((value) => value.trim() !== "", "must be non-empty");
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
const DecomposeSlugSchema = SlugSchema.transform((value): string => value);

export const TransformShapeSchema = z.enum(["symmetric", "extraction", "backlog-stub-source", "heterogeneous-home"]);
export const ParentPositionSchema = z.enum(["standalone", "in-cohort", "cohortless", "at-cap"]);
export const OriginLocationSchema = z.enum(["provisional", "planned", "active"]);
export const OriginDispositionSchema = z.enum(["keep-active", "park"]);
export const ExistingHomeKindSchema = z.enum(["fold", "atomic-edit"]);
export const DecomposeSourceOwnershipSchema = z.enum(["destination-owned", "cohort-shared"]);
export const OriginPhaseSchema = WorkUnitStateSchema.extract(["Planning", "Active"]);

export const OriginPositionSchema = z.strictObject({
  slug: DecomposeSlugSchema,
  phase: OriginPhaseSchema,
  location: OriginLocationSchema,
});

const DropDispositionSchema = z.strictObject({ kind: z.literal("drop"), reason: NonEmptyStringSchema });
export const TargetSetSchema = z.array(DecomposeSlugSchema)
  .min(1, "must be a non-empty target array; use a reasoned drop for none");

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
  z.strictObject({ kind: z.literal("work-unit"), slug: DecomposeSlugSchema }),
  z.strictObject({ kind: z.literal("draft-block"), slug: DecomposeSlugSchema, locator: DecomposeContentLocatorSchema }),
  z.strictObject({ kind: z.literal("document"), path: ManagedDocumentPathSchema }),
]);

export const NewMemberEntrySchema = z.strictObject({
  kind: z.literal("new-member"),
  destinationId: NonEmptyStringSchema,
  slug: DecomposeSlugSchema,
  workClass: WorkClassSchema,
});
export const SurvivingOriginEntrySchema = z.strictObject({
  kind: z.literal("surviving-origin"),
  destinationId: NonEmptyStringSchema,
  slug: DecomposeSlugSchema,
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

export const InternalEdgeSchema = z.strictObject({ from: DecomposeSlugSchema, to: DecomposeSlugSchema });
export const SourceAllocationSchema = z.strictObject({
  sourceId: CanonicalDigestSchema,
  ownership: DecomposeSourceOwnershipSchema,
  disposition: DecomposeSourceDispositionSchema,
});
export const IncomingEdgeSchema = z.strictObject({
  dependent: DecomposeSlugSchema,
  disposition: DecomposeIncomingEdgeDispositionSchema,
});
export const OutgoingEdgeSchema = z.strictObject({
  prerequisite: DecomposeSlugSchema,
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

type StructuralMap = z.infer<typeof DecomposeAllocationMapStructuralSchema>;

function duplicate(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

function entryIdentity(entry: z.infer<typeof DecomposeAllocationEntrySchema>): string {
  switch (entry.kind) {
    case "new-member":
    case "surviving-origin":
      return `work-unit:${entry.slug}`;
    case "existing-home":
      if (entry.target.kind === "work-unit") return `work-unit:${entry.target.slug}`;
      if (entry.target.kind === "draft-block") {
        return `draft-block:${entry.target.slug}:${JSON.stringify(entry.target.locator)}`;
      }
      return `document:${entry.target.path}`;
    case "cohort-coordination":
      return `cohort:${entry.cohort}`;
  }
}

function locatorsEqual(
  left: z.infer<typeof DecomposeContentLocatorSchema>,
  right: z.infer<typeof DecomposeContentLocatorSchema>,
): boolean {
  if (left.artifact !== right.artifact || left.kind !== right.kind) return false;
  return left.kind !== "section" || right.kind !== "section"
    || (left.headingSource === right.headingSource && left.occurrence === right.occurrence);
}

function targetLocatorMatches(
  entry: z.infer<typeof DecomposeAllocationEntrySchema>,
  locator: z.infer<typeof DecomposeContentLocatorSchema>,
): boolean {
  if (entry.kind === "new-member" || entry.kind === "surviving-origin") {
    return new RegExp(`^[a-z]+-${entry.slug.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\.md$`, "u")
      .test(locator.artifact);
  }
  if (entry.kind === "existing-home") {
    if (entry.target.kind === "document") return entry.target.path.split("/").at(-1) === locator.artifact;
    if (entry.target.kind === "draft-block") return locatorsEqual(entry.target.locator, locator);
    return new RegExp(`^[a-z]+-${entry.target.slug.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\.md$`, "u")
      .test(locator.artifact);
  }
  return locator.artifact === `cohort-${entry.cohort.split("/").at(-1)}.md`;
}

function addIssue(ctx: z.RefinementCtx, path: PropertyKey[], message: string): void {
  ctx.addIssue({ code: "custom", path, message });
}

function refineEntryCoupling(map: StructuralMap, ctx: z.RefinementCtx): void {
  for (const [index, entry] of map.entries.entries()) {
    if (entry.kind !== "existing-home") continue;
    if (entry.target.kind === "document" && entry.home !== "atomic-edit") {
      addIssue(ctx, ["entries", index, "home"], "document targets require `home: atomic-edit`");
    }
    if (entry.target.kind !== "document" && entry.home !== "fold") {
      addIssue(ctx, ["entries", index, "home"], "work-unit and draft-block targets require `home: fold`");
    }
    if (entry.target.kind === "draft-block" && entry.target.locator.artifact !== `draft-${entry.target.slug}.md`) {
      addIssue(ctx, ["entries", index, "target", "locator"], `locator must belong to draft-${entry.target.slug}.md`);
    }
  }
}

function refinePlacementAndShape(map: StructuralMap, ctx: z.RefinementCtx): void {
  if ((map.parentPosition === "cohortless" || map.parentPosition === "at-cap") && map.cohort !== undefined) {
    addIssue(ctx, ["cohort"], `${map.parentPosition} decomposition must omit cohort`);
  }
  if ((map.parentPosition === "standalone" || map.parentPosition === "in-cohort") && map.cohort === undefined) {
    addIssue(ctx, ["cohort"], `${map.parentPosition} decomposition requires a cohort placement`);
  }
  const members = map.entries.filter((entry) => entry.kind === "new-member");
  const survivors = map.entries.filter((entry) => entry.kind === "surviving-origin");
  if (map.shape !== "extraction" && survivors.length > 0) {
    addIssue(ctx, ["entries"], "surviving-origin entries are valid only for extraction");
  }
  if ((map.shape === "symmetric" || map.shape === "backlog-stub-source") && members.length < 2) {
    addIssue(ctx, ["entries"], `${map.shape} requires at least two new members`);
  }
  if (map.shape === "extraction"
    && (survivors.length !== 1 || survivors[0]?.slug !== map.origin.slug || members.length < 1)) {
    addIssue(ctx, ["entries"], "extraction requires exactly one surviving origin naming the origin and one new member");
  }
  if (map.shape === "heterogeneous-home" && map.entries.length < 2) {
    addIssue(ctx, ["entries"], "heterogeneous-home requires at least two destinations");
  }
}

function refineIdentities(map: StructuralMap, ctx: z.RefinementCtx): void {
  const duplicateId = duplicate(map.entries.map((entry) => entry.destinationId));
  if (duplicateId !== null) addIssue(ctx, ["entries"], `duplicate destinationId ${duplicateId}`);
  const coordinations = map.entries.filter((entry) => entry.kind === "cohort-coordination");
  if (coordinations.length > 1) addIssue(ctx, ["entries"], "at most one cohort-coordination entry is allowed");
  if (map.parentPosition === "cohortless" && coordinations.length > 0) {
    addIssue(ctx, ["entries"], "cohortless decomposition forbids cohort-coordination entries");
  }
  const duplicateIdentity = duplicate(map.entries.map(entryIdentity));
  if (duplicateIdentity !== null) addIssue(ctx, ["entries"], `duplicate destination identity ${duplicateIdentity}`);
  if (coordinations[0] !== undefined && coordinations[0].cohort !== map.cohort) {
    addIssue(ctx, ["entries", map.entries.indexOf(coordinations[0]), "cohort"], "must name the declared cohort");
  }
}

function refineEdgesAndAllocations(map: StructuralMap, ctx: z.RefinementCtx): void {
  const members = map.entries.filter((entry) => entry.kind === "new-member");
  const memberSlugs = new Set(members.map((entry) => entry.slug));
  for (const [index, edge] of map.internalEdges.entries()) {
    if (!memberSlugs.has(edge.from)) addIssue(ctx, ["internalEdges", index, "from"], "references unknown from member");
    if (!memberSlugs.has(edge.to)) addIssue(ctx, ["internalEdges", index, "to"], "references unknown to member");
    if (edge.from === edge.to) addIssue(ctx, ["internalEdges", index], "cannot be a self-dependency");
  }
  if (duplicate(map.internalEdges.map((edge) => `${edge.from}\0${edge.to}`)) !== null) {
    addIssue(ctx, ["internalEdges"], "duplicate internal edge");
  }
  if (duplicate(map.sourceAllocations.map((allocation) => allocation.sourceId)) !== null) {
    addIssue(ctx, ["sourceAllocations"], "duplicate source allocation");
  }
  if (
    map.parentPosition === "cohortless"
    && map.sourceAllocations.some((allocation) => allocation.ownership === "cohort-shared")
  ) {
    addIssue(ctx, ["sourceAllocations"], "cohortless decomposition forbids cohort-shared source ownership");
  }
  const destinations = new Map(map.entries.map((entry) => [entry.destinationId, entry]));
  for (const [index, allocation] of map.sourceAllocations.entries()) {
    if (allocation.disposition.kind !== "target") continue;
    const destination = destinations.get(allocation.disposition.destinationId);
    if (destination === undefined) {
      addIssue(ctx, ["sourceAllocations", index, "disposition", "destinationId"], "references unknown destinationId");
    } else if (!targetLocatorMatches(destination, allocation.disposition.targetLocator)) {
      addIssue(ctx, ["sourceAllocations", index, "disposition", "targetLocator"], "does not belong to destination");
    }
  }

  const recipients = new Set<string>(members.map((entry) => entry.slug));
  for (const entry of map.entries) {
    if (entry.kind === "existing-home" && entry.target.kind === "work-unit") recipients.add(entry.target.slug);
  }
  if (duplicate(map.incomingEdges.map((edge) => edge.dependent)) !== null) {
    addIssue(ctx, ["incomingEdges"], "duplicate incoming edge");
  }
  if (duplicate(map.outgoingEdges.map((edge) => edge.prerequisite)) !== null) {
    addIssue(ctx, ["outgoingEdges"], "duplicate outgoing edge");
  }
  for (const [index, edge] of map.incomingEdges.entries()) {
    if (edge.disposition.kind !== "replace") continue;
    if (duplicate(edge.disposition.replacementTargets) !== null) {
      addIssue(ctx, ["incomingEdges", index, "disposition", "replacementTargets"], "contains duplicate target");
    }
    for (const [targetIndex, target] of edge.disposition.replacementTargets.entries()) {
      if (!recipients.has(target)) {
        addIssue(
          ctx,
          ["incomingEdges", index, "disposition", "replacementTargets", targetIndex],
          `replacement target \`${target}\` cannot receive WU dependencies`,
        );
      }
      if (target === edge.dependent) addIssue(ctx, ["incomingEdges", index], "cannot create a self-dependency");
    }
  }
  for (const [index, edge] of map.outgoingEdges.entries()) {
    if (edge.disposition.kind !== "targets") continue;
    if (duplicate(edge.disposition.targets) !== null) {
      addIssue(ctx, ["outgoingEdges", index, "disposition", "targets"], "contains duplicate target");
    }
    for (const [targetIndex, target] of edge.disposition.targets.entries()) {
      if (!recipients.has(target)) {
        addIssue(
          ctx,
          ["outgoingEdges", index, "disposition", "targets", targetIndex],
          `outgoing consumer \`${target}\` cannot receive WU dependencies`,
        );
      }
      if (target === edge.prerequisite) addIssue(ctx, ["outgoingEdges", index], "cannot create a self-dependency");
    }
  }
}

/** Complete version-2 map schema with cross-record and graph invariants. */
export const DecomposeAllocationMapSchema = DecomposeAllocationMapStructuralSchema.superRefine((map, ctx) => {
  refineEntryCoupling(map, ctx);
  refineIdentities(map, ctx);
  refinePlacementAndShape(map, ctx);
  refineEdgesAndAllocations(map, ctx);
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
export type DecomposeAllocationMap = z.infer<typeof DecomposeAllocationMapSchema>;
