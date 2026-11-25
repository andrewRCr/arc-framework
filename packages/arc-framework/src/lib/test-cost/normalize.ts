/** Multi-run normalization and conservative noise-band classification. */

import type { MeasurementMode } from "./mode.js";

export interface CostRunSummary {
  readonly mode: MeasurementMode;
  readonly wallClockMs: number;
  readonly summedFileTimeMs: number;
  readonly fileCount: number;
  readonly testCount: number;
}

export interface NormalizedCost {
  readonly mode: MeasurementMode;
  readonly sampleCount: number;
  readonly normalization: "single-run" | "median";
  readonly wallClockMs: number;
  readonly summedFileTimeMs: number;
  readonly fileCount: number;
  readonly testCount: number;
}

export interface NoiseClassification {
  readonly status: "established" | "unestablished";
  readonly deltaFraction: number;
  readonly noiseBandFraction: number;
}

export const TEST_COST_NOISE_BAND_FRACTION = 0.1;

export function normalizeCostRuns(runs: readonly CostRunSummary[]): NormalizedCost {
  const [first, ...rest] = runs;
  if (first === undefined) throw new Error("At least one retained run is required");
  const modeMismatches: string[] = [];
  if (rest.some((run) => run.mode.condition !== first.mode.condition)) modeMismatches.push("condition");
  if (rest.some((run) => run.mode.projectSet !== first.mode.projectSet)) modeMismatches.push("project set");
  if (rest.some((run) => run.mode.workerSizing !== first.mode.workerSizing)) modeMismatches.push("worker sizing");
  if (modeMismatches.length > 0) {
    throw new Error(`Cannot normalize retained runs with mismatched ${modeMismatches.join(", ")}`);
  }
  return {
    mode: first.mode,
    sampleCount: runs.length,
    normalization: runs.length === 1 ? "single-run" : "median",
    wallClockMs: median(runs.map((run) => run.wallClockMs), "wall clock"),
    summedFileTimeMs: median(runs.map((run) => run.summedFileTimeMs), "summed file time"),
    fileCount: median(runs.map((run) => run.fileCount), "file count"),
    testCount: median(runs.map((run) => run.testCount), "test count"),
  };
}

export function classifyNoise(deltaFraction: number): NoiseClassification {
  if (!Number.isFinite(deltaFraction)) throw new Error("Noise comparison delta must be finite");
  return {
    status: Math.abs(deltaFraction) < TEST_COST_NOISE_BAND_FRACTION ? "unestablished" : "established",
    deltaFraction,
    noiseBandFraction: TEST_COST_NOISE_BAND_FRACTION,
  };
}

export function median(values: readonly number[], label: string): number {
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error(`${label} values must be finite and non-negative`);
  }
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const upper = ordered[middle];
  if (upper === undefined) throw new Error(`Cannot normalize an empty ${label} series`);
  if (ordered.length % 2 === 1) return upper;
  const lower = ordered[middle - 1];
  if (lower === undefined) throw new Error(`Cannot normalize an incomplete ${label} series`);
  return (lower + upper) / 2;
}
