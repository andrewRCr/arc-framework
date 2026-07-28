/** Closed structural and identity contract for version-3 decomposition maps. */

import { z } from "zod";

import {
  canonicalDigest,
  isCanonicalDigest,
  sortByCanonicalBytes,
  type CanonicalDigest,
} from "../canonical/canonical-json.js";
import { isManagedPath } from "../canonical/managed-path.js";
import { SlugSchema, WorkClassSchema } from "../kernel/index.js";
import { isSafeCohortPath, validateCohortPath } from "../active/cohort-path.js";
import { normalizeDecomposeHeadingSource } from "./decompose-heading.js";

const DigestSchema = z.custom<CanonicalDigest>(isCanonicalDigest, "must be a canonical digest");
const DecomposeSlugSchema = SlugSchema.transform((value): string => value);
const NonEmptyStringSchema = z.string().refine((value) => value.trim() !== "", "must be non-empty");
const BasenameSchema = z.string().min(1).refine(
  (value) => !value.includes("/") && !value.includes("\\") && value !== "." && value !== ".."
    && !value.includes("\0") && value.normalize("NFC") === value,
  "must be a slash-free NFC basename",
);
const ManagedPathSchema = z.string().refine(
  (value: string): boolean => isManagedPath(value),
  "must be a managed repository-relative path",
);
const CohortPathSchema = z.string().refine(
  (value) => isSafeCohortPath(value) && validateCohortPath(value) === null,
  "must be a safe cohort path",
);
const AuthorSlotSchema = z.strictObject({ status: z.literal("author") });
const HeadingIdentitySchema = z.strictObject({
  level: z.number().int().min(2).max(6),
  headingSource: z.string().refine(
    (value) => normalizeDecomposeHeadingSource(value) === value,
    "must be normalized",
  ),
  occurrence: z.number().int().nonnegative(),
});

export const V3DecomposeLocatorSchema = z.discriminatedUnion("kind", [
  z.strictObject({ artifact: BasenameSchema, kind: z.literal("preamble") }),
  z.strictObject({
    artifact: BasenameSchema,
    kind: z.literal("section"),
    level: z.number().int().min(2).max(6),
    headingSource: z.string().refine(
      (value) => normalizeDecomposeHeadingSource(value) === value,
      "must be normalized",
    ),
    ancestry: z.array(HeadingIdentitySchema),
    occurrence: z.number().int().nonnegative(),
  }),
  z.strictObject({ artifact: BasenameSchema, kind: z.literal("whole-file") }),
]);

const SourceSchema = z.strictObject({
  origin: DecomposeSlugSchema,
  kind: z.enum(["started-planning", "backlog-stub"]),
  logicalBranch: NonEmptyStringSchema,
  ref: NonEmptyStringSchema,
  head: NonEmptyStringSchema,
});
const ResultBaseSchema = z.strictObject({ ref: NonEmptyStringSchema, head: NonEmptyStringSchema });
const PlanningProfileSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("draft"), sourceDesign: z.array(BasenameSchema).max(1) }),
  z.strictObject({ kind: z.literal("single-spec"), sourceDesign: z.tuple([BasenameSchema]) }),
  z.strictObject({ kind: z.literal("paired-spec"), sourceDesign: z.tuple([BasenameSchema, BasenameSchema]) }),
]);
const SourceUnitSchema = z.strictObject({
  sourceId: DigestSchema,
  sourcePath: ManagedPathSchema,
  sourceLocator: V3DecomposeLocatorSchema,
  contentDigest: DigestSchema,
});
const IncomingEdgeSchema = z.strictObject({
  edgeId: DigestSchema,
  dependent: DecomposeSlugSchema,
  currentTargets: z.array(DecomposeSlugSchema),
});
const OutgoingEdgeSchema = z.strictObject({ edgeId: DigestSchema, prerequisite: DecomposeSlugSchema });

const MachineSchema = z.strictObject({
  preflightId: DigestSchema,
  source: SourceSchema,
  resultBase: ResultBaseSchema,
  planningProfile: PlanningProfileSchema,
  sourceUnits: z.array(SourceUnitSchema),
  incomingEdges: z.array(IncomingEdgeSchema),
  outgoingEdges: z.array(OutgoingEdgeSchema),
});

const PlacementSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("direct-member") }),
  z.strictObject({ kind: z.literal("cohort"), cohort: CohortPathSchema }),
  z.strictObject({ kind: z.literal("subcohort"), cohort: CohortPathSchema }),
  z.strictObject({ kind: z.literal("at-cap"), parent: CohortPathSchema }),
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

