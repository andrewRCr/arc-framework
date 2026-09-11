/** Advisory CI-job reporting for tracked test-cost budgets. */

import {
  evaluateTestCostBudget,
  type TestCostBudgetRecord,
  type TestCostBudgetStanding,
} from "./budget.js";
import { createMeasurementMode, type MeasurementProjectSet } from "./mode.js";

export interface CiTestBudgetInput {
  readonly tier: string;
  readonly projectSet: MeasurementProjectSet;
  readonly workerSizing: string;
  readonly ciJob: string;
  readonly startedAtMs: number;
  readonly completedAtMs: number;
}

export interface CiTestBudgetReport {
  readonly standing: TestCostBudgetStanding;
  readonly summary?: string;
}

/**
 * Compare one completed CI job with its exact-mode advisory budget.
 *
 * @param record - Validated tracked budget record.
 * @param input - CI job identity, sizing, and clock bounds.
 * @returns Structured standing plus optional step-summary Markdown.
 */
export function createCiTestBudgetReport(
  record: TestCostBudgetRecord,
  input: CiTestBudgetInput,
): CiTestBudgetReport {
  const elapsedMs = input.completedAtMs - input.startedAtMs;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new Error("CI test budget elapsed time must be finite and non-negative");
  }
  const standing = evaluateTestCostBudget(record, {
    tier: input.tier,
    mode: createMeasurementMode({
      condition: "ci-job",
      projectSet: input.projectSet,
      workerSizing: input.workerSizing,
    }),
    metric: "job-elapsed-ms",
    actualMs: elapsedMs,
    ciJob: input.ciJob,
  });
  if (standing.status !== "over") return { standing };
  return {
    standing,
    summary: [
      "### Test budget",
      "",
      "> [!WARNING]",
      `> \`${input.ciJob}\` is ${formatMilliseconds(standing.overageMs)} over its `
        + `${formatMilliseconds(standing.budgetMs)} CI-job budget `
        + `(${formatMilliseconds(standing.actualMs)} observed). Advisory only; the job result is unchanged.`,
      "",
    ].join("\n"),
  };
}

function formatMilliseconds(value: number): string {
  if (value < 1_000) return `${Math.round(value)} ms`;
  return `${(value / 1_000).toFixed(2)} s`;
}
