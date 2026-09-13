/** Complete measurement-mode stamps and guarded comparisons for test cost evidence. */

export const MEASUREMENT_CONDITIONS = [
  "single-file",
  "tier-isolated",
  "under-load",
  "standalone-probe",
  "ci-job",
] as const;
export type MeasurementCondition = typeof MEASUREMENT_CONDITIONS[number];

export const MEASUREMENT_PROJECT_SETS = ["unit", "integration", "e2e", "lane", "full"] as const;
export type MeasurementProjectSet = typeof MEASUREMENT_PROJECT_SETS[number];

export interface MeasurementMode {
  readonly condition: MeasurementCondition;
  readonly projectSet: MeasurementProjectSet;
  readonly workerSizing: string;
}

export interface ComparableCost {
  readonly mode: MeasurementMode;
  readonly valueMs: number;
}

export type LeverComparison =
  | { readonly kind: "measured"; readonly deltaMs: number; readonly deltaFraction: number }
  | { readonly kind: "refused"; readonly mismatches: readonly (keyof MeasurementMode)[] };

export interface SizingSweep {
  readonly kind: "sizing-sweep";
  readonly points: readonly ComparableCost[];
}

export function createMeasurementMode(input: Partial<MeasurementMode>): MeasurementMode {
  const condition = input.condition;
  const projectSet = input.projectSet;
  if (condition === undefined || !MEASUREMENT_CONDITIONS.includes(condition)) {
    throw new Error("Measurement condition must be explicit and recognized");
  }
  if (projectSet === undefined || !MEASUREMENT_PROJECT_SETS.includes(projectSet)) {
    throw new Error("Measurement project set must be explicit and recognized");
  }
  if (typeof input.workerSizing !== "string" || input.workerSizing.trim().length === 0) {
    throw new Error("Measurement worker sizing must be explicit");
  }
  return {
    condition,
    projectSet,
    workerSizing: input.workerSizing.trim(),
  };
}

export function compareLever(before: ComparableCost, after: ComparableCost): LeverComparison {
  requireComparableValue(before.valueMs, "before");
  requireComparableValue(after.valueMs, "after");
  const axes: readonly (keyof MeasurementMode)[] = ["condition", "projectSet", "workerSizing"];
  const mismatches = axes.filter((axis) => before.mode[axis] !== after.mode[axis]);
  if (mismatches.length > 0) return { kind: "refused", mismatches };
  if (before.valueMs === 0) throw new Error("Cannot derive a lever percentage from a zero before value");
  const deltaMs = after.valueMs - before.valueMs;
  return { kind: "measured", deltaMs, deltaFraction: deltaMs / before.valueMs };
}

export function createSizingSweep(points: readonly ComparableCost[]): SizingSweep {
  if (points.length < 2) throw new Error("A sizing sweep requires at least two points");
  const [first, ...rest] = points;
  if (first === undefined) throw new Error("A sizing sweep requires a first point");
  for (const point of points) requireComparableValue(point.valueMs, "sizing sweep");
  if (rest.some((point) => point.mode.condition !== first.mode.condition)) {
    throw new Error("Sizing sweep condition mismatch");
  }
  if (rest.some((point) => point.mode.projectSet !== first.mode.projectSet)) {
    throw new Error("Sizing sweep project set mismatch");
  }
  if (new Set(points.map((point) => point.mode.workerSizing)).size < 2) {
    throw new Error("Sizing sweep must vary worker sizing");
  }
  return { kind: "sizing-sweep", points };
}

function requireComparableValue(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} cost must be finite and non-negative`);
}
