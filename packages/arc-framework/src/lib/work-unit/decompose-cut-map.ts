/**
 * Versioned decomposition allocation-map adapter and canonical normalization.
 *
 * The schema module owns structural and graph validity. This module preserves
 * the public no-throw decoder, compatibility aliases, ordering, and the
 * separate retirement-policy decision.
 */

import { sortByCanonicalBytes } from "../canonical/canonical-json.js";
import {
  DecomposeAllocationMapSchema,
  DecomposeContentLocatorSchema,
  type DecomposeAllocationEntry,
  type DecomposeAllocationMap,
  type DecomposeContentLocator,
} from "./decompose-cut-map-schema.js";

export type {
  CohortCoordinationEntry,
  DecomposeAllocationEntry,
  DecomposeAllocationMap,
  DecomposeContentLocator,
  DecomposeEdgeDisposition,
  DecomposeExistingTarget,
  DecomposeIncomingEdgeDisposition,
  DecomposeSourceDisposition,
  DecomposeSourceOwnership,
  ExistingHomeEntry,
  ExistingHomeKind,
  IncomingEdge,
  InternalEdge,
  NewMemberEntry,
  OriginDisposition,
  OriginLocation,
  OriginPosition,
  OutgoingEdge,
  ParentPosition,
  SourceAllocation,
  SurvivingOriginEntry,
  TransformShape,
} from "./decompose-cut-map-schema.js";

export const DECOMPOSE_SCHEMA_VERSION = 2;

/** Compatibility name retained for allocation entries. */
export type CutEntry = DecomposeAllocationEntry;
/** Compatibility name retained for the executor and command boundary. */
export type DecomposeParams = DecomposeAllocationMap;

export type CutMapParseResult =
  | { status: "rejected"; reason: string }
  | { status: "parsed"; params: DecomposeAllocationMap };

function compareCanonicalStrings(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

/** Decode one closed, normalized content locator at an untrusted boundary. */
export function parseDecomposeContentLocator(input: unknown): DecomposeContentLocator | null {
  const parsed = DecomposeContentLocatorSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

/** Derive the exact dependency list scaffolded for one new member. */
export function newMemberDependencies(
  map: Pick<DecomposeAllocationMap, "internalEdges" | "outgoingEdges">,
  slug: string,
): string[] {
  const dependencies = map.outgoingEdges
    .filter((edge) => edge.disposition.kind === "targets"
      && edge.disposition.targets.some((target) => target === slug))
    .map((edge) => edge.prerequisite);
  for (const edge of map.internalEdges) {
    if (edge.from === slug && !dependencies.includes(edge.to)) dependencies.push(edge.to);
  }
  return dependencies;
}

interface ValidationIssue {
  code: string;
  message: string;
  path: PropertyKey[];
  keys?: string[];
}

function issueLabel(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "cut-map";
  const [root, index, ...rest] = path;
  const indexed = typeof index === "number"
    ? `${String(root).replace(/([A-Z])/gu, " $1").toLowerCase().replace(/s$/u, "")} ${index}`
    : String(root);
  const suffix = (typeof index === "number" ? rest : path.slice(1)).map(String).join(".");
  return suffix === "" ? indexed : `${indexed}.${suffix}`;
}

function issueReason(issue: ValidationIssue): string {
  const label = issueLabel(issue.path);
  if (issue.code === "unrecognized_keys") {
    return `${label} has unknown field \`${issue.keys?.[0] ?? "unknown"}\`.`;
  }
  const last = String(issue.path.at(-1) ?? "");
  if (last === "slug" || last === "dependent" || last === "prerequisite" || last === "from" || last === "to") {
    return `${label} must be slug-safe.`;
  }
  if (last === "phase") return "origin.phase must be Planning or Active.";
  if (last === "workClass") return `${label} requires a resolved Class.`;
  if (last === "kind" && issue.message.includes("Invalid input")) return `${label} has an unknown kind.`;
  return `${label} ${issue.message.replace(/\.$/u, "")}.`;
}

function normalizeCutMap(map: DecomposeAllocationMap): DecomposeAllocationMap {
  return {
    ...map,
    entries: [...map.entries].sort((left, right) => compareCanonicalStrings(left.destinationId, right.destinationId)),
    internalEdges: [...map.internalEdges].sort(
      (left, right) => compareCanonicalStrings(left.from, right.from) || compareCanonicalStrings(left.to, right.to),
    ),
    sourceAllocations: [...map.sourceAllocations].sort(
      (left, right) => compareCanonicalStrings(left.sourceId, right.sourceId),
    ),
    incomingEdges: [...map.incomingEdges]
      .map((edge) => edge.disposition.kind === "replace"
        ? { ...edge, disposition: { ...edge.disposition, replacementTargets: sortByCanonicalBytes(edge.disposition.replacementTargets) } }
        : edge)
      .sort((left, right) => compareCanonicalStrings(left.dependent, right.dependent)),
    outgoingEdges: [...map.outgoingEdges]
      .map((edge) => edge.disposition.kind === "targets"
        ? { ...edge, disposition: { ...edge.disposition, targets: sortByCanonicalBytes(edge.disposition.targets) } }
        : edge)
      .sort((left, right) => compareCanonicalStrings(left.prerequisite, right.prerequisite)),
  };
}

/** Validate an untrusted decoded allocation map without throwing. */
export function parseCutMap(input: unknown): CutMapParseResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { status: "rejected", reason: "cut-map must be an object." };
  }
  const version = (input as Record<string, unknown>).schemaVersion;
  if (version === 1) {
    return {
      status: "rejected",
      reason: "upgrade cut-map to version 2: replace receives/dependsOn with sourceAllocations, incomingEdges, and outgoingEdges.",
    };
  }
  if (version !== DECOMPOSE_SCHEMA_VERSION) {
    return { status: "rejected", reason: "unrecognized cut-map `schemaVersion` (expected 2)." };
  }

  const parsed = DecomposeAllocationMapSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "rejected", reason: issueReason(parsed.error.issues[0] as ValidationIssue) };
  }
  return { status: "parsed", params: normalizeCutMap(parsed.data) };
}

/** Check retirement-only allocation and approved ownership constraints. */
export function retirementAllocationRefusal(map: DecomposeAllocationMap): string | null {
  if (map.shape === "extraction" || map.entries.some((entry) => entry.kind === "surviving-origin")) {
    return "a surviving origin cannot authorize retirement.";
  }
  const destinations = new Map(map.entries.map((entry) => [entry.destinationId, entry]));
  for (const allocation of map.sourceAllocations) {
    const destination = allocation.disposition.kind === "target"
      ? destinations.get(allocation.disposition.destinationId)
      : undefined;
    if (allocation.ownership === "cohort-shared" && destination?.kind !== "cohort-coordination") {
      return `ownerless shared material \`${allocation.sourceId}\` requires a cohort-coordination destination.`;
    }
    if (allocation.ownership === "destination-owned" && destination?.kind === "cohort-coordination") {
      return `cohort-coordination destination requires \`cohort-shared\` ownership for \`${allocation.sourceId}\`.`;
    }
  }
  return null;
}
