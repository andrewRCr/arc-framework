/** Production checkout and personal-workspace adapters for record-based rename. */
import { basename, dirname, join, resolve } from "node:path";
import { runUserRenameWorkspace, type UserIOContext } from "./user.js";
import { createNodeRenameWorktreeTransactionDriver, type RenameWorktreeMove } from "../lib/work-unit/rename-worktree-transaction.js";
import { readWorktreeMarkerGeneration, restoreWorktreeMarkerGeneration } from "../lib/git/worktree-marker.js";
import { resolvePrimaryWorktreePath } from "../lib/git/worktree-roster.js";
import { reconcileWorkUnitWorktree, nodeReconcileWorkUnitWorktreeFs, type ReconcileWorkUnitWorktreeResult } from "../lib/work-unit/mutators/reconcile-work-unit-worktree.js";
import { digestBytes } from "../lib/kernel/index.js";
import type { GitExec } from "../lib/git/exec.js";
import type { StoreRenameCheckoutReceipt, StoreRenameCheckoutRequest, StoreRenameContext } from "../lib/work-unit/verbs/rename-store.js";

/** Bind the physical legs while the verb retains the record and transaction authority.
 * @param command - Resolved repository, identity, and production I/O.
 * @returns Before-batch checkout and after-batch personal workspace adapters.
 */
export function storeRenameAdapters(command: { cwd: string; identity: string; io: UserIOContext }): Pick<StoreRenameContext, "renameCheckout" | "renameWorkspace"> {
  return {
    renameCheckout: (request) => renameCheckout(command.io.exec, command.cwd, request),
    renameWorkspace: async (request) => { await runUserRenameWorkspace({ cwd: request.cwd, io: command.io, identity: command.identity,
      currentWuName: request.targetSlug, oldWuName: request.sourceSlug, newWuName: request.targetSlug }); },
  };
}
async function renameCheckout(exec: GitExec, cwd: string, request: StoreRenameCheckoutRequest): Promise<StoreRenameCheckoutReceipt> {
  let currentCwd = cwd;
  const git: GitExec = (command, args, options) => exec(command, args, { cwd: currentCwd, ...options });
  const original = await readWorktreeMarkerGeneration(request.checkoutPath);
  if (original.kind !== "present") throw new Error("The holding checkout has no readable ownership marker.");
  const primary = await resolvePrimaryWorktreePath(git);
  const leaf = basename(request.checkoutPath), offset = leaf.lastIndexOf(request.sourceSlug);
  const movable = original.marker.spawnedByArc && resolve(request.checkoutPath) !== resolve(primary ?? request.checkoutPath) && offset !== -1;
  const targetPath = movable ? join(dirname(request.checkoutPath), `${leaf.slice(0, offset)}${request.targetSlug}${leaf.slice(offset + request.sourceSlug.length)}`) : request.checkoutPath;
  const head = (await git("git", ["rev-parse", "HEAD"], { cwd: request.checkoutPath })).stdout.trim();
  let worktree: ReconcileWorkUnitWorktreeResult | undefined;
  const move = targetPath === request.checkoutPath ? undefined : checkoutMove(git, cwd, request.checkoutPath, targetPath, (result) => {
    worktree = result;
    if (result.mutation === "move" && result.locusHopped) currentCwd = result.to;
  });
  const driver = createNodeRenameWorktreeTransactionDriver({ exec: git });
  const outcome = await driver.rename({ sourceCheckoutPath: request.checkoutPath, targetCheckoutPath: targetPath,
    sourceSlug: request.sourceSlug, targetSlug: request.targetSlug, expectedHead: head, expectedMarkerGeneration: digestBytes(original.bytes),
    renameMovePending: null, ...(move === undefined ? {} : { move }) });
  if (outcome.kind === "refused" || outcome.kind === "unmanaged") throw new Error(`Checkout rename refused: ${outcome.kind === "refused" ? outcome.reason : "ownership unavailable"}.`);
  const renamed = await readWorktreeMarkerGeneration(targetPath);
  if (renamed.kind !== "present" || digestBytes(renamed.bytes) !== outcome.markerGeneration) throw new Error("Checkout marker changed after its rename transaction.");
  return { report: { checkout: outcome, ...(worktree === undefined ? {} : { worktree }) },
    shape: original.marker.spawnedByArc && resolve(request.checkoutPath) !== resolve(primary ?? request.checkoutPath) ? "spawned" : "in-place",
    repositoryCwd: resolve(cwd) === resolve(request.checkoutPath) ? targetPath : cwd,
    rollback: async () => {
      const current = await readWorktreeMarkerGeneration(targetPath);
      if (current.kind !== "present" || !current.bytes.equals(renamed.bytes)) throw new Error("Checkout marker changed before rename rollback.");
      const inverse = await driver.rename({ sourceCheckoutPath: targetPath, targetCheckoutPath: request.checkoutPath,
        sourceSlug: request.targetSlug, targetSlug: request.sourceSlug, expectedHead: head, expectedMarkerGeneration: outcome.markerGeneration,
        ...(move === undefined ? {} : { move: { apply: move.rollback, rollback: move.apply } }) });
      if (inverse.kind === "refused" || inverse.kind === "unmanaged") throw new Error("Checkout rename rollback refused its marker or topology.");
      const reverted = await readWorktreeMarkerGeneration(request.checkoutPath);
      if (reverted.kind !== "present" || digestBytes(reverted.bytes) !== inverse.markerGeneration) throw new Error("Checkout marker changed during rename rollback.");
      const restored = await restoreWorktreeMarkerGeneration(request.checkoutPath, reverted.bytes, original.bytes);
      if (restored.kind !== "replaced") throw new Error("Checkout rename rollback lost the original marker generation.");
    } };
}
function checkoutMove(exec: GitExec, cwd: string, from: string, to: string, remember: (result: ReconcileWorkUnitWorktreeResult) => void): RenameWorktreeMove {
  const move = async (source: string, target: string, locus: string): Promise<void> => {
    const result = await reconcileWorkUnitWorktree({ exec, fs: nodeReconcileWorkUnitWorktreeFs, chdir: (path) => { process.chdir(path); } },
      { mutation: "move", from: source, to: target, currentLocus: locus });
    if (result.mutation === "move" && result.followUpNotice !== undefined) throw new Error(result.followUpNotice);
    remember(result);
  };
  return { apply: () => move(from, to, cwd), rollback: () => move(to, from, resolve(cwd) === resolve(from) ? to : cwd) };
}
