/** Restore a sync command's projection before its network orchestration begins. */
import type { Store } from "../contract.js";
import { observeProjectionConfiguration } from "./command-configuration.js";
import { readProjectionConfiguration } from "./configuration.js";
import { refreshProjectionRootLayout } from "./engine-binding.js";
import { withProjectionFanOutLock } from "./fan-out-lock.js";
import { readProjectionIndex } from "./index-file.js";
import { materializeProjectionRoot } from "./materialization.js";
import { projectionProcessState, type ProjectionRootState } from "./process-state.js";
import { canonicalCheckout } from "./checkout-identity.js";
import type { ProjectionLockResult } from "./lock.js";
import { loadProjectionGroups, projectionIndexGroup, ProjectionPartitionMismatch } from "./index-memory.js";
import { readCopyDestinations } from "./discovery-links.js";
import { runSecondCheck } from "./second-check.js";
import { reportProjectionCopy } from "./report.js";
import { heldArchivePath, refuseArchiveChange } from "./archive-selection.js";

/** Materialize through the command's existing root, retaining its copy checks and containing failures. */
export async function restoreSyncProjection(store: Store, requested: string, options: { dryRun?: boolean }): Promise<void> {
  if (!store.capabilities.stateOffBranch || options.dryRun) return;
  const checkout = await canonicalCheckout(requested);
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
        const disk = await readProjectionIndex(root.location, true, { groups: "all" });
        const basis = { root, source: store, configuration, version: version.result, reportedLinks: root.reportedLinks };
        if (disk.kind !== "index") await settleCommandCopies(root);
        const materialized = await materializeProjectionRoot(disk.kind === "index"
          ? { ...basis, index: disk.index, onlyDeleted: true }
          : { ...basis, index: null, recovered: disk.header });
        if (disk.kind !== "index") {
          const copies = new Map(root.copies.map(copy => [copy.copy, copy]));
          root.copies.splice(0, root.copies.length, ...copies.values());
        }
        if (materialized.kind === "refused") report(materialized.mark.reason, materialized.mark.remedy.text);
      } finally { root.checkpoint = null; }
    }, { invalidatePartition: true, ...(root.ports.maxWaitMs === undefined ? {} : { maxWaitMs: root.ports.maxWaitMs }) }, root.ports.lock);
    if (result.status !== "done") {
      const stopped = restorationStopped(checkout, result);
      report(stopped.reason, stopped.remedy);
    }
  } catch (error) { report(error instanceof Error ? error.message : String(error)); }
}

/**
 * Settle the aside copies this command already made against the entries that alone record them, before a rebuild
 * replaces those entries. A copy whose own partition cannot be read stays for the next command's sweep.
 */
async function settleCommandCopies(root: ProjectionRootState): Promise<void> {
  if (root.copies.length === 0) return;
  const start = await readProjectionIndex(root.location, true);
  if (start.kind !== "index") return;
  const readable = root.copies.filter(({ path }) => {
    if (heldArchivePath(root, path) !== null) return false;
    try { loadProjectionGroups(start.index, [projectionIndexGroup(path)]); return true; }
    catch (error) {
      if (error instanceof ProjectionPartitionMismatch) return false;
      throw error;
    }
  });
  if (readable.length === 0) return;
  const destinations = await readCopyDestinations(root.checkout, readable.map(copy => copy.path), root.ports.linkFs);
  const checked = await runSecondCheck({ location: root.location, checkout: root.checkout, index: start.index, ...destinations,
    copies: readable, format: root.context.format, takeIn: root.takeIn, writer: root.context.writer,
    checkpoint: root.context.checkpoint });
  for (const [path, mark] of checked.blockedDestinations) refuseArchiveChange(root, path, mark);
  const settled = new Set<string>();
  for (const copy of checked.settled) {
    if (checked.blockedDestinations.has(copy.path)) continue;
    reportProjectionCopy(copy.path, copy.copy, copy.settlement);
    settled.add(copy.copy);
  }
  root.copies.splice(0, root.copies.length, ...root.copies.filter(copy => !settled.has(copy.copy)));
}

/** The lease status that stopped a restoration, with its detail and the remedy that fits it. */
function restorationStopped(checkout: string, result: Exclude<ProjectionLockResult<unknown>, { status: "done" }>): { reason: string; remedy: string } {
  if (result.status === "held") return { reason: `Projection restoration waited on a lease another command holds: ${JSON.stringify(result.holder)}.`,
    remedy: "Retry arc sync once that command finishes." };
  if (result.status === "lost") return { reason: `Projection restoration lost its lease: ${result.report}`, remedy: "Retry arc sync." };
  if (result.status === "mismatch") {
    return { reason: `Projection restoration found a mismatched index partition: ${result.report}`, remedy: "Retry arc sync." };
  }
  return { reason: "Projection restoration found the worktree's Git directory missing.",
    remedy: `Repair the worktree at ${checkout} with git worktree repair, or remove it, then retry arc sync.` };
}
