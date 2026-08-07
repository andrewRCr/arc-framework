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
]).superRefine((locator, ctx) => {
  if (locator.kind !== "section") return;
  let previousLevel = 1;
  for (let index = 0; index < locator.ancestry.length; index += 1) {
    const ancestor = locator.ancestry[index];
    if (ancestor !== undefined
      && (ancestor.level <= previousLevel || ancestor.level >= locator.level)) {
      ctx.addIssue({
        code: "custom",
        message: "ancestry levels must increase strictly and remain below the section level",
        path: ["ancestry", index, "level"],
      });
    }
    if (ancestor !== undefined) previousLevel = ancestor.level;
  }
});

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
const SourceArtifactEntrySchema = z.strictObject({
  path: ManagedPathSchema,
  objectKind: z.literal("blob"),
  mode: z.enum(["100644", "100755"]),
  contentDigest: DigestSchema,
});

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
  z.strictObject({ kind: z.literal("cohort"), cohort: TopLevelCohortPathSchema }),
  z.strictObject({ kind: z.literal("subcohort"), cohort: NestedCohortPathSchema }),
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

export interface V3DecomposeMapIssue {
  code:
    | "invalid-structure"
    | "incomplete-authoring"
    | "machine-order"
    | "machine-identity"
    | "authoring-identity"
    | "authoring-order"
    | "placement-cardinality"
    | "shape-cardinality";
  path: string;
  message: string;
}

export type V3DecomposeCutMapDecodeResult =
  | { status: "accepted"; value: V3DecomposeCutMap }
  | { status: "rejected"; issue: V3DecomposeMapIssue };

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
  const preimage = IncomingEdgeSchema.omit({ edgeId: true }).parse(edge);
  return canonicalDigest({ schemaVersion: 3, kind: "incoming", ...preimage });
}

/** Canonical identity for one outgoing dependency edge. */
export function v3OutgoingEdgeId(edge: { prerequisite: string }): CanonicalDigest {
  const preimage = OutgoingEdgeSchema.omit({ edgeId: true }).parse(edge);
  return canonicalDigest({ schemaVersion: 3, kind: "outgoing", ...preimage });
}

/** Canonical identity for one source allocation unit. */
export function v3SourceId(source: {
  sourcePath: string;
  sourceLocator: z.infer<typeof V3DecomposeLocatorSchema>;
}): CanonicalDigest {
  const preimage = z.strictObject({
    sourcePath: ManagedPathSchema,
    sourceLocator: V3DecomposeLocatorSchema,
  }).parse(source);
  return canonicalDigest({ schemaVersion: 3, ...preimage });
}

/** Canonical identity for the machine-owned decomposition preflight. */
export function v3PreflightId(machine: Omit<V3DecomposeMachine, "preflightId">): CanonicalDigest {
  const preimage = MachineSchema.omit({ preflightId: true }).parse(machine);
  return canonicalDigest({ schemaVersion: 3, ...preimage });
}

/** Digest one exact completed cut map. */
export function v3CutMapDigest(map: V3DecomposeCutMap): CanonicalDigest {
  return canonicalDigest(V3DecomposeCutMapSchema.parse(map));
}

/** Digest the canonical complete authorization path set. */
export function v3AllowedPathsDigest(paths: readonly string[]): CanonicalDigest | null {
  return ordered(paths) ? canonicalDigest(paths) : null;
}

/** Digest the complete stored-blob source artifact inventory. */
export function v3SourceArtifactDigest(entries: readonly V3SourceArtifactEntry[]): CanonicalDigest | null {
  const parsed = z.array(SourceArtifactEntrySchema).safeParse(entries);
  if (!parsed.success || !ordered(parsed.data.map(({ path }) => path))) return null;
  return canonicalDigest({ schemaVersion: 3, kind: "source-artifact-inventory", entries: parsed.data });
}

/** Digest the immutable machine source-unit inventory. */
export function v3SourceInventoryDigest(machine: V3DecomposeMachine): CanonicalDigest {
  const entries = z.array(SourceUnitSchema).parse(machine.sourceUnits);
  return canonicalDigest({ schemaVersion: 3, kind: "source-unit-inventory", entries });
}

/** Digest the immutable machine incoming-edge inventory. */
export function v3IncomingEdgeInventoryDigest(machine: V3DecomposeMachine): CanonicalDigest {
  const entries = z.array(IncomingEdgeSchema).parse(machine.incomingEdges);
  return canonicalDigest({ schemaVersion: 3, kind: "incoming-edge-inventory", entries });
}

/** Digest the immutable machine outgoing-edge inventory. */
export function v3OutgoingEdgeInventoryDigest(machine: V3DecomposeMachine): CanonicalDigest {
  const entries = z.array(OutgoingEdgeSchema).parse(machine.outgoingEdges);
  return canonicalDigest({ schemaVersion: 3, kind: "outgoing-edge-inventory", entries });
}

