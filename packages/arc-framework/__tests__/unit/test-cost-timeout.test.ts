/** Unit coverage for carrying runCli timeout ceilings into reported test tasks. */

import { describe, expect, it } from "vitest";

import {
  recordCliTimeoutForCurrentTest,
  recordCliInvocationForCurrentTest,
  TEST_COST_CLI_SPAWN_COUNT_META,
  TEST_COST_CLI_TIMEOUT_META,
} from "../helpers/test-cost-timeout.js";

describe("recordCliTimeoutForCurrentTest", () => {
  it("records the tightest runCli timeout used by a test", () => {
    const test = { meta: {} as Record<string, unknown> };
    recordCliTimeoutForCurrentTest(10_000, () => test);
    recordCliTimeoutForCurrentTest(20_000, () => test);
    recordCliTimeoutForCurrentTest(2_000, () => test);
    expect(test.meta[TEST_COST_CLI_TIMEOUT_META]).toBe(2_000);
  });

  it("counts every CLI invocation while retaining the tightest timeout", () => {
    const test = { meta: {} as Record<string, unknown> };
    recordCliInvocationForCurrentTest(30_000, () => test);
    recordCliInvocationForCurrentTest(10_000, () => test);
    expect(test.meta).toMatchObject({
      [TEST_COST_CLI_SPAWN_COUNT_META]: 2,
      [TEST_COST_CLI_TIMEOUT_META]: 10_000,
    });
  });

  it("is inert outside an executing test", () => {
    expect(() => recordCliTimeoutForCurrentTest(10_000, () => undefined)).not.toThrow();
  });
});
