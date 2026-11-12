/**
 * Repository-owned entry point for retained Vitest cost measurements.
 * Vitest diagnostics use stderr; stdout carries the budget-evaluated JSON summary.
 * With `--ref`, the named commit's own entry measures a temporary checkout of it.
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseTestCostCli } from "../lib/test-cost/cli.js";
import { evaluateTestCostBudget, loadTestCostBudgetRecord } from "../lib/test-cost/budget.js";
import { measureTestCostAtRef } from "../lib/test-cost/ref.js";
import {
  DEFAULT_TEST_COST_RUN_DEPENDENCIES, defaultRetainedRunPath, runTestCostMeasurement,
} from "../lib/test-cost/run.js";

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const input = parseTestCostCli(process.argv.slice(2));
const outputPath = input.outputPath === undefined
  ? defaultRetainedRunPath(packageRoot)
  : resolve(process.cwd(), input.outputPath);
process.chdir(packageRoot);
if (input.ref === undefined) {
  process.stdout.write(`${JSON.stringify(await measureThisCheckout(), null, 2)}\n`);
} else {
  const measurement = await measureTestCostAtRef({
    packageRoot, ref: input.ref, mode: input.mode, outputPath, env: process.env,
  });
  process.stdout.write(`${JSON.stringify({ ...measurement.summary, ref: measurement.ref }, null, 2)}\n`);
}

async function measureThisCheckout(): Promise<Readonly<Record<string, unknown>>> {
  const run = await runTestCostMeasurement({
    cwd: packageRoot,
    env: process.env,
    mode: input.mode,
    outputPath,
  }, {
    ...DEFAULT_TEST_COST_RUN_DEPENDENCIES,
    create: (mode, options, viteOverrides, vitestOptions) => DEFAULT_TEST_COST_RUN_DEPENDENCIES.create(
      mode, options, viteOverrides, { ...vitestOptions, stdout: process.stderr, stderr: process.stderr },
    ),
  });
  const budgets = await loadTestCostBudgetRecord(join(packageRoot, "test-cost-budgets.json"));
  const budget = evaluateTestCostBudget(budgets, {
    tier: run.mode.projectSet,
    mode: run.mode,
    metric: "wall-clock-ms",
    actualMs: run.wallClockMs,
  });
  return {
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
}
