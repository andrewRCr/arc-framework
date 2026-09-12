/** Reachable lever comparison and worker-sizing sweep analysis over retained cost runs. */

import {
  compareLever,
  createSizingSweep,
  type ComparableCost,
  type LeverComparison,
  type MeasurementMode,
} from "./mode.js";
import { classifyNoise, type NoiseClassification } from "./normalize.js";
import {
  normalizeRetainedTestCostRuns,
  type NormalizedRetainedCost,
} from "./retained.js";
import type { RetainedTestCostRun } from "./run.js";

export type RetainedTestCostAnalysisInput =
  | {
    readonly kind: "lever";
    readonly before: readonly RetainedTestCostRun[];
    readonly after: readonly RetainedTestCostRun[];
  }
  | {
    readonly kind: "sizing-sweep";
    readonly groups: readonly (readonly RetainedTestCostRun[])[];
  };

type NormalizedSummary = NormalizedRetainedCost["summary"];

interface MeasuredMetric extends Extract<LeverComparison, { readonly kind: "measured" }> {
  readonly noise: NoiseClassification;
}

interface SweepDelta {
  readonly deltaMs: number;
  readonly deltaFraction: number;
  readonly noise: NoiseClassification;
}

interface SweepPoint extends ComparableCost {
  readonly deltaFromFirst?: SweepDelta;
}

interface SweepMetric {
  readonly points: readonly SweepPoint[];
}

export type RetainedTestCostAnalysis =
  | {
    readonly kind: "lever";
    readonly before: NormalizedSummary;
    readonly after: NormalizedSummary;
    readonly comparison:
      | Extract<LeverComparison, { readonly kind: "refused" }>
      | {
        readonly kind: "measured";
        readonly wallClockMs: MeasuredMetric;
        readonly summedFileTimeMs: MeasuredMetric;
      };
  }
  | {
    readonly kind: "sizing-sweep";
    readonly groups: readonly NormalizedSummary[];
    readonly wallClockMs: SweepMetric;
    readonly summedFileTimeMs: SweepMetric;
  };

/**
 * Analyze normalized retained groups as either a lever or a worker-sizing sweep.
 *
 * @param input - Exact retained groups and the comparison operation they represent.
 * @returns A typed comparison report.
 */
export function analyzeRetainedTestCost(
  input: RetainedTestCostAnalysisInput,
): RetainedTestCostAnalysis {
  if (input.kind === "lever") {
    const before = normalizeRetainedTestCostRuns(input.before).summary;
    const after = normalizeRetainedTestCostRuns(input.after).summary;
    const wallClock = compareLever(comparable(before.mode, before.wallClockMs), comparable(
      after.mode,
      after.wallClockMs,
    ));
    if (wallClock.kind === "refused") {
      return { kind: "lever", before, after, comparison: wallClock };
    }
    const summedFileTime = compareLever(
      comparable(before.mode, before.summedFileTimeMs),
      comparable(after.mode, after.summedFileTimeMs),
    );
    if (summedFileTime.kind === "refused") {
      return { kind: "lever", before, after, comparison: summedFileTime };
    }
    return {
      kind: "lever",
      before,
      after,
      comparison: {
        kind: "measured",
        wallClockMs: measuredMetric(wallClock),
        summedFileTimeMs: measuredMetric(summedFileTime),
      },
    };
  }

  const groups = input.groups.map((runs) => normalizeRetainedTestCostRuns(runs).summary);
  const wallClock = createSizingSweep(groups.map((group) => comparable(group.mode, group.wallClockMs)));
  const summedFileTime = createSizingSweep(
    groups.map((group) => comparable(group.mode, group.summedFileTimeMs)),
  );
  return {
    kind: "sizing-sweep",
    groups,
    wallClockMs: { points: sweepPoints(wallClock.points) },
    summedFileTimeMs: { points: sweepPoints(summedFileTime.points) },
  };
}

function comparable(mode: MeasurementMode, valueMs: number): ComparableCost {
  return { mode, valueMs };
}

function measuredMetric(
  comparison: Extract<LeverComparison, { readonly kind: "measured" }>,
): MeasuredMetric {
  return { ...comparison, noise: classifyNoise(comparison.deltaFraction) };
}

function sweepPoints(points: readonly ComparableCost[]): readonly SweepPoint[] {
  const [first] = points;
  if (first === undefined || first.valueMs === 0) {
    throw new Error("Sizing-sweep baseline cost must be positive");
  }
  return points.map((point, index) => {
    if (index === 0) return point;
    const deltaMs = point.valueMs - first.valueMs;
    const deltaFraction = deltaMs / first.valueMs;
    return {
      ...point,
      deltaFromFirst: {
        deltaMs,
        deltaFraction,
        noise: classifyNoise(deltaFraction),
      },
    };
  });
}
