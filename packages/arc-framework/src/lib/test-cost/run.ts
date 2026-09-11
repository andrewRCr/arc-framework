/** In-process Vitest cost run, including admission and durable raw-run retention. */

import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { parseCLI, startVitest, type TestModule } from "vitest/node";

import { withLocalHeavyTestAdmission } from "../local-test-admission.js";
import type { LocalHeavyTestTier } from "../local-test-admission.js";
import { captureTestCost, type TestCostFile } from "./capture.js";
import type { MeasurementMode, MeasurementProjectSet } from "./mode.js";

type ParsedVitestOptions = ReturnType<typeof parseCLI>["options"];

interface MeasurementController {
  readonly state: { getTestModules(): TestModule[] };
  shouldKeepServer(): boolean;
  exit(): Promise<void>;
}

export interface TestCostRunDependencies {
  readonly admit: typeof withLocalHeavyTestAdmission;
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
  readonly schemaVersion: 1;
  readonly capturedAt: string;
  readonly mode: MeasurementMode;
  readonly wallClockMs: number;
  readonly summedFileTimeMs: number;
  readonly fileCount: number;
  readonly testCount: number;
  readonly admissionWaitMs?: number;
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
  now: Date.now,
  parseCli: parseCLI,
  persist: persistAtomically,
  start: async (mode, filters, options) => await startVitest(mode, filters, options),
};

export async function runTestCostMeasurement(
  input: RunTestCostInput,
  dependencies: TestCostRunDependencies = DEFAULT_TEST_COST_RUN_DEPENDENCIES,
): Promise<RetainedTestCostRun> {
  const { filter, options } = dependencies.parseCli([
    "vitest",
    "run",
    ...projectSetArguments(input.mode.projectSet),
    ...(input.mode.workerSizing === "native" ? [] : ["--maxWorkers", input.mode.workerSizing]),
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
        const captured = captureTestCost(context.state.getTestModules());
        return {
          captured,
          startedAtMs,
          wallClockMs: dependencies.now() - startedAtMs,
        };
      } finally {
        if (!context.shouldKeepServer()) await context.exit();
      }
    },
  );
  const { captured, startedAtMs, wallClockMs } = admitted.result;
  const run: RetainedTestCostRun = {
    schemaVersion: 1,
    capturedAt: new Date(startedAtMs).toISOString(),
    mode: input.mode,
    wallClockMs,
    summedFileTimeMs: captured.summedFileTimeMs,
    fileCount: captured.files.length,
    testCount: captured.files.reduce((total, file) => total + file.tests.length, 0),
    ...(admitted.waitMs === undefined ? {} : { admissionWaitMs: admitted.waitMs }),
    files: captured.files,
  };
  await dependencies.persist(input.outputPath, `${JSON.stringify(run, null, 2)}\n`);
  return run;
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
