/** Retain each unit test's effective timeout in reporter-visible metadata. */

import { beforeEach } from "vitest";

import { TEST_COST_VITEST_TIMEOUT_META } from "../../src/lib/test-cost/metrics.js";

beforeEach(({ task }) => {
  const metadata = task.meta as Record<string, unknown>;
  metadata[TEST_COST_VITEST_TIMEOUT_META] = task.timeout;
});
