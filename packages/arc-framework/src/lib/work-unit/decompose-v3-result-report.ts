/** Pure reporting projection over immutable plan provenance and materializer outcomes. */

import { z } from "zod";

import type {
  V3MaterializationResult,
  V3MaterializedPath,
} from "./decompose-v3-materializer.js";
import {
  V3ValidatedPathMutationSchema,
  type ValidatedDecomposePlan,
} from "./decompose-v3-plan.js";
import { isCanonicalDigest, type CanonicalDigest } from "../canonical/canonical-json.js";

const CanonicalDigestSchema = z.custom<CanonicalDigest>(
  isCanonicalDigest,
  "must be a canonical digest",
);
const NonEmptyStringSchema = z.string().min(1);

/** Authored extraction facts carried from the immutable repository projection. */
export const V3ExtractionReportFactsSchema = z.strictObject({
  retainedOrigin: z.strictObject({
    origin: NonEmptyStringSchema,
    path: NonEmptyStringSchema,
    allocations: z.array(z.strictObject({
      sourceId: CanonicalDigestSchema,
      ownership: z.literal("destination-owned"),
    })),
  }),
  reasonedDrops: z.array(z.strictObject({
    sourceId: CanonicalDigestSchema,
    ownership: z.literal("destination-owned"),
    reason: NonEmptyStringSchema,
  })),
  anchor: z.strictObject({
    kind: z.literal("surviving-origin"),
    origin: NonEmptyStringSchema,
    path: NonEmptyStringSchema,
  }),
});
export type V3ExtractionReportFacts = z.infer<typeof V3ExtractionReportFactsSchema>;

/** Materializer disposition exposed for one planned path. */
export const V3ReportedPathDispositionSchema = z.enum([
  "applied",
  "already-applied",
  "refused-conflict",
]);
export type V3ReportedPathDisposition = z.infer<typeof V3ReportedPathDispositionSchema>;

/** One strict constitutive-topology reporting outcome. */
export const V3ReportedTopologyOutcomeSchema = z.union([
  z.strictObject({
    kind: z.literal("topology"),
    action: z.literal("none"),
    disposition: z.literal("no-write"),
  }),
  z.strictObject({
    kind: z.literal("topology"),
    action: z.literal("reuse"),
    path: NonEmptyStringSchema,
    disposition: z.literal("no-write"),
  }),
  z.strictObject({
    kind: z.literal("topology"),
    action: z.enum(["create", "ensure", "backfill", "append"]),
    path: NonEmptyStringSchema,
    disposition: V3ReportedPathDispositionSchema,
  }),
]);
export type V3ReportedTopologyOutcome = z.infer<typeof V3ReportedTopologyOutcomeSchema>;

/** One strict destination provenance outcome. */
export const V3ReportedDestinationOutcomeSchema = z.strictObject({
  kind: z.literal("destination"),
  path: NonEmptyStringSchema,
  destinationId: NonEmptyStringSchema,
  destinationKind: z.enum(["new-member", "existing-home", "cohort-coordination"]),
  authoring: z.strictObject({
    artifactRole: NonEmptyStringSchema,
    contributorKind: NonEmptyStringSchema,
    disposition: z.enum(["whole-file", "patch"]),
  }),
  disposition: V3ReportedPathDispositionSchema,
});
export type V3ReportedDestinationOutcome = z.infer<typeof V3ReportedDestinationOutcomeSchema>;

/** One strict mutation outcome in the result report. */
export const V3ReportedPathOutcomeSchema = z.strictObject({
  path: NonEmptyStringSchema,
  disposition: V3ReportedPathDispositionSchema,
  mutation: V3ValidatedPathMutationSchema,
});
export type V3ReportedPathOutcome = z.infer<typeof V3ReportedPathOutcomeSchema>;

/** Closed runtime schema for a report preserved on staged and refused operations. */
export const V3DecomposeResultReportSchema = z.strictObject({
  status: z.enum(["reported", "refused"]),
  paths: z.array(V3ReportedPathOutcomeSchema),
  topology: z.array(V3ReportedTopologyOutcomeSchema),
  destinations: z.array(V3ReportedDestinationOutcomeSchema),
  extraction: V3ExtractionReportFactsSchema.optional(),
});
export type V3DecomposeResultReport = z.infer<typeof V3DecomposeResultReportSchema>;

function materializedPathMap(paths: readonly V3MaterializedPath[]): Map<string, V3MaterializedPath> {
  return new Map(paths.map((path) => [path.path, path]));
}

function pathDisposition(
  path: string,
  materialization: V3MaterializationResult,
  materialized: ReadonlyMap<string, V3MaterializedPath>,
): V3ReportedPathDisposition | null {
  if (materialization.status === "refused") {
    return materialization.reason === "path-conflict" && materialization.path === path
      ? "refused-conflict"
      : null;
  }
  return materialized.get(path)?.disposition ?? null;
}

/**
 * Join materializer dispositions to the exact topology and destination provenance retained by the plan.
 *
 * @param plan - Immutable result plan consumed by the materializer.
 * @param materialization - Outcome returned for that same plan.
 * @returns Structured path, topology, and destination outcomes without live re-derivation.
 */
export function reportV3DecomposeResult(
  plan: ValidatedDecomposePlan,
  materialization: V3MaterializationResult,
  extraction?: V3ExtractionReportFacts,
): V3DecomposeResultReport {
  const materialized = materialization.status === "materialized"
    ? materializedPathMap(materialization.paths)
    : new Map<string, V3MaterializedPath>();
  const paths: V3ReportedPathOutcome[] = [];
  const destinations: V3ReportedDestinationOutcome[] = [];

  for (const mutation of plan.mutations) {
    const disposition = pathDisposition(mutation.path, materialization, materialized);
    if (disposition === null) continue;
    paths.push({ path: mutation.path, disposition, mutation });
    if (mutation.kind !== "composed") continue;
    for (const contributor of mutation.contributors) {
      if (contributor.kind !== "content") continue;
      destinations.push({
        kind: "destination",
        path: mutation.path,
        destinationId: contributor.destinationId,
        destinationKind: contributor.destinationKind,
        authoring: {
          artifactRole: contributor.artifactRole,
          contributorKind: contributor.contributorKind,
          disposition: contributor.disposition,
        },
        disposition,
      });
    }
  }

  const topology: V3ReportedTopologyOutcome[] = [];
  for (const fact of plan.topology.facts) {
    if (fact.kind === "none") {
      topology.push({ kind: "topology", action: "none", disposition: "no-write" });
      continue;
    }
    if (fact.kind === "reuse") {
      topology.push({
        kind: "topology",
        action: "reuse",
        path: fact.path,
        disposition: "no-write",
      });
      continue;
    }
    const disposition = pathDisposition(fact.path, materialization, materialized);
    if (disposition !== null) {
      topology.push({
        kind: "topology",
        action: fact.kind,
        path: fact.path,
        disposition,
      });
    }
  }

  return {
    status: materialization.status === "materialized" ? "reported" : "refused",
    paths,
    topology,
    destinations,
    ...(extraction === undefined ? {} : { extraction: structuredClone(extraction) }),
  };
}