const StarterAuthoringSchema = z.strictObject({
  shape: AuthorSlotSchema,
  placement: AuthorSlotSchema,
  destinations: AuthorSlotSchema,
  internalEdges: AuthorSlotSchema,
  sourceAllocations: z.array(z.strictObject({
    sourceId: DigestSchema,
    ownership: AuthorSlotSchema,
    disposition: AuthorSlotSchema,
  })),
  incomingDispositions: z.array(z.strictObject({ edgeId: DigestSchema, disposition: AuthorSlotSchema })),
  outgoingDispositions: z.array(z.strictObject({ edgeId: DigestSchema, disposition: AuthorSlotSchema })),
});
const CompletedAuthoringSchema = z.strictObject({
  shape: z.enum(["symmetric", "heterogeneous"]),
  placement: PlacementSchema,
  destinations: z.array(DestinationSchema),
  internalEdges: z.array(InternalEdgeSchema),
  sourceAllocations: z.array(z.strictObject({
    sourceId: DigestSchema,
    ownership: z.enum(["destination-owned", "cohort-shared"]),
    disposition: SourceDispositionSchema,
  })),
  incomingDispositions: z.array(z.strictObject({
    edgeId: DigestSchema,
    disposition: IncomingDispositionSchema,
  })),
  outgoingDispositions: z.array(z.strictObject({
    edgeId: DigestSchema,
    disposition: OutgoingDispositionSchema,
  })),
});

export const V3DecomposeStarterMapSchema = z.strictObject({
  schemaVersion: z.literal(3),
  machine: MachineSchema,
  authoring: StarterAuthoringSchema,
});
export const V3DecomposeCutMapSchema = z.strictObject({
  schemaVersion: z.literal(3),
  machine: MachineSchema,
  authoring: CompletedAuthoringSchema,
});

export type V3DecomposeStarterMap = z.infer<typeof V3DecomposeStarterMapSchema>;
export type V3DecomposeCutMap = z.infer<typeof V3DecomposeCutMapSchema>;
export type V3DecomposeMachine = V3DecomposeCutMap["machine"];

export interface V3SourceArtifactEntry {
  path: string;
  objectKind: "blob";
  mode: "100644" | "100755";
  contentDigest: CanonicalDigest;
}

function ordered(values: readonly string[]): boolean {
  let previous: string | undefined;
  for (const value of values) {
    if (previous !== undefined
      && Buffer.compare(Buffer.from(previous, "utf8"), Buffer.from(value, "utf8")) >= 0) return false;
    previous = value;
  }
  return true;
}

function identityArraysMatch(
  machine: V3DecomposeMachine,
  authoring: V3DecomposeStarterMap["authoring"] | V3DecomposeCutMap["authoring"],
): boolean {
  return machine.sourceUnits.map(({ sourceId }) => sourceId).join("\0")
      === authoring.sourceAllocations.map(({ sourceId }) => sourceId).join("\0")
    && machine.incomingEdges.map(({ edgeId }) => edgeId).join("\0")
      === authoring.incomingDispositions.map(({ edgeId }) => edgeId).join("\0")
    && machine.outgoingEdges.map(({ edgeId }) => edgeId).join("\0")
      === authoring.outgoingDispositions.map(({ edgeId }) => edgeId).join("\0");
}

/** Canonical identity for one incoming dependency edge. */
export function v3IncomingEdgeId(edge: { dependent: string; currentTargets: string[] }): CanonicalDigest {
  return canonicalDigest({ schemaVersion: 3, kind: "incoming", ...edge });
}

/** Canonical identity for one outgoing dependency edge. */
export function v3OutgoingEdgeId(edge: { prerequisite: string }): CanonicalDigest {
  return canonicalDigest({ schemaVersion: 3, kind: "outgoing", ...edge });
}

/** Canonical identity for one source allocation unit. */
export function v3SourceId(source: {
  sourcePath: string;
  sourceLocator: z.infer<typeof V3DecomposeLocatorSchema>;
}): CanonicalDigest {
  return canonicalDigest({ schemaVersion: 3, ...source });
}

/** Canonical identity for the machine-owned decomposition preflight. */
export function v3PreflightId(machine: Omit<V3DecomposeMachine, "preflightId">): CanonicalDigest {
  return canonicalDigest({ schemaVersion: 3, ...machine });
}

/** Stable retirement identity for one exact v3 source transition. */
export function v3ReceiptId(machine: V3DecomposeMachine): CanonicalDigest {
  return canonicalDigest({
    schemaVersion: 3,
    subject: { kind: "work-unit", name: machine.source.origin },
    transition: "decompose",
    sourceBranch: machine.source.logicalBranch,
    sourceHead: machine.source.head,
  });
}

/** Digest one exact completed cut map. */
export function v3CutMapDigest(map: V3DecomposeCutMap): CanonicalDigest {
  return canonicalDigest(map);
}

/** Digest the canonical complete authorization path set. */
export function v3AllowedPathsDigest(paths: readonly string[]): CanonicalDigest | null {
  return ordered(paths) ? canonicalDigest(paths) : null;
}

/** Digest the complete stored-blob source artifact inventory. */
export function v3SourceArtifactDigest(entries: readonly V3SourceArtifactEntry[]): CanonicalDigest | null {
  if (!ordered(entries.map(({ path }) => path))) return null;
  return canonicalDigest({ schemaVersion: 3, kind: "source-artifact-inventory", entries });
}

