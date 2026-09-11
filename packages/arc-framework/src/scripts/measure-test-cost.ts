/** Repository-owned entry point for retained Vitest cost measurements. */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseTestCostCli } from "../lib/test-cost/cli.js";
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

const summary = {
  outputPath,
  capturedAt: run.capturedAt,
  mode: run.mode,
  wallClockMs: run.wallClockMs,
  summedFileTimeMs: run.summedFileTimeMs,
  fileCount: run.fileCount,
  testCount: run.testCount,
  ...(run.admissionWaitMs === undefined ? {} : { admissionWaitMs: run.admissionWaitMs }),
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
