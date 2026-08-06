/** Dormant, pure projection of the future unified checkout occupancy marker. */

import { SlugSchema } from "../kernel/index.js";
import {
  LocusAbsolutePathSchema,
  LocusDigestSchema,
  LocusOpaqueTextSchema,
  LocusTokenSchema,
} from "./schema/limits.js";

export type OccupancySubject =
  | { readonly kind: "work-unit"; readonly name: string }
  | { readonly kind: "partial-errand"; readonly slug: string; readonly claimId: null }
  | {
      readonly kind: "errand" | "groom" | "housekeep";
      readonly slug: string;
      readonly claimId: string;
    };

type OriginBinding =
  | { readonly originEntry?: never; readonly originEntrySourceDigest?: never }
  | { readonly originEntry: string; readonly originEntrySourceDigest: string };

interface TransientOccupancyMarkerBase {
  readonly spawnedByArc: boolean;
  readonly provisioning: "pending" | "ready";
  readonly parentCheckoutPath?: string;
}

/** Marker projection carrying transient checkout occupancy. */
export type TransientOccupancyMarker =
  | (TransientOccupancyMarkerBase & {
      readonly createdFor: Exclude<OccupancySubject, { kind: "work-unit" | "partial-errand" }>;
      readonly originEntry?: never;
      readonly originEntrySourceDigest?: never;
    })
  | (TransientOccupancyMarkerBase & {
      readonly createdFor: Extract<OccupancySubject, { kind: "partial-errand" }>;
    } & OriginBinding);

/** Future marker value; deliberately separate from the selected live marker contract. */
export type OccupancyMarker =
  | {
      readonly spawnedByArc: true;
      readonly createdFor: Extract<OccupancySubject, { kind: "work-unit" }>;
      readonly provisioning?: never;
      readonly parentCheckoutPath?: never;
      readonly originEntry?: never;
      readonly originEntrySourceDigest?: never;
    }
  | TransientOccupancyMarker;

/** Pure marker decode result. */
export type OccupancyMarkerParseResult =
  | { readonly kind: "valid"; readonly marker: OccupancyMarker }
  | { readonly kind: "malformed"; readonly message: string };

/** Parse the dormant marker projection without touching the filesystem. */
export function parseOccupancyMarker(content: string): OccupancyMarkerParseResult {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return { kind: "malformed", message: "Occupancy marker is not valid JSON" };
  }
  if (!isRecord(value)) return { kind: "malformed", message: "Occupancy marker has an invalid shape" };
  const subject = isRecord(value.createdFor) ? value.createdFor : null;
  const identityBacked = subject !== null
    && (subject.kind === "errand" || subject.kind === "groom" || subject.kind === "housekeep")
    && SlugSchema.safeParse(subject.slug).success
    && LocusTokenSchema.safeParse(subject.claimId).success;
  const partial = subject !== null
    && subject.kind === "partial-errand"
    && SlugSchema.safeParse(subject.slug).success
    && subject.claimId === null;
  const workUnit = subject !== null
    && subject.kind === "work-unit"
    && SlugSchema.safeParse(subject.name).success;
  const hasOriginEntry = value.originEntry !== undefined;
  const hasOriginDigest = value.originEntrySourceDigest !== undefined;
  const originValid = partial
    ? hasOriginEntry === hasOriginDigest
      && (!hasOriginEntry
        || (LocusOpaqueTextSchema.safeParse(value.originEntry).success
          && LocusDigestSchema.safeParse(value.originEntrySourceDigest).success))
    : !hasOriginEntry && !hasOriginDigest;
  const occupancyFieldsValid = workUnit
    ? value.spawnedByArc === true
      && value.provisioning === undefined
      && value.parentCheckoutPath === undefined
    : (value.provisioning === "pending" || value.provisioning === "ready")
      && (value.parentCheckoutPath === undefined
        || LocusAbsolutePathSchema.safeParse(value.parentCheckoutPath).success);
  const subjectKeysValid = subject !== null && keysEqual(
    subject,
    workUnit ? ["kind", "name"] : ["claimId", "kind", "slug"],
  );
  const markerKeys = ["createdFor", "spawnedByArc"];
  if (!workUnit) {
    markerKeys.push("provisioning");
    if (value.parentCheckoutPath !== undefined) markerKeys.push("parentCheckoutPath");
    if (hasOriginEntry) markerKeys.push("originEntry", "originEntrySourceDigest");
  }
  if (typeof value.spawnedByArc !== "boolean"
    || (!identityBacked && !partial && !workUnit)
    || !occupancyFieldsValid
    || !originValid
    || !subjectKeysValid
    || !keysEqual(value, markerKeys)) {
    return { kind: "malformed", message: "Occupancy marker has an invalid shape" };
  }
  return { kind: "valid", marker: value as OccupancyMarker };
}

/** Serialize one already-validated dormant marker projection. */
export function serializeOccupancyMarker(marker: OccupancyMarker): string {
  return `${JSON.stringify(marker, null, 2)}\n`;
}

/** Validate spawn provenance only where physical-primary topology is available. */
export function validateOccupancyMarkerTopology(
  marker: OccupancyMarker,
  topology: { readonly primary: boolean },
): { readonly kind: "valid"; readonly marker: OccupancyMarker }
  | { readonly kind: "unresolved"; readonly reason: "spawn-topology-mismatch" } {
  return marker.spawnedByArc === topology.primary
    ? { kind: "unresolved", reason: "spawn-topology-mismatch" }
    : { kind: "valid", marker };
}

/** Project a pending transient marker to ready without mutating its input. */
export function readyOccupancyMarker(
  marker: TransientOccupancyMarker,
): { readonly kind: "replace-marker"; readonly marker: TransientOccupancyMarker }
  | { readonly kind: "unchanged"; readonly marker: TransientOccupancyMarker } {
  return marker.provisioning === "ready"
    ? { kind: "unchanged", marker }
    : { kind: "replace-marker", marker: { ...marker, provisioning: "ready" } };
}

/** Project terminal transient cleanup without inventing a persisted terminal state. */
export function removeTerminalOccupancy(
  marker: TransientOccupancyMarker,
): { readonly kind: "remove-marker" } {
  void marker;
  return { kind: "remove-marker" };
}

/** Project promotion into spawned WU ownership or primary-marker removal. */
export function promoteOccupancyMarker(
  marker: TransientOccupancyMarker,
  workUnitName: string,
): { readonly kind: "replace-marker"; readonly marker: OccupancyMarker }
  | { readonly kind: "remove-marker" } {
  return marker.spawnedByArc
    ? {
        kind: "replace-marker",
        marker: { spawnedByArc: true, createdFor: { kind: "work-unit", name: workUnitName } },
      }
    : { kind: "remove-marker" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keysEqual(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}