function valueAtPath(input: unknown, path: PropertyKey[]): unknown {
  let value = input;
  for (const part of path) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<PropertyKey, unknown>)[part];
  }
  return value;
}

function formatPath(path: PropertyKey[]): string {
  return path.map(String).join(".");
}

function structuralIssue(input: unknown, error: z.ZodError): V3DecomposeMapIssue {
  const first = error.issues[0];
  const path = first?.path ?? [];
  for (let length = path.length; length >= 0; length -= 1) {
    const candidatePath = path.slice(0, length);
    const value = valueAtPath(input, candidatePath);
    if (typeof value === "object" && value !== null
      && (value as { status?: unknown }).status === "author") {
      const locus = formatPath(candidatePath);
      return {
        code: "incomplete-authoring",
        path: locus,
        message: `Replace the author slot at ${locus} with a complete closed value.`,
      };
    }
  }
  return {
    code: "invalid-structure",
    path: formatPath(path),
    message: first?.message ?? "The completed cut map is not structurally valid.",
  };
}

function machineIssue(machine: V3DecomposeMachine): V3DecomposeMapIssue | null {
  const sourceIds = machine.sourceUnits.map(({ sourceId }) => sourceId);
  if (!ordered(sourceIds)) return {
    code: "machine-order",
    path: "machine.sourceUnits",
    message: "Keep machine source units in unique UTF-8 sourceId order.",
  };
  const incomingIds = machine.incomingEdges.map(({ edgeId }) => edgeId);
  if (!ordered(incomingIds)) return {
    code: "machine-order",
    path: "machine.incomingEdges",
    message: "Keep machine incoming edges in unique UTF-8 edgeId order.",
  };
  const outgoingIds = machine.outgoingEdges.map(({ edgeId }) => edgeId);
  if (!ordered(outgoingIds)) return {
    code: "machine-order",
    path: "machine.outgoingEdges",
    message: "Keep machine outgoing edges in unique UTF-8 edgeId order.",
  };
  const sourceIndex = machine.sourceUnits.findIndex((unit) => unit.sourceId !== v3SourceId({
    sourcePath: unit.sourcePath,
    sourceLocator: unit.sourceLocator,
  }));
  if (sourceIndex >= 0) return {
    code: "machine-identity",
    path: `machine.sourceUnits.${sourceIndex}.sourceId`,
    message: "Restore the machine-derived sourceId; author only fields under authoring.",
  };
  const incomingIndex = machine.incomingEdges.findIndex((edge) =>
    !ordered(edge.currentTargets)
    || edge.edgeId !== v3IncomingEdgeId({ dependent: edge.dependent, currentTargets: edge.currentTargets }));
  if (incomingIndex >= 0) return {
    code: "machine-identity",
    path: `machine.incomingEdges.${incomingIndex}`,
    message: "Restore the machine-derived incoming edge and its unique UTF-8 target order.",
  };
  const outgoingIndex = machine.outgoingEdges.findIndex((edge) =>
    edge.edgeId !== v3OutgoingEdgeId({ prerequisite: edge.prerequisite }));
  if (outgoingIndex >= 0) return {
    code: "machine-identity",
    path: `machine.outgoingEdges.${outgoingIndex}`,
    message: "Restore the machine-derived outgoing edge; author only its disposition.",
  };
  const expectedPreflightId = v3PreflightId({
    source: machine.source,
    resultBase: machine.resultBase,
    planningProfile: machine.planningProfile,
    sourceUnits: machine.sourceUnits,
    incomingEdges: machine.incomingEdges,
    outgoingEdges: machine.outgoingEdges,
  });
  return machine.preflightId === expectedPreflightId ? null : {
    code: "machine-identity",
    path: "machine.preflightId",
    message: "Restore the complete machine envelope emitted by preflight.",
  };
}

function machineIsCanonical(machine: V3DecomposeMachine): boolean {
  return machineIssue(machine) === null;
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
  const result = decodeV3DecomposeCutMap(input);
  return result.status === "accepted" ? result.value : null;
}

