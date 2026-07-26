/**
 * Read-only coordination facts shared by retirement-transform preparation.
 *
 * @module
 */

import { isAbsolute, relative, sep } from "node:path";

import type { ComposedLifecycleIndexResult } from "./composed-lifecycle-index.js";

/** One incoming edge classified by the transform's exact mutation authority. */
export interface TransformDependentPartition {
  dependent: string;
  authority: "shared-visible" | "branch-private" | "coordination-only";
  writablePath?: string;
  currentTreePath?: string;
}

/** One integrating dependent whose live edge makes an origin transform coordination-sensitive. */
export interface IntegratingDependentAdvisory {
  dependent: string;
  origin: string;
  writablePath?: string;
  text: string;
}

function sortByDependent<T extends { dependent: string }>(values: T[]): T[] {
  return values.sort((left, right) =>
    Buffer.compare(Buffer.from(left.dependent, "utf8"), Buffer.from(right.dependent, "utf8")));
}

/**
 * Partition live incoming edges without converting semantic visibility into write authority.
 *
 * @param composed - Remote-aware selected lifecycle truth plus optional current-tree authority
 * @param origin - Work unit the transform would retire or rename
 * @returns Stable incoming-edge partitions with exact current-tree paths when known
 */
export function partitionTransformDependents(
  composed: ComposedLifecycleIndexResult,
  origin: string,
): TransformDependentPartition[] {
  const partitions: TransformDependentPartition[] = [];
  for (const [dependent, record] of composed.recordsBySlug) {
    if (!record.selected.dependsOn.includes(origin)) continue;
    const currentTreePath = record.currentTree?.source.path;
    const authority = record.selected.state === "Integrating"
      ? "coordination-only"
      : record.writablePath === undefined ? "branch-private" : "shared-visible";
    partitions.push({
      dependent,
      authority,
      ...(record.writablePath === undefined ? {} : { writablePath: record.writablePath }),
      ...(currentTreePath === undefined ? {} : { currentTreePath }),
    });
  }
  return sortByDependent(partitions);
}

/**
 * Return current-tree paths that a transform may observe but must not mutate.
 *
 * @param composed - Remote-aware selected lifecycle truth plus optional current-tree authority
 * @param origin - Work unit the transform would retire or rename
 * @param cwd - Checkout root used to normalize absolute current-tree paths
 * @returns Stable checkout-relative paths for branch-private or coordination-only dependents
 */
export function transformDependentMutationExclusions(
  composed: ComposedLifecycleIndexResult,
  origin: string,
  cwd: string,
): string[] {
  return partitionTransformDependents(composed, origin).flatMap((partition) =>
    partition.authority === "shared-visible" || partition.currentTreePath === undefined
      ? []
      : [isAbsolute(partition.currentTreePath)
          ? relative(cwd, partition.currentTreePath).split(sep).join("/")
          : partition.currentTreePath]);
}

/**
 * Find live incoming edges owned by dependents already in integration.
 *
 * @param composed - Remote-aware selected lifecycle truth plus optional current-tree authority
 * @param origin - Work unit the transform would retire or rename
 * @returns Stable, slug-sorted advisories; no mutation authority is exercised
 */
export function findIntegratingDependentAdvisories(
  composed: ComposedLifecycleIndexResult,
  origin: string,
): IntegratingDependentAdvisory[] {
  return partitionTransformDependents(composed, origin)
    .filter((partition) => partition.authority === "coordination-only")
    .map((partition) => ({
      dependent: partition.dependent,
      origin,
      ...(partition.writablePath === undefined ? {} : { writablePath: partition.writablePath }),
      text:
        `Work unit \`${partition.dependent}\` is Integrating with a live \`Depends On\` edge to \`${origin}\`. `
        + "Coordinate before transforming the origin; this transform will not mutate that dependent.",
    }));
}
