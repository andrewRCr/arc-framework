/** Verify that shared unit setup records the timeout each test actually runs under. */

import { expect, it } from "vitest";

import { TEST_COST_VITEST_TIMEOUT_META } from "../../src/lib/test-cost/metrics.js";

it("records the project default timeout", ({ task }) => {
  const metadata = task.meta as Readonly<Record<string, unknown>>;
  expect(metadata[TEST_COST_VITEST_TIMEOUT_META]).toBe(5_000);
});

it("records a positional timeout", ({ task }) => {
  const metadata = task.meta as Readonly<Record<string, unknown>>;
  expect(metadata[TEST_COST_VITEST_TIMEOUT_META]).toBe(7_319);
}, 7_319);

it("records an options-object timeout", { timeout: 8_413 }, ({ task }) => {
  const metadata = task.meta as Readonly<Record<string, unknown>>;
  expect(metadata[TEST_COST_VITEST_TIMEOUT_META]).toBe(8_413);
});
