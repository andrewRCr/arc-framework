/** In-process Vitest cost run, including admission and durable raw-run retention. */

import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";

import { createVitest, parseCLI } from "vitest/node";

import type { LocalHeavyTestTier } from "../local-test-admission.js";
import type { TestOwnershipOverrides } from "../build-ownership.js";
import { discoverVitestSelection } from "../vitest-discovery.js";
import { executeVitestSelection } from "../vitest-execution.js";
import { retryTransientFileSystemRefusal } from "../fs.js";
import { captureTestCost, type TestCostFile } from "./capture.js";
import { summarizeSubstrateShare, type SubstrateShare } from "./metrics.js";
import type { MeasurementMode, MeasurementProjectSet } from "./mode.js";

type ParsedVitestOptions = ReturnType<typeof parseCLI>["options"];

export interface TestCostRunDependencies {
  readonly availableParallelism?: () => number;
  readonly create: typeof createVitest;
  readonly now: () => number;
  readonly ownership?: TestOwnershipOverrides;
  readonly parseCli: (argv: string[]) => { filter: string[]; options: ParsedVitestOptions };
  readonly persist: (path: string, content: string) => Promise<void>;
}

export interface RetainedTestCostRun {
  readonly schemaVersion: 5;
  readonly outcome: "passed";
  readonly unhandledErrorCount: 0;
  readonly requestedWorkerSizing: string;
  readonly capturedAt: string;
  readonly mode: MeasurementMode;
  readonly wallClockMs: number;
  readonly summedFileTimeMs: number;
  readonly fileCount: number;
  readonly testCount: number;
  readonly cliSpawnCount?: number;
  readonly admissionWaitMs?: number;
  readonly substrate: SubstrateShare;
  readonly files: readonly TestCostFile[];
}

export interface RunTestCostInput {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly mode: MeasurementMode;
  readonly outputPath: string;
}

export const DEFAULT_TEST_COST_RUN_DEPENDENCIES: TestCostRunDependencies = {
  availableParallelism,
  create: createVitest,
  now: Date.now,
  parseCli: parseCLI,
  persist: persistAtomically,
};

/**
 * Warm the same selection in a discarded run, then capture through closing and retain after release.
 * @param input - Package cwd, mode axes, and retained output destination
 * @param dependencies - Native controller, clock, ownership, and persistence boundaries
 * @returns The successful retained record with CPU queue latency separated from elapsed time
 */
export async function runTestCostMeasurement(
  input: RunTestCostInput,
  dependencies: TestCostRunDependencies = DEFAULT_TEST_COST_RUN_DEPENDENCIES,
): Promise<RetainedTestCostRun> {
  const requestedWorkerSizing = input.mode.workerSizing;
  const effectiveWorkerSizing = resolveEffectiveWorkerSizing(
    requestedWorkerSizing,
    dependencies.availableParallelism ?? availableParallelism,
  );
  const effectiveMode: MeasurementMode = {
    ...input.mode,
    workerSizing: effectiveWorkerSizing,
  };
  const { filter, options } = dependencies.parseCli([
    "vitest",
    "run",
    ...projectSetArguments(input.mode.projectSet),
    "--maxWorkers",
    effectiveWorkerSizing,
  ]);
  const executePass = async () => {
    const startedAtMs = dependencies.now();
    const selection = await discoverVitestSelection(filter, options, undefined, dependencies.create);
    const admitted = await executeVitestSelection(selection,
      { cwd: input.cwd, packageRoot: input.cwd, env: input.env, tier: projectSetAdmissionTier(input.mode.projectSet) },
      () => {
        const captured = captureTestCost(selection.controller.state.getTestModules());
        if (process.exitCode) throw new Error("Vitest measurement did not complete successfully; no passed run retained");
        return { captured, elapsedMs: dependencies.now() - startedAtMs };
      }, dependencies.ownership,
    );
    return { startedAtMs, ...admitted.result, waitMs: admitted.waitMs };
  };
  await executePass();
  const { startedAtMs, captured, elapsedMs, waitMs } = await executePass();
  const run: RetainedTestCostRun = {
    schemaVersion: 5,
    outcome: "passed",
    unhandledErrorCount: 0,
    capturedAt: new Date(startedAtMs).toISOString(),
    mode: effectiveMode,
    requestedWorkerSizing,
    wallClockMs: elapsedMs - (waitMs ?? 0),
    summedFileTimeMs: captured.summedFileTimeMs,
    fileCount: captured.files.length,
    testCount: captured.files.reduce((total, file) => total + file.tests.length, 0),
    cliSpawnCount: captured.files.reduce(
      (total, file) => total + file.tests.reduce((fileTotal, test) => fileTotal + (test.cliSpawnCount ?? 0), 0),
      0,
    ),
    ...(waitMs === undefined ? {} : { admissionWaitMs: waitMs }),
    substrate: summarizeSubstrateShare(captured.files),
    files: captured.files,
  };
  await dependencies.persist(input.outputPath, `${JSON.stringify(run, null, 2)}\n`);
  return run;
}

export function resolveEffectiveWorkerSizing(
  requested: string,
  getAvailableParallelism: () => number,
): string {
  if (requested !== "native") return requested;
  const concurrency = getAvailableParallelism();
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error("Native worker sizing requires positive available parallelism");
  }
  return String(Math.max(concurrency - 1, 1));
}

export function projectSetArguments(projectSet: MeasurementProjectSet): string[] {
  switch (projectSet) {
    case "unit":
      return ["--project", "unit", "--project", "unit-mocks"];
    case "integration":
    case "e2e":
      return ["--project", projectSet];
    case "lane":
      return ["--project", "unit", "--project", "unit-mocks", "--project", "integration"];
    case "full":
      return [];
  }
}

export function projectSetAdmissionTier(projectSet: MeasurementProjectSet): LocalHeavyTestTier {
  return projectSet;
}

export function defaultRetainedRunPath(packageRoot: string, now: number = Date.now()): string {
  return join(
    packageRoot,
    ".test-cost-runs",
    `${new Date(now).toISOString().replaceAll(":", "-")}-${randomUUID()}.json`,
  );
}

async function persistAtomically(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await retryTransientFileSystemRefusal(async () => {
    await rename(temporaryPath, path);
  });
}
