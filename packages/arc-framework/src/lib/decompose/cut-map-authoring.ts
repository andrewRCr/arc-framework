/** Closed authored decisions for record-bound decomposition maps. */
import { z } from "zod";
import { SlugSchema, WorkClassSchema } from "../kernel/index.js";
import { CanonicalDigestSchema } from "../kernel/schema/vocabulary.js";
import { isManagedPath } from "../kernel/canonical/managed-path.js";
import { isSafeCohortPath, validateCohortPath } from "../active/cohort-path.js";
import { V3DecomposeLocatorSchema } from "../work-unit/decompose-content.js";

const DecomposeSlugSchema: z.ZodType<string, string> = SlugSchema;
const NonEmptyStringSchema = z.string().refine((value) => value.trim() !== "", "must be non-empty");
const ManagedPathSchema = z.string().refine(
  (value: string): boolean => isManagedPath(value),
  "must be a managed repository-relative path",
);
function isCanonicalCohortPath(value: string, depth?: 1 | 2): boolean {
  if (value !== value.trim() || !isSafeCohortPath(value) || validateCohortPath(value) !== null) return false;
  const segments = value.split("/");
  return (depth === undefined ? segments.length === 1 || segments.length === 2 : segments.length === depth)
    && segments.every((segment) => SlugSchema.safeParse(segment).success);
}

const CohortPathSchema = z.string().refine(
  (value) => isCanonicalCohortPath(value),
  "must be a canonical one- or two-segment cohort path",
);
const TopLevelCohortPathSchema = z.string().refine(
  (value) => isCanonicalCohortPath(value, 1),
  "must be a canonical one-segment cohort path",
);
const NestedCohortPathSchema = z.string().refine(
  (value) => isCanonicalCohortPath(value, 2),
  "must be a canonical two-segment cohort path",
);
const AuthorSlotSchema = z.strictObject({ status: z.literal("author") });

const PlacementSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("direct-member") }),
  z.strictObject({ kind: z.literal("cohort"), cohort: TopLevelCohortPathSchema, purpose: NonEmptyStringSchema.optional() }),
  z.strictObject({ kind: z.literal("subcohort"), cohort: NestedCohortPathSchema,
    purpose: NonEmptyStringSchema.optional(), parentPurpose: NonEmptyStringSchema.optional() }),
  z.strictObject({ kind: z.literal("at-cap"), parent: NestedCohortPathSchema }),
]);
const ExistingTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("work-unit"), slug: DecomposeSlugSchema }),
  z.strictObject({ kind: z.literal("draft-block"), slug: DecomposeSlugSchema, locator: V3DecomposeLocatorSchema }),
  z.strictObject({ kind: z.literal("document"), path: ManagedPathSchema }),
]);
const DestinationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("new-member"),
    destinationId: NonEmptyStringSchema,
    slug: DecomposeSlugSchema,
    workClass: WorkClassSchema,
  }),
  z.strictObject({
    kind: z.literal("existing-home"),
    destinationId: NonEmptyStringSchema,
    target: ExistingTargetSchema,
  }),
  z.strictObject({
    kind: z.literal("cohort-coordination"),
    destinationId: NonEmptyStringSchema,
    cohort: CohortPathSchema,
  }),
]);
const DropSchema = z.strictObject({ kind: z.literal("drop"), reason: NonEmptyStringSchema });
const SourceDispositionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("target"),
    destinationId: NonEmptyStringSchema,
    targetLocator: V3DecomposeLocatorSchema,
  }),
  z.strictObject({ kind: z.literal("retained-origin") }),
  DropSchema,
]);
const IncomingDispositionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("replace"), replacementTargets: z.array(DecomposeSlugSchema) }),
  DropSchema,
]);
const OutgoingDispositionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("targets"), targets: z.array(DecomposeSlugSchema) }),
  DropSchema,
]);
const InternalEdgeSchema = z.strictObject({ from: DecomposeSlugSchema, to: DecomposeSlugSchema });
const ExternalEdgeSchema = z.strictObject({ from: DecomposeSlugSchema, to: DecomposeSlugSchema });

export const CutStarterAuthoringSchema = z.strictObject({
  shape: AuthorSlotSchema,
  placement: AuthorSlotSchema,
  destinations: AuthorSlotSchema,
  internalEdges: AuthorSlotSchema,
  externalEdges: AuthorSlotSchema,
  sourceAllocations: z.array(z.strictObject({
    sourceId: CanonicalDigestSchema,
    ownership: AuthorSlotSchema,
    disposition: AuthorSlotSchema,
  })),
  incomingDispositions: z.array(z.strictObject({ edgeId: CanonicalDigestSchema, disposition: AuthorSlotSchema })),
  outgoingDispositions: z.array(z.strictObject({ edgeId: CanonicalDigestSchema, disposition: AuthorSlotSchema })),
});
export const CutCompletedAuthoringSchema = z.strictObject({
  shape: z.enum(["symmetric", "heterogeneous", "extraction"]),
  placement: PlacementSchema,
  destinations: z.array(DestinationSchema),
  internalEdges: z.array(InternalEdgeSchema),
  externalEdges: z.array(ExternalEdgeSchema),
  sourceAllocations: z.array(z.strictObject({
    sourceId: CanonicalDigestSchema,
    ownership: z.enum(["destination-owned", "cohort-shared"]),
    disposition: SourceDispositionSchema,
  })),
  incomingDispositions: z.array(z.strictObject({
    edgeId: CanonicalDigestSchema,
    disposition: IncomingDispositionSchema,
  })),
  outgoingDispositions: z.array(z.strictObject({
    edgeId: CanonicalDigestSchema,
    disposition: OutgoingDispositionSchema,
  })),
});