/** Digest the immutable machine source-unit inventory. */
export function v3SourceInventoryDigest(machine: V3DecomposeMachine): CanonicalDigest {
  return canonicalDigest({ schemaVersion: 3, kind: "source-unit-inventory", entries: machine.sourceUnits });
}

/** Digest the immutable machine incoming-edge inventory. */
export function v3IncomingEdgeInventoryDigest(machine: V3DecomposeMachine): CanonicalDigest {
  return canonicalDigest({ schemaVersion: 3, kind: "incoming-edge-inventory", entries: machine.incomingEdges });
}

/** Digest the immutable machine outgoing-edge inventory. */
export function v3OutgoingEdgeInventoryDigest(machine: V3DecomposeMachine): CanonicalDigest {
  return canonicalDigest({ schemaVersion: 3, kind: "outgoing-edge-inventory", entries: machine.outgoingEdges });
}

function machineIsCanonical(machine: V3DecomposeMachine): boolean {
  const sourceIds = machine.sourceUnits.map(({ sourceId }) => sourceId);
  const incomingIds = machine.incomingEdges.map(({ edgeId }) => edgeId);
  const outgoingIds = machine.outgoingEdges.map(({ edgeId }) => edgeId);
  return ordered(sourceIds)
    && ordered(incomingIds)
    && ordered(outgoingIds)
    && machine.sourceUnits.every((unit) => unit.sourceId === v3SourceId({
      sourcePath: unit.sourcePath,
      sourceLocator: unit.sourceLocator,
    }))
    && machine.incomingEdges.every((edge) => ordered(edge.currentTargets)
      && edge.edgeId === v3IncomingEdgeId({ dependent: edge.dependent, currentTargets: edge.currentTargets }))
    && machine.outgoingEdges.every((edge) => edge.edgeId === v3OutgoingEdgeId({ prerequisite: edge.prerequisite }))
    && machine.preflightId === v3PreflightId({
      source: machine.source,
      resultBase: machine.resultBase,
      planningProfile: machine.planningProfile,
      sourceUnits: machine.sourceUnits,
      incomingEdges: machine.incomingEdges,
      outgoingEdges: machine.outgoingEdges,
    });
}

/** Parse and validate a closed v3 starter map. */
export function parseV3DecomposeStarterMap(input: unknown): V3DecomposeStarterMap | null {
  const parsed = V3DecomposeStarterMapSchema.safeParse(input);
  if (!parsed.success || !machineIsCanonical(parsed.data.machine)
    || !identityArraysMatch(parsed.data.machine, parsed.data.authoring)) return null;
  return parsed.data;
}

/** Parse and validate a closed, fully authored v3 cut map. */
export function parseV3DecomposeCutMap(input: unknown): V3DecomposeCutMap | null {
  const parsed = V3DecomposeCutMapSchema.safeParse(input);
  if (!parsed.success || !machineIsCanonical(parsed.data.machine)
    || !identityArraysMatch(parsed.data.machine, parsed.data.authoring)) return null;
  const { authoring } = parsed.data;
  const destinationIds = authoring.destinations.map(({ destinationId }) => destinationId);
  const internalIds = authoring.internalEdges.map(({ from, to }) => `${from}\0${to}`);
  const newCount = authoring.destinations.filter(({ kind }) => kind === "new-member").length;
  const existingCount = authoring.destinations.filter(({ kind }) => kind === "existing-home").length;
  if (!ordered(destinationIds) || !ordered(internalIds)
    || authoring.incomingDispositions.some(({ disposition }) =>
      disposition.kind === "replace" && !ordered(disposition.replacementTargets))
    || authoring.outgoingDispositions.some(({ disposition }) =>
      disposition.kind === "targets" && !ordered(disposition.targets))
    || (authoring.shape === "symmetric" && (newCount < 2 || existingCount !== 0))
    || (authoring.shape === "heterogeneous" && (newCount < 1 || existingCount < 1))) return null;
  return parsed.data;
}

/** Build the starter author slots from one canonical machine envelope. */
export function createV3DecomposeStarterMap(machine: V3DecomposeMachine): V3DecomposeStarterMap | null {
  if (!machineIsCanonical(machine)) return null;
  const author = { status: "author" } as const;
  return {
    schemaVersion: 3,
    machine,
    authoring: {
      shape: author,
      placement: author,
      destinations: author,
      internalEdges: author,
      sourceAllocations: machine.sourceUnits.map(({ sourceId }) => ({
        sourceId,
        ownership: author,
        disposition: author,
      })),
      incomingDispositions: machine.incomingEdges.map(({ edgeId }) => ({ edgeId, disposition: author })),
      outgoingDispositions: machine.outgoingEdges.map(({ edgeId }) => ({ edgeId, disposition: author })),
    },
  };
}

/** Return a canonical UTF-8 ordered copy of a string identity set. */
export function canonicalV3Identities(values: readonly string[]): string[] | null {
  if (new Set(values).size !== values.length) return null;
  return sortByCanonicalBytes(values);
}
