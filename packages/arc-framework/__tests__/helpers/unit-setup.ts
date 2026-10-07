/** Enforce native-launch admission and retain each unit test's timeout metadata. */

import { beforeEach } from "vitest";
import { installUnitProcessGuard } from "./unit-process-guard.js";
import { UNIT_PROCESS_ALLOWLIST } from "./unit-process-allowlist.js";
import { TEST_COST_VITEST_TIMEOUT_META } from "../../src/lib/test-cost/metrics.js";

await installUnitProcessGuard(UNIT_PROCESS_ALLOWLIST);

beforeEach(({ task }) => {
  const metadata = task.meta as Record<string, unknown>;
  metadata[TEST_COST_VITEST_TIMEOUT_META] = task.timeout;
});
