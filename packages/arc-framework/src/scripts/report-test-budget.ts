/** Report one CI job's elapsed time against its tracked advisory test budget. */

import { appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTestCostBudgetRecord } from "../lib/test-cost/budget.js";
import { createCiTestBudgetReport } from "../lib/test-cost/ci-budget.js";
import type { MeasurementProjectSet } from "../lib/test-cost/mode.js";

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const input = parseArguments(process.argv.slice(2));
const record = await loadTestCostBudgetRecord(join(packageRoot, "test-cost-budgets.json"));
const report = createCiTestBudgetReport(record, {
  ...input,
  completedAtMs: Date.now(),
});

if (report.summary !== undefined) {
  const summaryPath = process.env["GITHUB_STEP_SUMMARY"];
  if (summaryPath === undefined || summaryPath.trim().length === 0) {
    throw new Error("GITHUB_STEP_SUMMARY is required when a CI test budget is exceeded");
  }
  await appendFile(summaryPath, report.summary, "utf8");
}
process.stdout.write(`${JSON.stringify(report.standing)}\n`);

interface ReportTestBudgetArguments {
  readonly tier: string;
  readonly projectSet: MeasurementProjectSet;
  readonly workerSizing: string;
  readonly ciJob: string;
  readonly startedAtMs: number;
}

function parseArguments(argv: readonly string[]): ReportTestBudgetArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new Error("CI test-budget arguments must be complete --name value pairs");
    }
    if (!["--tier", "--project-set", "--workers", "--ci-job", "--started-at-seconds"].includes(key)) {
      throw new Error(`Unknown CI test-budget argument: ${key}`);
    }
    if (values.has(key)) throw new Error(`Duplicate CI test-budget argument: ${key}`);
    values.set(key, value);
  }
  const projectSet = values.get("--project-set");
  if (!isMeasurementProjectSet(projectSet)) throw new Error("CI test-budget project set is missing or invalid");
  const startedAtSeconds = Number(values.get("--started-at-seconds"));
  if (!Number.isSafeInteger(startedAtSeconds) || startedAtSeconds < 0) {
    throw new Error("CI test-budget start time must be non-negative epoch seconds");
  }
  return {
    tier: requireText(values.get("--tier"), "tier"),
    projectSet,
    workerSizing: requireText(values.get("--workers"), "worker sizing"),
    ciJob: requireText(values.get("--ci-job"), "CI job"),
    startedAtMs: startedAtSeconds * 1_000,
  };
}

function isMeasurementProjectSet(value: string | undefined): value is MeasurementProjectSet {
  return value === "unit" || value === "integration" || value === "e2e" || value === "lane" || value === "full";
}

function requireText(value: string | undefined, label: string): string {
  if (value === undefined || value.trim().length === 0) throw new Error(`CI test-budget ${label} is required`);
  return value.trim();
}
