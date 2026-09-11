/** Normalize one exact-mode set of retained test-cost runs. */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { normalizeRetainedTestCostRuns } from "../lib/test-cost/retained.js";
import type { RetainedTestCostRun } from "../lib/test-cost/run.js";

const paths = process.argv.slice(2);
if (paths.length === 0) throw new Error("Provide at least one retained test-cost JSON path");
const runs = await Promise.all(paths.map(async (path) => {
  const parsed: unknown = JSON.parse(await readFile(resolve(process.cwd(), path), "utf8"));
  assertRetainedRun(parsed, path);
  return parsed;
}));

process.stdout.write(`${JSON.stringify(normalizeRetainedTestCostRuns(runs), null, 2)}\n`);

function assertRetainedRun(value: unknown, path: string): asserts value is RetainedTestCostRun {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Invalid retained test-cost run: ${path}`);
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  if (candidate["schemaVersion"] !== 1 || !Array.isArray(candidate["files"])) {
    throw new Error(`Invalid retained test-cost run: ${path}`);
  }
}
