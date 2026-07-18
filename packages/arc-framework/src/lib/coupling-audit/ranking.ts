/**
 * Small deterministic fan-out and quadrant calculations for coupling results.
 *
 * @module
 */

import { CouplingAuditValidationError } from "./contracts.js";
import type { QuadrantVerdict, SurfaceKind, Volatility } from "./types.js";

const SURFACE_KINDS: readonly SurfaceKind[] = ["test", "workflow", "template", "code", "prose", "config"];
const VERDICT_ORDER: Record<QuadrantVerdict, number> = {
  abstract: 0,
  "change-with-mover": 1,
  "leave-alone": 2,
  "retain-local": 3,
};

/** Minimal canonical inputs needed to rank one assumption class. */
export interface RankingInput {
  classId: string;
  volatility: Volatility;
  fanOut: number;
  surfaceCounts: Record<SurfaceKind, number>;
}

/** Resolved class ranking and stable comparison evidence. */
export interface RankedClass {
  classId: string;
  fanOut: number;
  highFanOut: boolean;
  maxThresholdRatio: number;
  verdict: QuadrantVerdict;
  rankKey: string;
}

/**
 * Measure high fan-out and the maximum mixed-surface threshold ratio.
 *
 * @param counts - Distinct-file counts by surface.
 * @param thresholds - Positive high-fan-out cutoffs by surface.
 * @returns Threshold equality and maximum-ratio measurements.
 */
export function measureFanOut(
  counts: Record<SurfaceKind, number>,
  thresholds: Record<SurfaceKind, number>,
): { highFanOut: boolean; maxThresholdRatio: number } {
  let highFanOut = false;
  let maxThresholdRatio = 0;
  for (const kind of SURFACE_KINDS) {
    const threshold = thresholds[kind];
    if (!Number.isInteger(threshold) || threshold < 1) {
      throw new CouplingAuditValidationError(`thresholds.${kind}`, "expected a positive integer");
    }
    const count = counts[kind];
    if (!Number.isInteger(count) || count < 0) {
      throw new CouplingAuditValidationError(`surfaceCounts.${kind}`, "expected a non-negative integer");
    }
    if (count >= threshold) highFanOut = true;
    maxThresholdRatio = Math.max(maxThresholdRatio, count / threshold);
  }
  return { highFanOut, maxThresholdRatio };
}

/**
 * Resolve one fully rated class into its fixed quadrant and stable rank key.
 *
 * @param input - Class counts, fan-out, identifier, and resolved volatility.
 * @param thresholds - Positive high-fan-out cutoffs by surface.
 * @returns Ranked class evidence.
 */
export function rankResolvedClass(
  input: RankingInput,
  thresholds: Record<SurfaceKind, number>,
): RankedClass {
  if (input.volatility === "unresolved") {
    throw new CouplingAuditValidationError(`classes.${input.classId}.volatility`, "unresolved volatility blocks ranking");
  }
  const measurement = measureFanOut(input.surfaceCounts, thresholds);
  const verdict: QuadrantVerdict = input.volatility === "high"
    ? (measurement.highFanOut ? "abstract" : "change-with-mover")
    : (measurement.highFanOut ? "leave-alone" : "retain-local");
  const rankKey = [
    VERDICT_ORDER[verdict],
    measurement.maxThresholdRatio.toFixed(12),
    input.fanOut,
    input.classId,
  ].join(":");
  return { ...input, ...measurement, verdict, rankKey };
}

/**
 * Compare resolved classes by verdict, ratio, total fan-out, then stable ID.
 *
 * @param left - First ranked class.
 * @param right - Second ranked class.
 * @returns Standard ascending comparator result for the required rank order.
 */
export function compareRankedClasses(left: RankedClass, right: RankedClass): number {
  return (
    VERDICT_ORDER[left.verdict] - VERDICT_ORDER[right.verdict] ||
    right.maxThresholdRatio - left.maxThresholdRatio ||
    right.fanOut - left.fanOut ||
    left.classId.localeCompare(right.classId)
  );
}