/** Decode a completed map with one deterministic author-actionable refusal. */
export function decodeV3DecomposeCutMap(input: unknown): V3DecomposeCutMapDecodeResult {
  const parsed = V3DecomposeCutMapSchema.safeParse(input);
  if (!parsed.success) return { status: "rejected", issue: structuralIssue(input, parsed.error) };
  const invalidMachine = machineIssue(parsed.data.machine);
  if (invalidMachine !== null) return { status: "rejected", issue: invalidMachine };
  const identityPairs = [
    ["sourceAllocations", parsed.data.machine.sourceUnits.map(({ sourceId }) => sourceId),
      parsed.data.authoring.sourceAllocations.map(({ sourceId }) => sourceId)],
    ["incomingDispositions", parsed.data.machine.incomingEdges.map(({ edgeId }) => edgeId),
      parsed.data.authoring.incomingDispositions.map(({ edgeId }) => edgeId)],
    ["outgoingDispositions", parsed.data.machine.outgoingEdges.map(({ edgeId }) => edgeId),
      parsed.data.authoring.outgoingDispositions.map(({ edgeId }) => edgeId)],
  ] as const;
  const invalidIdentityPair = identityPairs.find(([, machineIds, authorIds]) =>
    machineIds.join("\0") !== authorIds.join("\0"));
  if (invalidIdentityPair !== undefined) return {
    status: "rejected",
    issue: {
      code: "authoring-identity",
      path: `authoring.${invalidIdentityPair[0]}`,
      message: "Preserve every machine identity exactly once and in machine order; edit only its authored value.",
    },
  };
  const { authoring } = parsed.data;
  const destinationIds = authoring.destinations.map(({ destinationId }) => destinationId);
  const internalIds = authoring.internalEdges.map(({ from, to }) => `${from}\0${to}`);
  const newCount = authoring.destinations.filter(({ kind }) => kind === "new-member").length;
  const existingCount = authoring.destinations.filter(({ kind }) => kind === "existing-home").length;
  const unorderedPath = !ordered(destinationIds) ? "authoring.destinations"
    : !ordered(internalIds) ? "authoring.internalEdges"
      : authoring.incomingDispositions.findIndex(({ disposition }) =>
        disposition.kind === "replace" && !ordered(disposition.replacementTargets)) >= 0
        ? "authoring.incomingDispositions"
        : authoring.outgoingDispositions.findIndex(({ disposition }) =>
          disposition.kind === "targets" && !ordered(disposition.targets)) >= 0
          ? "authoring.outgoingDispositions"
          : null;
  if (unorderedPath !== null) return {
    status: "rejected",
    issue: {
      code: "authoring-order",
      path: unorderedPath,
      message: "Keep authored identities unique and in canonical UTF-8 order.",
    },
  };
  const declaredDestinationIds = new Set(destinationIds);
  for (const [index, allocation] of authoring.sourceAllocations.entries()) {
    if (allocation.disposition.kind === "target"
      && !declaredDestinationIds.has(allocation.disposition.destinationId)) {
      return {
        status: "rejected",
        issue: {
          code: "authoring-identity",
          path: `authoring.sourceAllocations.${index}.disposition.destinationId`,
          message: "Reference one destinationId declared by authoring.destinations.",
        },
      };
    }
  }
  const dependencyRecipients = new Set(authoring.destinations.flatMap((destination) =>
    destination.kind === "new-member"
      ? [destination.slug]
      : destination.kind === "existing-home" && destination.target.kind === "work-unit"
        ? [destination.target.slug]
        : []));
  for (const [index, edge] of authoring.internalEdges.entries()) {
    for (const field of ["from", "to"] as const) {
      if (!dependencyRecipients.has(edge[field])) {
        return {
          status: "rejected",
          issue: {
            code: "authoring-identity",
            path: `authoring.internalEdges.${index}.${field}`,
            message: "Reference one dependency-capable destination declared by authoring.destinations.",
          },
        };
      }
    }
  }
  for (const [index, edge] of authoring.incomingDispositions.entries()) {
    if (edge.disposition.kind !== "replace") continue;
    for (const [targetIndex, target] of edge.disposition.replacementTargets.entries()) {
      if (!dependencyRecipients.has(target)) {
        return {
          status: "rejected",
          issue: {
            code: "authoring-identity",
            path: `authoring.incomingDispositions.${index}.disposition.replacementTargets.${targetIndex}`,
            message: "Reference one dependency-capable destination declared by authoring.destinations.",
          },
        };
      }
    }
  }
  for (const [index, edge] of authoring.outgoingDispositions.entries()) {
    if (edge.disposition.kind !== "targets") continue;
    for (const [targetIndex, target] of edge.disposition.targets.entries()) {
      if (!dependencyRecipients.has(target)) {
        return {
          status: "rejected",
          issue: {
            code: "authoring-identity",
            path: `authoring.outgoingDispositions.${index}.disposition.targets.${targetIndex}`,
            message: "Reference one dependency-capable destination declared by authoring.destinations.",
          },
        };
      }
    }
  }
  if ((authoring.shape === "symmetric" && (newCount < 2 || existingCount !== 0))
    || (authoring.shape === "heterogeneous" && (newCount < 1 || existingCount < 1))) return {
    status: "rejected",
    issue: {
      code: "shape-cardinality",
      path: "authoring.shape",
      message: authoring.shape === "symmetric"
        ? "A symmetric map needs at least two new members and no existing home."
        : "A heterogeneous map needs at least one new member and one existing home.",
    },
  };
  if ((authoring.placement.kind === "direct-member" && newCount !== 1)
    || (authoring.placement.kind !== "direct-member" && newCount < 2)) return {
    status: "rejected",
    issue: {
      code: "placement-cardinality",
      path: "authoring.placement",
      message: authoring.placement.kind === "direct-member"
        ? "Direct-member placement requires exactly one new member."
        : "Multiple-member placement requires at least two new members.",
    },
  };
  return { status: "accepted", value: parsed.data };
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
