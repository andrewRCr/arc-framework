/** Repository-owned entry point for retained Vitest cost measurements. */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseTestCostCli } from "../lib/test-cost/cli.js";
import { evaluateTestCostBudget, loadTestCostBudgetRecord } from "../lib/test-cost/budget.js";
import { defaultRetainedRunPath, runTestCostMeasurement } from "../lib/test-cost/run.js";

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const input = parseTestCostCli(process.argv.slice(2));
const outputPath = input.outputPath === undefined
  ? defaultRetainedRunPath(packageRoot)
  : resolve(process.cwd(), input.outputPath);
const run = await runTestCostMeasurement({
  cwd: packageRoot,
  env: process.env,
  mode: input.mode,
  outputPath,
});
const budgets = await loadTestCostBudgetRecord(join(packageRoot, "test-cost-budgets.json"));
const budget = evaluateTestCostBudget(budgets, {
  tier: run.mode.projectSet,
  mode: run.mode,
  metric: "wall-clock-ms",
  actualMs: run.wallClockMs,
});

const summary = {
  outputPath,
  capturedAt: run.capturedAt,
  mode: run.mode,
  requestedWorkerSizing: run.requestedWorkerSizing,
  wallClockMs: run.wallClockMs,
  summedFileTimeMs: run.summedFileTimeMs,
  fileCount: run.fileCount,
  testCount: run.testCount,
  cliSpawnCount: run.cliSpawnCount,
  substrate: run.substrate,
  budget,
  ...(run.admissionWaitMs === undefined ? {} : { admissionWaitMs: run.admissionWaitMs }),
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
