/** Isolate projection bindings and the store selection, enforce native-launch admission and retain unit timeout
 * metadata. */

import { beforeEach } from "vitest";
import { installUnitProcessGuard } from "./unit-process-guard.js";
import { UNIT_PROCESS_ALLOWLIST } from "./unit-process-allowlist.js";
import { TEST_COST_VITEST_TIMEOUT_META } from "../../src/lib/test-cost/metrics.js";
import { beginProjectionCommand, projectionProcessState } from "../../src/lib/store/projection/process-state.js";
import { IN_REPO_STORE_OVERRIDE } from "../../src/lib/store/selection.js";
import { applyInRepoStoreLedger } from "./in-repo-store-ledger.js";

// A checkout that selects the in-repo store for its own commands must not select it for the tests it runs.
Reflect.deleteProperty(process.env, IN_REPO_STORE_OVERRIDE);
// Only a listed file runs under the override, set after the clear above.
applyInRepoStoreLedger();

// Composed stores survive command starts, but each test file owns its checkout bindings.
projectionProcessState().composedCapabilities.clear();
beginProjectionCommand();

await installUnitProcessGuard(UNIT_PROCESS_ALLOWLIST);

beforeEach(({ task }) => {
  const metadata = task.meta as Record<string, unknown>;
  metadata[TEST_COST_VITEST_TIMEOUT_META] = task.timeout;
});
