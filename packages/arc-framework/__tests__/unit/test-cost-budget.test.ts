import { describe, expect, it } from "vitest";

import {
  evaluateTestCostBudget,
  type TestCostBudgetRecord,
} from "../../src/lib/test-cost/budget.js";

const localUnitMode = {
  condition: "tier-isolated",
  projectSet: "unit",
  workerSizing: "12",
} as const;

const record: TestCostBudgetRecord = {
  schemaVersion: 1,
  allowanceFraction: 0.1,
  budgets: [{
    tier: "unit",
    mode: localUnitMode,
    metric: "wall-clock-ms",
    baselineMs: 900,
    budgetMs: 1_000,
  }],
};

describe("test-cost budgets", () => {
  it("reports a run below its exact-mode budget as within", () => {
    expect(evaluateTestCostBudget(record, {
      tier: "unit",
      mode: localUnitMode,
      metric: "wall-clock-ms",
      actualMs: 900,
    })).toEqual({
      status: "within",
      actualMs: 900,
      baselineMs: 900,
      budgetMs: 1_000,
      remainingMs: 100,
    });
  });

  it("reports the overage when a run exceeds its budget", () => {
    expect(evaluateTestCostBudget(record, {
      tier: "unit",
      mode: localUnitMode,
      metric: "wall-clock-ms",
      actualMs: 1_075,
    })).toEqual({
      status: "over",
      actualMs: 1_075,
      baselineMs: 900,
      budgetMs: 1_000,
      overageMs: 75,
    });
  });

  it("never compares a run against a budget from another mode", () => {
    expect(evaluateTestCostBudget(record, {
      tier: "unit",
      mode: {
        condition: "ci-job",
        projectSet: "unit",
        workerSizing: "1",
      },
      metric: "job-elapsed-ms",
      actualMs: 900,
      ciJob: "unit",
    })).toEqual({ status: "unbudgeted", actualMs: 900 });
  });

  it("reports a run with no recorded budget as unbudgeted", () => {
    expect(evaluateTestCostBudget(record, {
      tier: "integration",
      mode: {
        condition: "tier-isolated",
        projectSet: "integration",
        workerSizing: "12",
      },
      metric: "wall-clock-ms",
      actualMs: 900,
    })).toEqual({ status: "unbudgeted", actualMs: 900 });
  });
});
