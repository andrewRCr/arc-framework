/** Pure reporting projection over immutable plan provenance and materializer outcomes. */

import type {
  V3MaterializationResult,
  V3MaterializedPath,
} from "./decompose-v3-materializer.js";
import type {
  V3PlanContentContributor,
  V3ValidatedPathMutation,
  ValidatedDecomposePlan,
} from "./decompose-v3-plan.js";
import type { CanonicalDigest } from "../canonical/canonical-json.js";

export type V3ReportedPathDisposition =
  | "applied"
  | "already-applied"
  | "refused-conflict";

export interface V3ReportedTopologyOutcome {
  kind: "topology";
  action: "none" | "create" | "ensure" | "backfill" | "reuse" | "append";
  path?: string;
  disposition: V3ReportedPathDisposition | "no-write";
}

export interface V3ReportedDestinationOutcome {
  kind: "destination";
  path: string;
  destinationId: string;
  destinationKind: V3PlanContentContributor["destinationKind"];
  authoring: {
    artifactRole: string;
    contributorKind: string;
    disposition: V3PlanContentContributor["disposition"];
  };
  disposition: V3ReportedPathDisposition;
}

export interface V3ReportedPathOutcome {
  path: string;
  disposition: V3ReportedPathDisposition;
  mutation: V3ValidatedPathMutation;
}

export interface V3DecomposeResultReport {
  status: "reported" | "refused";
  paths: V3ReportedPathOutcome[];
  topology: V3ReportedTopologyOutcome[];
  destinations: V3ReportedDestinationOutcome[];
  extraction?: V3ExtractionReportFacts;
}

/** Authored extraction facts carried from the immutable repository projection. */
export interface V3ExtractionReportFacts {
  retainedOrigin: {
    origin: string;
    path: string;
    allocations: Array<{
      sourceId: CanonicalDigest;
      ownership: "destination-owned";
    }>;
  };
  reasonedDrops: Array<{
    sourceId: CanonicalDigest;
    ownership: "destination-owned";
    reason: string;
  }>;
  anchor: {
    kind: "surviving-origin";
    origin: string;
    path: string;
  };
}

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
