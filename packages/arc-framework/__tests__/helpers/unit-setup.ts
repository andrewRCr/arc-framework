/** Isolate projection bindings, enforce native-launch admission and retain unit timeout metadata. */

import { beforeEach } from "vitest";
import { installUnitProcessGuard } from "./unit-process-guard.js";
import { UNIT_PROCESS_ALLOWLIST } from "./unit-process-allowlist.js";
import { TEST_COST_VITEST_TIMEOUT_META } from "../../src/lib/test-cost/metrics.js";
import { beginProjectionCommand, projectionProcessState } from "../../src/lib/store/projection/process-state.js";

// Composed stores survive command starts, but each test file owns its checkout bindings.
projectionProcessState().composedCapabilities.clear();
beginProjectionCommand();

await installUnitProcessGuard(UNIT_PROCESS_ALLOWLIST);

beforeEach(({ task }) => {
  const metadata = task.meta as Record<string, unknown>;
  metadata[TEST_COST_VITEST_TIMEOUT_META] = task.timeout;
});
