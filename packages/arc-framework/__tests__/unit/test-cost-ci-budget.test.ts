import { describe, expect, it } from "vitest";

import type { TestCostBudgetRecord } from "../../src/lib/test-cost/budget.js";
import { createCiTestBudgetReport } from "../../src/lib/test-cost/ci-budget.js";

const record: TestCostBudgetRecord = {
  schemaVersion: 1,
  allowanceFraction: 0.1,
  budgets: [{
    tier: "integration",
    mode: {
      condition: "ci-job",
      projectSet: "integration",
      workerSizing: "1",
    },
    metric: "job-elapsed-ms",
    baselineMs: 900,
    budgetMs: 1_000,
    ciJob: "integration",
  }],
};

describe("CI test-cost budget reporting", () => {
  it("emits an advisory summary warning without failing an over-budget job", () => {
    const report = createCiTestBudgetReport(record, {
      tier: "integration",
      projectSet: "integration",
      workerSizing: "1",
      ciJob: "integration",
      startedAtMs: 2_000,
      completedAtMs: 3_075,
    });

    expect(report.standing).toEqual({
      status: "over",
      actualMs: 1_075,
      baselineMs: 900,
      budgetMs: 1_000,
      overageMs: 75,
    });
    expect(report.summary).toContain("[!WARNING]");
    expect(report.summary).toContain("integration");
    expect(report.summary).toContain("75 ms over");
  });

  it("emits no warning when a job is within budget", () => {
    const report = createCiTestBudgetReport(record, {
      tier: "integration",
      projectSet: "integration",
      workerSizing: "1",
      ciJob: "integration",
      startedAtMs: 2_000,
      completedAtMs: 2_950,
    });

    expect(report.standing.status).toBe("within");
    expect(report.summary).toBeUndefined();
  });

  it("warns when the CI worker sizing has no measured budget", () => {
    const report = createCiTestBudgetReport(record, {
      tier: "integration",
      projectSet: "integration",
      workerSizing: "native",
      ciJob: "integration",
      startedAtMs: 2_000,
      completedAtMs: 3_075,
    });

    expect(report.standing).toEqual({ status: "unbudgeted", actualMs: 1_075 });
    expect(report.summary).toContain("[!WARNING]");
    expect(report.summary).toContain("native");
    expect(report.summary).toContain("no CI-job budget");
    expect(report.summary).toContain("no budget comparison was made");
  });
});
