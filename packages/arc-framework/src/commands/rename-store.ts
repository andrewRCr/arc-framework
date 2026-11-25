/** Production checkout adapter for record-based rename. */
import type { RenameCommandContext } from "./rename.js";
import { createStore } from "../lib/store/create.js";
import { createDefaultStorePorts } from "../lib/store/default-store-ports.js";
import { createProjectionRemovalSlots } from "../lib/store/projection/removal-slots.js";
import type { ProjectionRemovalSlots } from "../lib/git/worktree-removal.js";
import type { ReconcileWorkUnitWorktreeContext } from "../lib/work-unit/mutators/reconcile-work-unit-worktree.js";
import { basename, resolve } from "node:path";
import { createNodeRenameWorktreeTransactionDriver, type RenameWorktreeMove, type RenameWorktreeTransactionOutcome } from "../lib/work-unit/rename-worktree-transaction.js";
import { readWorktreeMarkerGeneration, restoreWorktreeMarkerGeneration, type WorktreeMarkerGenerationReadResult } from "../lib/git/worktree-marker.js";
import { resolvePrimaryWorktreePath } from "../lib/git/worktree-roster.js";
import { reconcileWorkUnitWorktree, nodeReconcileWorkUnitWorktreeFs, resolveRenameWorktreeMove, type ReconcileWorkUnitWorktreeResult } from "../lib/work-unit/mutators/reconcile-work-unit-worktree.js";
import type { WorktreeRenameMovePending } from "../lib/git/worktree-marker.js";
import { GitProcessError } from "../lib/git/process-error.js";
import { digestBytes } from "../lib/kernel/index.js";
import type { GitExec } from "../lib/git/exec.js";
import { quoteShellArgument } from "../lib/release/commit-message-retry.js";
import type { StoreRenameCheckoutReceipt, StoreRenameCheckoutRequest, StoreRenameContext } from "../lib/work-unit/verbs/rename-store.js";

type RenameCheckoutCommand = Pick<RenameCommandContext, "cwd" | "io" | "store" | "identity">;
type PresentMarkerGeneration = Extract<WorktreeMarkerGenerationReadResult, { kind: "present" }>;

/** Bind the physical legs while the verb retains the record and transaction authority.
 * @param command - Resolved repository, identity, and production I/O.
 * @returns Before-batch checkout adapter.
 */
