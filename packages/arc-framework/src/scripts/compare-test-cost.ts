/** Compare normalized retained test-cost groups from one typed JSON request. */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { analyzeRetainedTestCost } from "../lib/test-cost/comparison.js";
import { parseTestCostComparisonRequest } from "../lib/test-cost/comparison-request.js";
import { assertRetainedTestCostRun } from "../lib/test-cost/retained.js";
import type { RetainedTestCostRun } from "../lib/test-cost/run.js";

const [requestPath, ...extra] = process.argv.slice(2);
if (requestPath === undefined || extra.length > 0) {
  throw new Error("Provide exactly one test-cost comparison request JSON path");
}
const request = parseTestCostComparisonRequest(
  JSON.parse(await readFile(resolve(process.cwd(), requestPath), "utf8")),
);
const input = request.kind === "lever"
  ? {
    kind: "lever" as const,
    before: await readRunGroup(request.before),
    after: await readRunGroup(request.after),
  }
  : {
    kind: "sizing-sweep" as const,
    groups: await Promise.all(request.groups.map(readRunGroup)),
  };

process.stdout.write(`${JSON.stringify(analyzeRetainedTestCost(input), null, 2)}\n`);

async function readRunGroup(paths: readonly string[]): Promise<readonly RetainedTestCostRun[]> {
  return await Promise.all(paths.map(async (path) => {
    const parsed: unknown = JSON.parse(await readFile(resolve(process.cwd(), path), "utf8"));
    assertRetainedTestCostRun(parsed, path);
    return parsed;
  }));
}
