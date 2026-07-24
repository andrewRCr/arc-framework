/**
 * Read-only coordination facts shared by retirement-transform preparation.
 *
 * @module
 */

import type { ComposedLifecycleIndexResult } from "./composed-lifecycle-index.js";

/** One integrating dependent whose live edge makes an origin transform coordination-sensitive. */
export interface IntegratingDependentAdvisory {
  dependent: string;
  origin: string;
  writablePath?: string;
  text: string;
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
  const advisories: IntegratingDependentAdvisory[] = [];
  for (const [dependent, record] of composed.recordsBySlug) {
    if (record.selected.state !== "Integrating" || !record.selected.dependsOn.includes(origin)) continue;
    advisories.push({
      dependent,
      origin,
      ...(record.writablePath === undefined ? {} : { writablePath: record.writablePath }),
      text:
        `Work unit \`${dependent}\` is Integrating with a live \`Depends On\` edge to \`${origin}\`. `
        + "Coordinate before transforming the origin; this transform will not mutate that dependent.",
    });
  }
  return advisories.sort((left, right) =>
    Buffer.compare(Buffer.from(left.dependent, "utf8"), Buffer.from(right.dependent, "utf8")));
}
