/** Cross-path projections used while composing v3 repository plans. */

import { SlugSchema } from "../kernel/index.js";
import type { WorkUnitPlacement } from "../layout/index.js";
import type { V3DecomposeLiveWorkUnit } from "./decompose-v3-conservation.js";
import type { V3ExtractionReportFacts } from "./decompose-v3-result-report.js";
import type { V3DecomposeCutMap } from "./decompose-v3-schema.js";
import type { TreeMeta } from "./decompose-v3-repository-tree.js";

export function memberPlacement(map: V3DecomposeCutMap): WorkUnitPlacement {
  const placement = map.authoring.placement;
  const cohort = placement.kind === "direct-member"
    ? []
    : (placement.kind === "at-cap" ? placement.parent : placement.cohort).split("/");
  return {
    kind: "backlog",
    commitment: "planned",
    cohort: cohort.length === 0
      ? []
      : cohort.length === 1
        ? [SlugSchema.parse(cohort[0])]
        : [SlugSchema.parse(cohort[0]), SlugSchema.parse(cohort[1])],
  };
}

export function liveWorkUnits(
  sourceMetas: readonly TreeMeta[],
  baseMetas: readonly TreeMeta[],
): V3DecomposeLiveWorkUnit[] {
  const writable = new Map(baseMetas.map((meta) => [meta.slug, meta.path]));
  return sourceMetas.map((meta) => ({
    slug: meta.slug,
    dependsOn: [...meta.record.dependsOn],
    ...(writable.get(meta.slug) === undefined ? {} : { writablePath: writable.get(meta.slug) }),
  }));
}

export function extractionFacts(
  map: V3DecomposeCutMap,
  sourceMetaPath: string,
): V3ExtractionReportFacts {
  const retainedOrigin = map.authoring.sourceAllocations.flatMap((allocation) =>
    allocation.disposition.kind === "retained-origin"
      ? [{ sourceId: allocation.sourceId, ownership: "destination-owned" as const }]
      : []);
  const reasonedDrops = map.authoring.sourceAllocations.flatMap((allocation) =>
    allocation.disposition.kind === "drop"
      ? [{
          sourceId: allocation.sourceId,
          ownership: "destination-owned" as const,
          reason: allocation.disposition.reason,
        }]
      : []);
  return {
    retainedOrigin: {
      origin: map.machine.source.origin,
      path: sourceMetaPath,
      allocations: retainedOrigin,
    },
    reasonedDrops,
    anchor: {
      kind: "surviving-origin",
      origin: map.machine.source.origin,
      path: sourceMetaPath,
    },
  };
}
