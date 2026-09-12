/** Runtime annotation carrying runCli's effective timeout into Vitest's reported task. */

import { TestRunner } from "vitest";

import {
  TEST_COST_CLI_SPAWN_COUNT_META,
  TEST_COST_CLI_TIMEOUT_META,
} from "../../src/lib/test-cost/metrics.js";

export { TEST_COST_CLI_SPAWN_COUNT_META, TEST_COST_CLI_TIMEOUT_META };

interface AnnotatableTest {
  readonly meta: Record<string, unknown>;
}

export function recordCliTimeoutForCurrentTest(
  timeoutMs: number,
  current: () => AnnotatableTest | undefined = TestRunner.getCurrentTest,
): void {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("runCli timeout must be finite and positive");
  }
  const test = current();
  if (test === undefined) return;
  const previous = test.meta[TEST_COST_CLI_TIMEOUT_META];
  test.meta[TEST_COST_CLI_TIMEOUT_META] = typeof previous === "number"
    ? Math.min(previous, timeoutMs)
    : timeoutMs;
}

export function recordCliInvocationForCurrentTest(
  timeoutMs: number,
  current: () => AnnotatableTest | undefined = TestRunner.getCurrentTest,
): void {
  const test = current();
  if (test === undefined) return;
  recordCliTimeoutForCurrentTest(timeoutMs, () => test);
  const previous = test.meta[TEST_COST_CLI_SPAWN_COUNT_META];
  if (previous !== undefined && (typeof previous !== "number" || !Number.isInteger(previous) || previous < 0)) {
    throw new Error("CLI spawn count metadata must be a non-negative integer");
  }
  test.meta[TEST_COST_CLI_SPAWN_COUNT_META] = (previous ?? 0) + 1;
}
