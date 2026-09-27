/** Normalize one exact-mode set of retained test-cost runs. */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  assertRetainedTestCostRun,
  normalizeRetainedTestCostRuns,
} from "../lib/test-cost/retained.js";

const paths = process.argv.slice(2);
if (paths.length === 0) throw new Error("Provide at least one retained test-cost JSON path");
const runs = await Promise.all(paths.map(async (path) => {
  const parsed: unknown = JSON.parse(await readFile(resolve(process.cwd(), path), "utf8"));
  assertRetainedTestCostRun(parsed, path);
  return parsed;
}));

process.stdout.write(`${JSON.stringify(normalizeRetainedTestCostRuns(runs), null, 2)}\n`);
