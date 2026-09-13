/** In-process Vitest cost run, including admission and durable raw-run retention. */

import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";

import { parseCLI, startVitest, type TestModule } from "vitest/node";

import { withLocalHeavyTestAdmission } from "../local-test-admission.js";
import type { LocalHeavyTestTier } from "../local-test-admission.js";
import { captureTestCost, type TestCostFile } from "./capture.js";
import { summarizeSubstrateShare, type SubstrateShare } from "./metrics.js";
import type { MeasurementMode, MeasurementProjectSet } from "./mode.js";

type ParsedVitestOptions = ReturnType<typeof parseCLI>["options"];

interface MeasurementController {
  readonly state: {
    getTestModules(): TestModule[];
    getUnhandledErrors(): unknown[];
  };
  shouldKeepServer(): boolean;
  exit(): Promise<void>;
}

export interface TestCostRunDependencies {
  readonly admit: typeof withLocalHeavyTestAdmission;
  readonly availableParallelism?: () => number;
  readonly now: () => number;
  readonly parseCli: (argv: string[]) => { filter: string[]; options: ParsedVitestOptions };
  readonly persist: (path: string, content: string) => Promise<void>;
  readonly start: (
    mode: "test",
    filters: string[],
    options: ParsedVitestOptions,
  ) => Promise<MeasurementController>;
}

export interface RetainedTestCostRun {
  readonly schemaVersion: 4;
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
  admit: withLocalHeavyTestAdmission,
  availableParallelism,
  now: Date.now,
  parseCli: parseCLI,
  persist: persistAtomically,
  start: async (mode, filters, options) => await startVitest(mode, filters, options),
};

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
  const admitted = await dependencies.admit(
    {
      cwd: input.cwd,
      env: input.env,
      tier: projectSetAdmissionTier(input.mode.projectSet),
    },
    async () => {
      const startedAtMs = dependencies.now();
      const context = await dependencies.start("test", filter, options);
      try {
        const unhandledErrorCount = context.state.getUnhandledErrors().length;
        if (unhandledErrorCount > 0) {
          throw new Error(`Vitest reported ${unhandledErrorCount} unhandled run error(s)`);
        }
        const captured = captureTestCost(context.state.getTestModules());
        return {
          captured,
          startedAtMs,
          unhandledErrorCount: 0 as const,
          wallClockMs: dependencies.now() - startedAtMs,
        };
      } finally {
        if (!context.shouldKeepServer()) await context.exit();
      }
    },
  );
  const { captured, startedAtMs, unhandledErrorCount, wallClockMs } = admitted.result;
  const run: RetainedTestCostRun = {
    schemaVersion: 4,
    outcome: "passed",
    unhandledErrorCount,
    capturedAt: new Date(startedAtMs).toISOString(),
    mode: effectiveMode,
    requestedWorkerSizing,
    wallClockMs,
    summedFileTimeMs: captured.summedFileTimeMs,
    fileCount: captured.files.length,
    testCount: captured.files.reduce((total, file) => total + file.tests.length, 0),
    cliSpawnCount: captured.files.reduce(
      (total, file) => total + file.tests.reduce((fileTotal, test) => fileTotal + (test.cliSpawnCount ?? 0), 0),
      0,
    ),
    ...(admitted.waitMs === undefined ? {} : { admissionWaitMs: admitted.waitMs }),
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
  await rename(temporaryPath, path);
}