export function storeRenameAdapters(command: RenameCheckoutCommand): Pick<StoreRenameContext, "renameCheckout" | "settleCheckoutMove"> {
  const store = command.store ?? createStore(createDefaultStorePorts({ checkoutRoot: command.cwd, exec: command.io.exec }));
  const projectionRemovalSlots = createProjectionRemovalSlots({ store, identity: command.identity });
  return {
    renameCheckout: (request, onPrepared) => renameCheckout({ ...command, store }, projectionRemovalSlots, request, onPrepared),
    settleCheckoutMove: async (request) => {
      const landed = await landedMove(request);
      return landed === null ? null : renameCheckout({ ...command, store }, projectionRemovalSlots, request, undefined, landed);
    },
  };
}
/** A deferred move of this rename has landed once its checkout is registered at the recorded destination. */
async function landedMove(request: StoreRenameCheckoutRequest): Promise<PresentMarkerGeneration | null> {
  const generation = await readWorktreeMarkerGeneration(request.checkoutPath);
  if (generation.kind !== "present") return null;
  const pending = generation.marker.renameMovePending;
  return pending !== undefined && pending.newSlug === request.targetSlug && resolve(pending.to) === resolve(request.checkoutPath)
    ? generation : null;
}
async function renameCheckout(command: RenameCheckoutCommand, projectionRemovalSlots: ProjectionRemovalSlots, request: StoreRenameCheckoutRequest,
  onPrepared?: (receipt: StoreRenameCheckoutReceipt) => void, landed?: PresentMarkerGeneration): Promise<StoreRenameCheckoutReceipt> {
  const { cwd } = command, exec = command.io.exec;
  let currentCwd = cwd;
  const git: GitExec = (command, args, options) => exec(command, args, { cwd: currentCwd, ...options });
  const original = landed ?? await readWorktreeMarkerGeneration(request.checkoutPath);
  if (original.kind !== "present") throw new Error("The holding checkout has no readable ownership marker.");
  const primary = await resolvePrimaryWorktreePath(git);
  const leaf = basename(request.checkoutPath), offset = leaf.lastIndexOf(request.sourceSlug);
  const movable = landed === undefined && canMoveCheckout(original.marker.spawnedByArc, request.checkoutPath, primary, offset);
  const plan = movable ? await resolveRenameWorktreeMove(git, { worktreePath: request.checkoutPath,
    oldSlug: request.sourceSlug, newSlug: request.targetSlug, currentLocus: cwd, marker: original.marker }) : { status: "in-place" as const };
  const targetPath = plan.status === "move" ? plan.to : request.checkoutPath;
  const head = (await git("git", ["rev-parse", "HEAD"], { cwd: request.checkoutPath })).stdout.trim();
  const pending = plan.status === "deferred-self-move" ? await deferredMove(git, request, head, plan.to) : null;
  let worktree = pending === null ? undefined : deferredMoveNotice(pending, original.marker.createdFor);
  const move = targetPath === request.checkoutPath ? undefined : checkoutMove({ exec: git, store: command.store, projectionRemovalSlots }, cwd, request.checkoutPath, targetPath, (result) => {
    worktree = result;
    if (result.mutation === "move" && result.locusHopped) currentCwd = result.to;
  });
  const driver = createNodeRenameWorktreeTransactionDriver({ exec: git });
  const outcome = await driver.rename({ sourceCheckoutPath: request.checkoutPath, targetCheckoutPath: targetPath,
    sourceSlug: request.sourceSlug, targetSlug: request.targetSlug, expectedHead: head, expectedMarkerGeneration: digestBytes(original.bytes),
    renameMovePending: pending, ...(move === undefined ? {} : { move }) });
  requireRenamedCheckout(outcome, landed !== undefined);
  const receipt: StoreRenameCheckoutReceipt = { report: { checkout: outcome, ...(worktree === undefined ? {} : { worktree }) },
    shape: original.marker.spawnedByArc && resolve(request.checkoutPath) !== resolve(primary ?? request.checkoutPath) ? "spawned" : "in-place",
    repositoryCwd: resolve(cwd) === resolve(request.checkoutPath) ? targetPath : cwd,
    rollback: async () => {
      const current = await readWorktreeMarkerGeneration(targetPath);
      if (current.kind !== "present" || digestBytes(current.bytes) !== outcome.markerGeneration) throw new Error("Checkout marker changed before rename rollback.");
      const inverse = await driver.rename({ sourceCheckoutPath: targetPath, targetCheckoutPath: request.checkoutPath,
        sourceSlug: request.targetSlug, targetSlug: request.sourceSlug, expectedHead: head, expectedMarkerGeneration: outcome.markerGeneration,
        renameMovePending: null,
        ...(move === undefined ? {} : { move: { apply: move.rollback, rollback: move.apply } }) });
      if (inverse.kind === "refused" || inverse.kind === "unmanaged") throw new Error("Checkout rename rollback refused its marker or topology.");
      const reverted = await readWorktreeMarkerGeneration(request.checkoutPath);
      if (reverted.kind !== "present" || digestBytes(reverted.bytes) !== inverse.markerGeneration) throw new Error("Checkout marker changed during rename rollback.");
      const restored = await restoreWorktreeMarkerGeneration(request.checkoutPath, reverted.bytes, original.bytes);
      if (restored.kind !== "replaced") throw new Error("Checkout rename rollback lost the original marker generation.");
    } };
  onPrepared?.(receipt);
  const renamed = await readWorktreeMarkerGeneration(targetPath);
  if (renamed.kind !== "present" || digestBytes(renamed.bytes) !== outcome.markerGeneration) throw new Error("Checkout marker changed after its rename transaction.");
  return receipt;
}
function requireRenamedCheckout(outcome: RenameWorktreeTransactionOutcome, settling: boolean):
  asserts outcome is Extract<RenameWorktreeTransactionOutcome, { kind: "renamed" | "idempotent" }> {
  if (outcome.kind === "refused" || outcome.kind === "unmanaged") {
    const reason = outcome.kind === "refused" ? outcome.reason : "ownership unavailable";
    throw new Error(settling
      ? `Checkout move settlement refused: ${reason}. Run arc agenda session-init --json from outside the checkout to inspect the current move before retrying.`
      : `Checkout rename refused: ${reason}.`);
  }
}
function canMoveCheckout(spawned: boolean, checkout: string, primary: string | null, offset: number): boolean {
  return spawned && resolve(checkout) !== resolve(primary ?? checkout) && offset !== -1;
}
function deferredMoveNotice(pending: WorktreeRenameMovePending, subject: PresentMarkerGeneration["marker"]["createdFor"]): ReconcileWorkUnitWorktreeResult {
  const operand = subject?.kind === "work-unit" ? subject.uid ?? pending.oldSlug : pending.oldSlug;
  return {
    mutation: "move", from: pending.from, to: pending.to, locusHopped: false,
    followUpNotice: `Move the worktree from outside the worktree: git worktree move -f -f ${quoteShellArgument(pending.from)} ${quoteShellArgument(pending.to)}, `
      + `then run arc rename ${operand} ${pending.newSlug} to settle the move`,
  };
}
async function deferredMove(exec: GitExec, request: StoreRenameCheckoutRequest, head: string, to: string): Promise<WorktreeRenameMovePending> {
  let branch: string | null;
  try { branch = (await exec("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: request.checkoutPath })).stdout.trim(); }
  catch (error) { if (!(error instanceof GitProcessError && error.exitCode === 1)) throw error; branch = null; }
  return { oldSlug: request.sourceSlug, newSlug: request.targetSlug, branch, head, from: request.checkoutPath, to };
}
function checkoutMove(context: Pick<ReconcileWorkUnitWorktreeContext, "exec" | "store"> & { projectionRemovalSlots: ProjectionRemovalSlots }, cwd: string, from: string, to: string, remember: (result: ReconcileWorkUnitWorktreeResult) => void): RenameWorktreeMove {
  const move = async (source: string, target: string, locus: string): Promise<void> => {
    const result = await reconcileWorkUnitWorktree({ ...context, projectionRemovalSlots: context.projectionRemovalSlots,
      fs: nodeReconcileWorkUnitWorktreeFs, chdir: (path) => { process.chdir(path); } },
      { mutation: "move", from: source, to: target, currentLocus: locus });
    if (result.mutation === "move" && result.followUpNotice !== undefined) throw new Error(result.followUpNotice);
    remember(result);
  };
  return { apply: () => move(from, to, cwd), rollback: () => move(to, from, resolve(cwd) === resolve(from) ? to : cwd) };
}
