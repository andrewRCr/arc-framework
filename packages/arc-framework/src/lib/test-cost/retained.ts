/** Detailed normalization over complete retained test-cost runs. */

import type { RetainedTestCostRun } from "./run.js";
import { resolveTimeoutHeadroom, summarizeSubstrateShare } from "./metrics.js";
import { createMeasurementMode, type MeasurementCondition, type MeasurementProjectSet } from "./mode.js";
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
  runs.forEach((run, index) => {
    requireWarmRunSchema(run.schemaVersion, `normalization sample ${index + 1}`);
  });
  const summary = normalizeCostRuns(runs);
  const paths = first.files.map((file) => file.path).sort();
  for (const run of runs.slice(1)) {
    const candidate = run.files.map((file) => file.path).sort();
    if (candidate.length !== paths.length || candidate.some((path, index) => path !== paths[index])) {
      throw new Error("Cannot normalize runs with different file membership");
    }
    if (!sameMembers(run.substrate.files, first.substrate.files)) {
      throw new Error("Cannot normalize runs with different substrate membership");
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
    const testIds = samples[0]?.tests.map((test) => test.id);
    if (testIds === undefined || samples.some((file) => !sameMembers(file.tests.map((test) => test.id), testIds))) {
      throw new Error(`Retained test membership changed for ${path}`);
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

/**
 * Canonical path, tier, and test-ID membership for a retained run.
 *
 * @param run - Retained run whose measured suite is compared.
 * @returns Sorted, unambiguous per-file membership records.
 */
export function retainedSuiteMembership(run: RetainedTestCostRun): string[] {
  return run.files.map((file) => JSON.stringify([
    file.path,
    file.tier,
    file.tests.map((test) => test.id).sort(),
  ])).sort();
}

export function assertRetainedTestCostRun(
  value: unknown,
  label: string,
): asserts value is RetainedTestCostRun {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Invalid retained test-cost run: ${label}`);
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  requireWarmRunSchema(candidate["schemaVersion"], label);
  if (candidate["outcome"] !== "passed"
    || candidate["unhandledErrorCount"] !== 0
    || typeof candidate["requestedWorkerSizing"] !== "string"
    || candidate["requestedWorkerSizing"].trim().length === 0
    || !Array.isArray(candidate["files"])) {
    throw new Error(`Retained test-cost run lacks a successful outcome: ${label}`);
  }
  const mode = requireRecord(candidate["mode"], label, "mode");
  if (typeof mode["condition"] !== "string"
    || typeof mode["projectSet"] !== "string"
    || typeof mode["workerSizing"] !== "string") {
    invalid(label, "mode");
  }
  let parsedMode: ReturnType<typeof createMeasurementMode>;
  try {
    parsedMode = createMeasurementMode({
      condition: mode["condition"] as MeasurementCondition,
      projectSet: mode["projectSet"] as MeasurementProjectSet,
      workerSizing: mode["workerSizing"],
    });
  } catch {
    invalid(label, "mode");
  }
  if (parsedMode.workerSizing !== mode["workerSizing"]
    || (candidate["requestedWorkerSizing"] === "native"
      ? !/^[1-9]\d*$/u.test(parsedMode.workerSizing)
      : candidate["requestedWorkerSizing"] !== parsedMode.workerSizing)) {
    invalid(label, "worker sizing");
  }
  const capturedAt = candidate["capturedAt"];
  if (typeof capturedAt !== "string" || !Number.isFinite(Date.parse(capturedAt))
    || new Date(capturedAt).toISOString() !== capturedAt) {
    invalid(label, "capture timestamp");
  }
  requireNumber(candidate["wallClockMs"], label, "wall clock");
  requireNumber(candidate["summedFileTimeMs"], label, "summed file time");
  requireCount(candidate["fileCount"], label, "file count");
  requireCount(candidate["testCount"], label, "test count");
  if (candidate["cliSpawnCount"] !== undefined) {
    requireCount(candidate["cliSpawnCount"], label, "CLI spawn count");
  }
  if (candidate["admissionWaitMs"] !== undefined) {
    requireNumber(candidate["admissionWaitMs"], label, "admission wait");
  }
  const files = candidate["files"] as unknown[];
  if (files.length === 0) invalid(label, "files");
  const paths = new Set<string>();
  let summedFileTimeMs = 0;
  let testCount = 0;
  let cliSpawnCount = 0;
  const validatedFiles: RetainedTestCostRun["files"][number][] = [];
  for (const [index, value] of files.entries()) {
    const file = requireRecord(value, label, `files[${index}]`);
    const path = requireText(file["path"], label, `files[${index}].path`);
    requireText(file["tier"], label, `files[${index}].tier`);
    if (paths.has(path)) invalid(label, `duplicate file ${path}`);
    paths.add(path);
    const fixedCostMs = requireNumber(file["fixedCostMs"], label, `${path}.fixedCostMs`);
    const environmentSetupDurationMs = requireNumber(
      file["environmentSetupDurationMs"], label, `${path}.environmentSetupDurationMs`,
    );
    const prepareDurationMs = requireNumber(file["prepareDurationMs"], label, `${path}.prepareDurationMs`);
    const collectDurationMs = requireNumber(file["collectDurationMs"], label, `${path}.collectDurationMs`);
    const setupDurationMs = requireNumber(file["setupDurationMs"], label, `${path}.setupDurationMs`);
    const executionDurationMs = requireNumber(
      file["executionDurationMs"], label, `${path}.executionDurationMs`,
    );
    const durationMs = requireNumber(file["durationMs"], label, `${path}.durationMs`);
    const testTimeMs = requireNumber(file["testTimeMs"], label, `${path}.testTimeMs`);
    if (fixedCostMs !== environmentSetupDurationMs + prepareDurationMs + collectDurationMs + setupDurationMs
      || durationMs !== fixedCostMs + executionDurationMs
      || !Array.isArray(file["tests"])) {
      invalid(label, `${path} costs or tests`);
    }
    const tests = file["tests"] as unknown[];
    const testIds = new Set<string>();
    let summedTestTimeMs = 0;
    for (const [testIndex, testValue] of tests.entries()) {
      const test = requireRecord(testValue, label, `${path}.tests[${testIndex}]`);
      const id = requireText(test["id"], label, `${path}.tests[${testIndex}].id`);
      requireText(test["name"], label, `${path}.tests[${testIndex}].name`);
      if (testIds.has(id)) invalid(label, `${path} duplicate test ${id}`);
      testIds.add(id);
      const testDurationMs = requireNumber(test["durationMs"], label, `${path}.${id}.durationMs`);
      const vitestTimeoutMs = requireNumber(test["vitestTimeoutMs"], label, `${path}.${id}.vitestTimeoutMs`, true);
      if (test["cliTimeoutMs"] !== undefined) {
        requireNumber(test["cliTimeoutMs"], label, `${path}.${id}.cliTimeoutMs`, true);
      }
      if (test["cliSpawnCount"] !== undefined) {
        cliSpawnCount += requireCount(test["cliSpawnCount"], label, `${path}.${id}.cliSpawnCount`);
      }
      const expectedHeadroom = resolveTimeoutHeadroom(testDurationMs, vitestTimeoutMs);
      if (test["timeoutCeilingMs"] !== expectedHeadroom.timeoutCeilingMs
        || test["headroomMs"] !== expectedHeadroom.headroomMs
        || test["headroomFraction"] !== expectedHeadroom.headroomFraction) {
        invalid(label, `${path}.${id} timeout headroom`);
      }
      summedTestTimeMs += testDurationMs;
    }
    if (testTimeMs !== summedTestTimeMs) invalid(label, `${path} test time`);
    testCount += tests.length;
    summedFileTimeMs += durationMs;
    validatedFiles.push(file as unknown as RetainedTestCostRun["files"][number]);
  }
  if (candidate["fileCount"] !== files.length
    || candidate["testCount"] !== testCount
    || candidate["summedFileTimeMs"] !== summedFileTimeMs
    || (candidate["cliSpawnCount"] !== undefined && candidate["cliSpawnCount"] !== cliSpawnCount)) {
    invalid(label, "run summary");
  }
  const substrate = requireRecord(candidate["substrate"], label, "substrate");
  requireNumber(substrate["durationMs"], label, "substrate duration");
  const share = requireNumber(substrate["shareFraction"], label, "substrate share");
  if (share > 1 || !Array.isArray(substrate["files"])
    || substrate["files"].some((path: unknown) => typeof path !== "string")) {
    invalid(label, "substrate membership");
  }
  const expectedSubstrate = summarizeSubstrateShare(validatedFiles);
  if (substrate["durationMs"] !== expectedSubstrate.durationMs
    || share !== expectedSubstrate.shareFraction
    || !sameMembers(substrate["files"] as string[], expectedSubstrate.files)) {
    invalid(label, "substrate membership");
  }
}

function requireWarmRunSchema(schemaVersion: unknown, label: string): void {
  if (schemaVersion !== 5) {
    throw new Error(`Retained warm-run protocol requires schema 5: ${label}; remeasure with benchmark:test-cost `
      + "using an entry that completes a discarded warm-up. Do not relabel older records.");
  }
}

function requireRecord(value: unknown, label: string, field: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid(label, field);
  return value as Readonly<Record<string, unknown>>;
}

function requireText(value: unknown, label: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) invalid(label, field);
  return value;
}

function requireNumber(value: unknown, label: string, field: string, positive = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || (positive ? value <= 0 : value < 0)) {
    invalid(label, field);
  }
  return value;
}

function requireCount(value: unknown, label: string, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid(label, field);
  return value;
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  const sorted = [...left].sort();
  const other = [...right].sort();
  return sorted.length === other.length && sorted.every((value, index) => value === other[index]);
}

function invalid(label: string, field: string): never {
  throw new Error(`Invalid retained test-cost run: ${label} (${field})`);
}
