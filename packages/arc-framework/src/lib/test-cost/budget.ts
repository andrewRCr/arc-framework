/** Per-tier, per-mode test-cost budget matching and standing classification. */

import { readFile } from "node:fs/promises";

import { createMeasurementMode, type MeasurementMode } from "./mode.js";

export type TestCostBudgetMetric = "wall-clock-ms" | "job-elapsed-ms";

export interface TestCostBudgetEntry {
  readonly tier: string;
  readonly mode: MeasurementMode;
  readonly metric: TestCostBudgetMetric;
  readonly baselineMs: number;
  readonly budgetMs: number;
  readonly ciJob?: string;
}

export interface TestCostBudgetRecord {
  readonly schemaVersion: 1;
  readonly allowanceFraction: number;
  readonly budgets: readonly TestCostBudgetEntry[];
}

export interface TestCostBudgetObservation {
  readonly tier: string;
  readonly mode: MeasurementMode;
  readonly metric: TestCostBudgetMetric;
  readonly actualMs: number;
  readonly ciJob?: string;
}

export type TestCostBudgetStanding =
  | {
      readonly status: "within";
      readonly actualMs: number;
      readonly baselineMs: number;
      readonly budgetMs: number;
      readonly remainingMs: number;
    }
  | {
      readonly status: "over";
      readonly actualMs: number;
      readonly baselineMs: number;
      readonly budgetMs: number;
      readonly overageMs: number;
    }
  | { readonly status: "unbudgeted"; readonly actualMs: number };

/**
 * Load and validate the repository's tracked test-cost budget record.
 *
 * @param path - Absolute or caller-relative path to the JSON record.
 * @returns The validated budget record.
 */
export async function loadTestCostBudgetRecord(path: string): Promise<TestCostBudgetRecord> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  const record = requireObject(parsed, "test-cost budget record");
  if (record.schemaVersion !== 1) throw new Error("Test-cost budget schemaVersion must be 1");
  const allowanceFraction = requireNonNegativeNumber(record.allowanceFraction, "budget allowance fraction");
  if (!Array.isArray(record.budgets)) throw new Error("Test-cost budget entries must be an array");
  const budgets = record.budgets.map((entry, index) => parseBudgetEntry(entry, index));
  const keys = budgets.map(budgetKey);
  if (new Set(keys).size !== keys.length) throw new Error("Test-cost budget keys must be unique");
  return { schemaVersion: 1, allowanceFraction, budgets };
}

/**
 * Classify one observed cost against only its exact tier-and-mode budget.
 *
 * @param record - Validated tracked budget record.
 * @param observation - One local tier or CI-job duration observation.
 * @returns Within, over, or unbudgeted standing with the relevant delta.
 */
export function evaluateTestCostBudget(
  record: TestCostBudgetRecord,
  observation: TestCostBudgetObservation,
): TestCostBudgetStanding {
  requireNonNegativeNumber(observation.actualMs, "observed test cost");
  const budget = record.budgets.find((candidate) => (
    candidate.tier === observation.tier
    && candidate.metric === observation.metric
    && candidate.mode.condition === observation.mode.condition
    && candidate.mode.projectSet === observation.mode.projectSet
    && candidate.mode.workerSizing === observation.mode.workerSizing
    && candidate.ciJob === observation.ciJob
  ));
  if (budget !== undefined) {
    if (observation.actualMs > budget.budgetMs) {
      return {
        status: "over",
        actualMs: observation.actualMs,
        baselineMs: budget.baselineMs,
        budgetMs: budget.budgetMs,
        overageMs: observation.actualMs - budget.budgetMs,
      };
    }
    return {
      status: "within",
      actualMs: observation.actualMs,
      baselineMs: budget.baselineMs,
      budgetMs: budget.budgetMs,
      remainingMs: budget.budgetMs - observation.actualMs,
    };
  }
  return { status: "unbudgeted", actualMs: observation.actualMs };
}

function parseBudgetEntry(value: unknown, index: number): TestCostBudgetEntry {
  const entry = requireObject(value, `test-cost budget entry ${index}`);
  const mode = requireObject(entry.mode, `test-cost budget entry ${index} mode`);
  const metric = entry.metric;
  if (metric !== "wall-clock-ms" && metric !== "job-elapsed-ms") {
    throw new Error(`Test-cost budget entry ${index} has an invalid metric`);
  }
  const baselineMs = requireNonNegativeNumber(entry.baselineMs, `test-cost budget entry ${index} baseline`);
  const budgetMs = requireNonNegativeNumber(entry.budgetMs, `test-cost budget entry ${index} budget`);
  if (budgetMs < baselineMs) throw new Error(`Test-cost budget entry ${index} is below its baseline`);
  return {
    tier: requireText(entry.tier, `test-cost budget entry ${index} tier`),
    mode: createMeasurementMode({
      condition: typeof mode.condition === "string"
        ? mode.condition as MeasurementMode["condition"]
        : undefined,
      projectSet: typeof mode.projectSet === "string"
        ? mode.projectSet as MeasurementMode["projectSet"]
        : undefined,
      workerSizing: typeof mode.workerSizing === "string" ? mode.workerSizing : undefined,
    }),
    metric,
    baselineMs,
    budgetMs,
    ...(entry.ciJob === undefined
      ? {}
      : { ciJob: requireText(entry.ciJob, `test-cost budget entry ${index} CI job`) }),
  };
}

function budgetKey(entry: TestCostBudgetEntry): string {
  return [
    entry.tier,
    entry.mode.condition,
    entry.mode.projectSet,
    entry.mode.workerSizing,
    entry.metric,
    entry.ciJob ?? "",
  ].join("\u0000");
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be non-empty text`);
  return value.trim();
}

function requireNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be finite and non-negative`);
  }
  return value;
}
