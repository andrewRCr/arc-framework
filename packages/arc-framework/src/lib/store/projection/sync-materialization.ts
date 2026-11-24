/** Restore a sync command's projection before its network orchestration begins. */
import { renderRemedyArgument } from "../../../scripts/integration/spine-refusal.js";
import type { Store } from "../contract.js";
import type { StateVersion } from "../identity.js";
import { observeProjectionConfiguration } from "./command-configuration.js";
import { readProjectionConfiguration, type ProjectionConfiguration } from "./configuration.js";
import { refreshProjectionRootLayout } from "./engine-binding.js";
import { withProjectionFanOutLock } from "./fan-out-lock.js";
import { readProjectionIndex, type HeldProjectionIndexRead } from "./index-file.js";
import { materializeProjectionRoot } from "./materialization.js";
import { projectionProcessState, type ProjectionRootState } from "./process-state.js";
import { canonicalCheckout } from "./checkout-identity.js";
import type { ProjectionLockResult } from "./lock.js";
import { captureWriteBackFile } from "./write-back.js";
import { isStoredMarkdownVersion } from "./unchanged-file.js";
import { refuseProjectionEdit } from "./rights-binding.js";
import type { TakeInPort, TakeInRequest, TakeInResult } from "./take-in-port.js";
import { loadProjectionGroups, projectionIndexGroup, ProjectionPartitionMismatch } from "./index-memory.js";
import { readProjectionLinkBoundary } from "./discovery-links.js";
import { runSecondCheck } from "./second-check.js";
import { reportProjectionCopy } from "./report.js";
import { isArchivedPath } from "./paths.js";

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
        const materialized = await materializeForSync(root, store, configuration, version.result, disk);
        if (materialized.kind === "refused") report(materialized.mark.reason, materialized.mark.remedy.text);
      } finally { root.checkpoint = null; }
    }, { invalidatePartition: true, ...(root.ports.maxWaitMs === undefined ? {} : { maxWaitMs: root.ports.maxWaitMs }) }, root.ports.lock);
    if (result.status !== "done") {
      const stopped = restorationStopped(checkout, result);
      report(stopped.reason, stopped.remedy);
    }
  } catch (error) { report(error instanceof Error ? error.message : String(error)); }
}

async function materializeForSync(root: ProjectionRootState, source: Store, configuration: ProjectionConfiguration,
  version: StateVersion, disk: HeldProjectionIndexRead) {
  const takeIn: TakeInPort = request => restoreWithoutArchiveTakeIn(root, request);
  if (disk.kind !== "index") await settleStartCopies(root, takeIn);
  const firstCopy = root.copies.length;
  const basis = { root, source, configuration, version, reportedLinks: root.reportedLinks, takeIn };
  let materialized;
  try {
    materialized = await materializeProjectionRoot(disk.kind === "index" ? { ...basis, index: disk.index, onlyDeleted: true }
      : { ...basis, index: null, recovered: disk.header });
  } finally {
    // Finish copies made by the restoration under the same take-in policy.
    const copies = root.copies.splice(firstCopy);
    root.copies.push(...copies.map(copy => ({ ...copy, takeIn })));
  }
  if (disk.kind !== "index" && materialized.kind === "materialized") root.copies.splice(0, firstCopy);
  return materialized;
}

async function restoreWithoutArchiveTakeIn(root: ProjectionRootState, request: TakeInRequest): Promise<TakeInResult> {
  if (!isArchivedPath(request.path)) return root.takeIn(request);
  const file = await captureWriteBackFile(root.context, request);
  const report = (mark: NonNullable<typeof request.entry.refused>) => root.context.report?.({ path: request.path, copy: request.copy, mark });
  if (file.kind === "held") {
    if (file.diagnostic !== undefined) report(file.diagnostic);
    return file.result;
  }
  if (file.stamp !== null && await isStoredMarkdownVersion(root.context, request, file.content, file.stamp)) {
    return { answer: "no-edit", entry: request.entry, read: file.read };
  }
  const edit = `arc edit ${renderRemedyArgument(request.path)} then arc save`;
  const mark = await root.rights?.(request) ?? {
    reason: "An archived file changed during sync restoration.",
    remedy: { text: `Run ${request.entry.opened ? "arc save" : edit} from ${root.checkout} to retain this correction.` },
  };
  report(mark);
  return refuseProjectionEdit(request.entry, mark);
}

/**
 * Settle the copies recorded during start before a rebuild replaces their entries.
 * A copy in an unreadable partition stays for a later sweep.
 */
async function settleStartCopies(root: ProjectionRootState, takeIn: TakeInPort): Promise<void> {
  if (root.copies.length === 0) return;
  const start = await readProjectionIndex(root.location, true);
  if (start.kind !== "index") return;
  const copies = root.copies.filter(({ path, copy }) => {
    if (!root.writable(path) || !root.writable(copy)) return false;
    try { loadProjectionGroups(start.index, [projectionIndexGroup(path)]); return true; }
    catch (error) {
      if (error instanceof ProjectionPartitionMismatch) return false;
      throw error;
    }
  });
  if (copies.length === 0) return;
  const blockedByLink = await readProjectionLinkBoundary(root.checkout, copies.map(copy => copy.path), root.ports.linkFs);
  const checked = await runSecondCheck({ location: root.location, checkout: root.checkout, index: start.index, blockedByLink,
    copies, format: root.context.format, takeIn, writer: root.context.writer, checkpoint: root.context.checkpoint });
  for (const { path, copy, settlement } of checked.settled) {
    reportProjectionCopy(path, copy, settlement);
    if (settlement.kind === "returned" && settlement.replacement !== null) root.copies.push({ path, copy: settlement.replacement });
  }
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
