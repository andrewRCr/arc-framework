/** Detailed normalization over complete retained test-cost runs. */

import type { RetainedTestCostRun } from "./run.js";
import { median, normalizeCostRuns } from "./normalize.js";

export interface NormalizedRetainedCost {
  readonly summary: {
    readonly sampleCount: number;
    readonly normalization: "single-run" | "median";
    readonly mode: RetainedTestCostRun["mode"];
    readonly wallClockMs: number;
    readonly summedFileTimeMs: number;
    readonly fileCount: number;
    readonly testCount: number;
    readonly cliSpawnCount?: number;
  };
  readonly files: readonly {
    readonly path: string;
    readonly tier: string;
    readonly durationMs: number;
    readonly fixedCostMs: number;
    readonly testTimeMs: number;
    readonly executionDurationMs: number;
    readonly testCount: number;
  }[];
  readonly substrate: {
    readonly durationMs: number;
    readonly shareFraction: number;
    readonly files: readonly string[];
  };
  readonly waits: { readonly observedCount: number; readonly medianMs?: number };
}

export function normalizeRetainedTestCostRuns(
  runs: readonly RetainedTestCostRun[],
): NormalizedRetainedCost {
  const [first] = runs;
  if (first === undefined) throw new Error("At least one retained run is required");
  const summary = normalizeCostRuns(runs);
  const paths = first.files.map((file) => file.path).sort();
  for (const run of runs.slice(1)) {
    const candidate = run.files.map((file) => file.path).sort();
    if (candidate.length !== paths.length || candidate.some((path, index) => path !== paths[index])) {
      throw new Error("Cannot normalize runs with different file membership");
    }
  }
  const files = paths.map((path) => {
    const samples = runs.map((run) => {
      const file = run.files.find((candidate) => candidate.path === path);
      if (file === undefined) throw new Error(`Missing retained file sample: ${path}`);
      return file;
    });
    const tier = samples[0]?.tier;
    if (tier === undefined || samples.some((file) => file.tier !== tier)) {
      throw new Error(`Retained tier attribution changed for ${path}`);
    }
    return {
      path,
      tier,
      durationMs: median(samples.map((file) => file.durationMs), `${path} duration`),
      fixedCostMs: median(samples.map((file) => file.fixedCostMs), `${path} fixed cost`),
      testTimeMs: median(samples.map((file) => file.testTimeMs), `${path} test time`),
      executionDurationMs: median(
        samples.map((file) => file.executionDurationMs),
        `${path} execution duration`,
      ),
      testCount: median(samples.map((file) => file.tests.length), `${path} test count`),
    };
  });
  const waits = runs.flatMap((run) => run.admissionWaitMs === undefined ? [] : [run.admissionWaitMs]);
  return {
    summary: {
      ...summary,
      ...(runs.every((run) => run.cliSpawnCount !== undefined)
        ? { cliSpawnCount: median(runs.map((run) => run.cliSpawnCount ?? 0), "CLI spawn count") }
        : {}),
    },
    files,
    substrate: {
      durationMs: median(runs.map((run) => run.substrate.durationMs), "substrate duration"),
      shareFraction: median(runs.map((run) => run.substrate.shareFraction), "substrate share"),
      files: first.substrate.files,
    },
    waits: {
      observedCount: waits.length,
      ...(waits.length === 0 ? {} : { medianMs: median(waits, "admission wait") }),
    },
  };
}

export function assertRetainedTestCostRun(
  value: unknown,
  label: string,
): asserts value is RetainedTestCostRun {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Invalid retained test-cost run: ${label}`);
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  if (candidate["schemaVersion"] !== 3
    || candidate["outcome"] !== "passed"
    || candidate["unhandledErrorCount"] !== 0
    || typeof candidate["requestedWorkerSizing"] !== "string"
    || candidate["requestedWorkerSizing"].trim().length === 0
    || !Array.isArray(candidate["files"])) {
    throw new Error(`Retained test-cost run lacks a successful outcome: ${label}`);
  }
}
