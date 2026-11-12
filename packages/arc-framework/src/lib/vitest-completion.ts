/** Completion policy over native public modules and executed case results. */
import type { TestCase, TestModule, TestRunResult, Vitest } from "vitest/node";
import { UNIT_PROCESS_ALLOWLISTED_META, UNIT_PROCESS_LAUNCH_COUNT_META } from "./unit-process-metadata.js";

type LaunchModule = Pick<TestModule, "moduleId"> & {
  readonly project: Pick<TestModule["project"], "name">;
  meta(): object;
  readonly children: { allTests(): Iterable<Pick<TestCase, "result"> & { meta(): object }> };
};

/**
 * Reject legacy launch exceptions that completed without using their exception.
 * @param result - Native modules with launch metadata and case states
 * @param logger - Controller diagnostic logger
 * @returns After applying any idle-file failure status
 */
export function checkVitestUnitLaunchFloor(
  result: { readonly testModules: readonly LaunchModule[] },
  logger: Pick<Vitest["logger"], "error">,
): void {
  for (const module of result.testModules) {
    const tests = [...module.children.allTests()];
    if (tests.length === 0 || tests.some((test) => !["passed", "failed"].includes(test.result().state))) continue;
    const metadata = [module.meta(), ...tests.map((test) => test.meta())] as Record<string, unknown>[];
    if (!metadata.some((value) => value[UNIT_PROCESS_ALLOWLISTED_META] === true)) continue;
    const counts = metadata.map((value) => value[UNIT_PROCESS_LAUNCH_COUNT_META])
      .filter((count): count is number => typeof count === "number" && Number.isInteger(count) && count >= 0);
    if (counts.length === 0 || Math.max(...counts) !== 0) continue;
    logger.error(`Unit launch allowlist idle: ${module.moduleId} (${module.project.name}); remove its exception.`);
    process.exitCode ||= 1;
  }
}

type CompletionModule = Pick<TestModule, "errors" | "ok"> & {
  readonly children: { allTests(): Iterable<Pick<TestCase, "result">> };
};

/**
 * Count only cases that actually passed or failed, including nested suites.
 * @param modules - Public native module collections
 * @returns Number of completed cases, excluding pending and skipped cases
 */
export function countCompletedVitestCases(modules: readonly Pick<CompletionModule, "children">[]): number {
  let completed = 0;
  for (const module of modules) for (const test of module.children.allTests()) {
    const state = test.result().state;
    if (state === "passed" || state === "failed") completed++;
  }
  return completed;
}

/**
 * Preserve native failure and reject a successfully collected but empty completion.
 * @param result - Native execution report, including collection and unhandled failures
 * @param logger - Native diagnostic logger
 * @returns After applying the run's non-passing process status when required
 */
export function checkVitestCompletion(
  result: Pick<TestRunResult, "unhandledErrors"> & { readonly testModules: readonly CompletionModule[] },
  logger: Pick<Vitest["logger"], "error">,
): void {
  if (result.unhandledErrors.length > 0 || result.testModules.some((module) => !module.ok() || module.errors().length > 0)) {
    process.exitCode ||= 1;
    return;
  }
  if (process.exitCode) return;
  if (countCompletedVitestCases(result.testModules) === 0) {
    logger.error("No test cases completed; check name filters and skipped or pending selections.");
    process.exitCode = 1;
  }
}
