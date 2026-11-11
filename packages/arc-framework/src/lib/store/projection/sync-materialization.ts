/** Restore a sync command's projection before its network orchestration begins. */
import type { Store } from "../contract.js";
import { observeProjectionConfiguration } from "./command-configuration.js";
import { readProjectionConfiguration } from "./configuration.js";
import { refreshProjectionRootLayout } from "./engine-binding.js";
import { withProjectionFanOutLock } from "./fan-out-lock.js";
import { readProjectionIndex } from "./index-file.js";
import { materializeProjectionRoot } from "./materialization.js";
import { projectionProcessState } from "./process-state.js";

/** Materialize through the command's existing root, retaining its copy checks and containing failures. */
export async function restoreSyncProjection(store: Store, checkout: string, options: { dryRun?: boolean }): Promise<void> {
  if (!store.capabilities.stateOffBranch || options.dryRun) return;
  const state = projectionProcessState();
  if (state.skip?.reason === "switch") return;
  const root = state.roots.get(checkout);
  if (root === undefined) return;
  const report = (reason: string, remedy = "Repair the reported projection state, then retry arc sync."): void => {
    state.diagnostics.push({ path: checkout, copy: null, mark: { reason, remedy: { text: remedy } } });
  };
  try {
    const result = await withProjectionFanOutLock(root.location, async session => {
      root.checkpoint = session.step;
      try {
        await refreshProjectionRootLayout(root);
        const configuration = await observeProjectionConfiguration(checkout, () => readProjectionConfiguration(root.ports.exec, checkout));
        const version = await store.version();
        if (version.status === "refused") { report(version.refusal.condition, version.refusal.remedy.text); return; }
        const disk = await readProjectionIndex(root.location, true);
        if (disk.kind !== "index") { report("Projection restoration needs a usable index; retry after command-start recovery."); return; }
        const materialized = await materializeProjectionRoot({ root, source: store, configuration, version: version.result, index: disk.index, onlyDeleted: true });
        if (materialized.kind === "refused") report(materialized.mark.reason, materialized.mark.remedy.text);
      } finally { root.checkpoint = null; }
    }, { invalidatePartition: true, ...(root.ports.maxWaitMs === undefined ? {} : { maxWaitMs: root.ports.maxWaitMs }) }, root.ports.lock);
    if (result.status !== "done") report(`Projection restoration stopped (${result.status})${result.status === "mismatch" ? `: ${result.report}` : "."}`);
  } catch (error) { report(error instanceof Error ? error.message : String(error)); }
}
