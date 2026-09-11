/** Extract complete per-file and per-test costs from Vitest's reported task graph. */

export interface ReportedCostTest {
  readonly id: string;
  readonly fullName: string;
  readonly options: { readonly timeout?: number };
  diagnostic(): { readonly duration: number } | undefined;
}

export interface ReportedCostModule {
  readonly relativeModuleId: string;
  readonly project: { readonly name: string };
  readonly children: { allTests(): Iterable<ReportedCostTest> };
  diagnostic(): {
    readonly collectDuration: number;
    readonly setupDuration: number;
  };
}

export interface TestCostCase {
  readonly id: string;
  readonly name: string;
  readonly durationMs: number;
  readonly timeoutOverrideMs?: number;
}

export interface TestCostFile {
  readonly path: string;
  readonly tier: string;
  readonly collectDurationMs: number;
  readonly setupDurationMs: number;
  readonly fixedCostMs: number;
  readonly testTimeMs: number;
  readonly durationMs: number;
  readonly tests: readonly TestCostCase[];
}

export interface CapturedTestCost {
  readonly summedFileTimeMs: number;
  readonly files: readonly TestCostFile[];
}

/**
 * Convert Vitest's completed task graph into the cost model used by all suite measurements.
 *
 * Collection already includes module imports, so import diagnostics are intentionally not
 * accepted here and therefore cannot accidentally be counted twice.
 */
export function captureTestCost(modules: readonly ReportedCostModule[]): CapturedTestCost {
  const files = modules.map(captureFile);
  if (files.length === 0) throw new Error("Vitest returned no file timing data");
  return {
    files,
    summedFileTimeMs: files.reduce((sum, file) => sum + file.durationMs, 0),
  };
}

function captureFile(module: ReportedCostModule): TestCostFile {
  const diagnostic = module.diagnostic();
  const collectDurationMs = requireDuration(diagnostic.collectDuration, `${module.relativeModuleId} collection`);
  const setupDurationMs = requireDuration(diagnostic.setupDuration, `${module.relativeModuleId} setup`);
  const tests = [...module.children.allTests()].map((test) => {
    const testDiagnostic = test.diagnostic();
    if (testDiagnostic === undefined) {
      throw new Error(`Test timing data is missing duration for ${test.fullName}`);
    }
    return {
      id: test.id,
      name: test.fullName,
      durationMs: requireDuration(testDiagnostic.duration, test.fullName),
      ...(test.options.timeout === undefined ? {} : { timeoutOverrideMs: test.options.timeout }),
    };
  });
  if (tests.length === 0) {
    throw new Error(`Vitest returned no test timing data for ${module.relativeModuleId}`);
  }
  const testTimeMs = tests.reduce((sum, test) => sum + test.durationMs, 0);
  const fixedCostMs = collectDurationMs + setupDurationMs;
  return {
    path: module.relativeModuleId,
    tier: requireText(module.project.name, `${module.relativeModuleId} project name`),
    collectDurationMs,
    setupDurationMs,
    fixedCostMs,
    testTimeMs,
    durationMs: fixedCostMs + testTimeMs,
    tests,
  };
}

function requireDuration(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid duration for ${label}`);
  return value;
}

function requireText(value: string, label: string): string {
  if (value.trim().length === 0) throw new Error(`Missing ${label}`);
  return value;
}
