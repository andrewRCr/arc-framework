/** Record-based work-unit rename with recoverable physical identity steps. */
import { readStoreRenameSubject, prepareStoreRename, type StoreRenameSubject } from "../../store/lifecycle-rename.js";
import { usesOffBranchState } from "../../store/lifecycle-write.js";
import { pullHistoryForRetry } from "../../store/pull-consumption.js";
import { selectWorkBranchLink, workBranchName } from "../../store/lifecycle-branch.js";
import { applyPreparedLifecycleWrite } from "../prepared-lifecycle-write.js";
import { readBranchTracking, restoreClearedBranchTracking, type BranchTracking } from "../rename-branch-tracking.js";
import { sequenceLifecycleWrite } from "../sequence-lifecycle-write.js";
import { findWorkUnitHoldingCheckout } from "./unshared-work.js";
import { reconcileRenameLocalBranch, reconcileRenameRemoteBranch, readRemoteBranchOid, type RenameRemoteBranchResult } from "../rename-identity.js";
import { SlugSchema } from "../../kernel/index.js";
import type { BranchLink } from "../../store/links.js";
import type { LifecycleGitStep } from "../store-transition-types.js";
import type { Store } from "../../store/contract.js";
import type { GitExec } from "../../git/exec.js";
import type { LocusPorts } from "../locus-ports.js";
import { resolveSubjectOperand } from "../../store/subject-operand.js";
import { RecordReferenceSchema } from "../../store/identity.js";
import type { StoreRecord } from "../../store/read.js";
import type { RunRenameResult, RenameCheckoutReport, RenameSubjectShape } from "./rename.js";
import { emptyRenameReport, type RenameReport, type RenameKeptBranch } from "../rename-report.js";
/** A checkout rename retains its exact inverse until the record batch lands. */
export interface StoreRenameCheckoutReceipt { report: RenameCheckoutReport; rollback: () => Promise<void>; repositoryCwd?: string; shape?: "spawned" | "in-place" }
/** Physical checkout rename coordinates are marker-selected, independent of Branch. */
export interface StoreRenameCheckoutRequest { checkoutPath: string; sourceSlug: string; targetSlug: string }
/** Store and physical boundaries supplied by the production command adapter. */
export interface StoreRenameContext {
  store: Store; cwd: string; exec: GitExec; baseBranch: string; projectId?: () => Promise<string>; locusPorts?: LocusPorts;
  renameCheckout?: (request: StoreRenameCheckoutRequest, onPrepared?: (receipt: StoreRenameCheckoutReceipt) => void) => Promise<StoreRenameCheckoutReceipt>;
  onPreparedAdvisories?: (advisories: readonly string[]) => Promise<void>;
  /** Where a history pull's notices are written; standard error by default. */
  writeNotice?: (line: string) => void;
}
interface BranchRename { prior: BranchLink; next: BranchLink; oldBranch: string; newBranch: string; oldRemoteOid: string | null }
/** Rename one logical owner while respecting record and checkout authority.
 * @param ctx - Operational store and physical adapters.
 * @param params - Subject operand and proposed current name.
 * @returns A complete rename, original refusal, or exact physical continuation.
 */
export async function runStoreRename(ctx: StoreRenameContext, params: { operand: string; targetSlug: string }): Promise<RunRenameResult> {
  try {
    const result = await rename(ctx, params);
    if (result.status !== "rejected" || result.recovery !== undefined || result.refusal?.code !== "state-unresolvable"
      || result.refusal.historyRefs.length === 0) return result;
    return await pullHistoryForRetry(ctx.store, result.refusal.historyRefs, ctx.writeNotice) ? await rename(ctx, params) : result;
  }
  catch (error) { return { status: "rejected", reason: error instanceof Error ? error.message : String(error) }; }
}
async function rename(ctx: StoreRenameContext, params: { operand: string; targetSlug: string }): Promise<RunRenameResult> {
  if (!usesOffBranchState(ctx.store)) return { status: "rejected", reason: "Store rename is unsupported before the storage flip." };
  const target = SlugSchema.parse(params.targetSlug), selection = await selectRenamePrimary(ctx.store, params.operand);
  if (selection.status === "rejected") return selection;
  if (selection.primary.reference.kind === "cohort/document") return renameCohort(selection.primary);
  const selected = await readStoreRenameSubject(ctx.store, { primary: selection.primary, operand: params.operand, targetSlug: target });
  if (selected.status === "refused") return { status: "rejected", reason: selected.refusal.condition, refusal: selected.refusal };
  return renameSelectedWorkUnit(ctx, params, selected.result, target);
}

async function selectRenamePrimary(store: Store, operand: string): Promise<
  { status: "selected"; primary: StoreRecord } | Extract<RunRenameResult, { status: "rejected" }>> {
  const selected = await resolveSubjectOperand(store, { operand, primaryKinds: ["work-item/meta", "work-item/record", "cohort/document"],
    typeRule: "rename", resolveSlug: true });
  if (selected.status === "selected") return selected;
  if (selected.status === "refused") return { status: "rejected", reason: selected.refusal.condition, refusal: selected.refusal };
  return selected.status === "unselected" ? { status: "rejected", reason: selected.condition, remedy: selected.remedy }
    : { status: "rejected", reason: "The operand did not select a rename subject." };
}

function renameCohort(primary: StoreRecord): Extract<RunRenameResult, { status: "rejected" }> {
  const reason = `Cohort rename for ${primary.reference.owner.name} is not available yet.`;
  return { status: "rejected", reason, reference: primary.reference, refusal: { code: "unsupported", class: "terminal", case: "rename",
    condition: reason, remedy: { text: "Keep this cohort's current name, or name a work unit." } } };
}

async function renameSelectedWorkUnit(ctx: StoreRenameContext, params: { operand: string; targetSlug: string },
  subject: StoreRenameSubject, target: string): Promise<RunRenameResult> {
  await ctx.onPreparedAdvisories?.(subject.advisories);
  const passive = subject.primary.placement?.kind !== "active";
  const holder = passive ? null : await findWorkUnitHoldingCheckout(ctx, subject.primary);
  const branch = passive ? undefined : await branchRename(ctx, subject, target);
  const state: RenameRuntime = { cwd: ctx.cwd };
  const exec: GitExec = (command, args, options) => ctx.exec(command, args, { cwd: state.cwd, ...options });
  const persisted = await persistRename({ ...ctx, exec }, subject, target, holder, branch, state);
  if (persisted !== undefined) return persisted;
  const report = { ...(state.report ?? emptyRenameReport()), keptBranches: retainedBranchReport(subject.primary, branch).keptBranches };
  const post = await finishRename({ ...ctx, exec, cwd: state.cwd }, branch, params);
  const reference = RecordReferenceSchema.parse({ ...subject.primary.reference, owner: { ...subject.primary.reference.owner, name: target } });
  if (post.status === "partial") return { ...post, reference, report };
  const shape: RenameSubjectShape = subject.primary.placement?.kind === "backlog" ? "stub"
    : subject.primary.placement?.kind === "completed" ? "archived" : state.checkout?.shape ?? (holder === null ? "in-place" : "spawned");
  return { status: "renamed", reference, shape, recordBatch: subject.resuming ? "existing" : "applied", pendingIntegration: false,
    advisories: subject.advisories, remote: post.remote,
    report,
    ...(state.checkout === undefined ? {} : state.checkout.report) };
}
function retainedBranchReport(primary: StoreRecord, branch: BranchRename | undefined): RenameReport {
  const keptBranches: RenameKeptBranch[] = (primary.links?.branches ?? []).filter((link) => branch === undefined
    || link.repository !== branch.prior.repository || (link.ref !== branch.prior.ref && link.ref !== branch.next.ref))
    .map((link) => ({ branch: link.ref, reason: "other-link" }));
  if (branch?.prior.linkedAs === "adopted" && branch.oldRemoteOid !== null) keptBranches.push({ branch: branch.oldBranch, reason: "adopted" });
  return { ...emptyRenameReport(), keptBranches };
}
interface RenameRuntime { cwd: string; checkout?: StoreRenameCheckoutReceipt; report?: RenameReport }
async function persistRename(ctx: StoreRenameContext, subject: StoreRenameSubject, target: string, holder: string | null,
  branch: BranchRename | undefined, state: RenameRuntime): Promise<Extract<RunRenameResult, { status: "rejected" }> | undefined> {
  if (subject.resuming) return undefined;
  const prepared = await prepareStoreRename(ctx.store, subject, target, branch);
  if (prepared.status === "refused") return { status: "rejected", reason: prepared.refusal.condition, refusal: prepared.refusal };
  const steps = renameSteps(ctx, subject, target, holder, branch, (receipt) => {
    state.checkout = receipt; state.cwd = receipt.repositoryCwd ?? state.cwd;
  }, () => { state.cwd = ctx.cwd; });
  const written = await sequenceLifecycleWrite({ side: "before", steps,
    write: () => applyPreparedLifecycleWrite(ctx.store, prepared.result, { verb: "rename", lifecycleAction: "rename" }) });
  if (written.status === "failed") return { status: "rejected", reason: written.reason, ...(written.recovery === undefined ? {} : { recovery: written.recovery }) };
  if (written.status === "refused") return { status: "rejected", reason: `${written.refusal.condition}${written.rollbackFailure === undefined ? "" : `; rollback failed: ${written.rollbackFailure}`}`, refusal: written.refusal, ...(written.recovery === undefined ? {} : { recovery: written.recovery }) };
  state.report = prepared.result.report;
  return undefined;
}
async function branchRename(ctx: StoreRenameContext, subject: StoreRenameSubject, target: string): Promise<BranchRename | undefined> {
  if ((subject.primary.links?.branches?.length ?? 0) === 0) return undefined;
  const repository = await ctx.projectId?.();
  const selected = selectWorkBranchLink(subject.primary, { repository });
  if (selected.kind === "ambiguous") throw new Error(selected.reason);
  if (selected.kind === "none") return undefined;
  const name = subject.resuming ? target : subject.originName, actual = workBranchName(selected.link.ref);
  if (!new RegExp(`^[^/]+/${name}$`, "u").test(actual)) return undefined;
  const oldBranch = `${actual.slice(0, actual.lastIndexOf("/") + 1)}${subject.originName}`;
  const newBranch = `${oldBranch.slice(0, oldBranch.lastIndexOf("/") + 1)}${target}`;
  const prior = subject.resuming ? { ...selected.link, ref: selected.link.ref.replace(new RegExp(`${target}$`, "u"), subject.originName) } : selected.link;
  const next = { ...selected.link, ref: prior.ref.replace(new RegExp(`${subject.originName}$`, "u"), target) };
  const remote = await ctx.exec("git", ["remote"], { cwd: ctx.cwd });
  const oldRemoteOid = remote.stdout.split(/\s+/u).includes("origin") ? await readRemoteBranchOid(ctx.exec, "origin", oldBranch) : null;
  return { prior, next, oldBranch, newBranch, oldRemoteOid };
}
function renameSteps(ctx: StoreRenameContext, subject: StoreRenameSubject, target: string, holder: string | null,
  branch: BranchRename | undefined, remember: (receipt: StoreRenameCheckoutReceipt) => void, reset: () => void): LifecycleGitStep[] {
  const retryCommand = ["arc", "rename", subject.operand, target];
  const steps: LifecycleGitStep[] = [];
  if (branch !== undefined) steps.push(localBranchStep(ctx, branch, retryCommand));
  if (holder !== null) {
    let receipt: StoreRenameCheckoutReceipt | undefined;
    steps.push({ name: "checkout-rename", retryCommand,
      run: async () => {
        if (ctx.renameCheckout === undefined) throw new Error("The holding checkout's rename transaction is not bound.");
        receipt = await ctx.renameCheckout({ checkoutPath: holder, sourceSlug: subject.originName, targetSlug: target },
          (prepared) => { receipt = prepared; remember(prepared); });
        remember(receipt);
      }, rollback: async () => { await receipt?.rollback(); reset(); } });
  }
  return steps;
}
function localBranchStep(ctx: StoreRenameContext, branch: BranchRename, retryCommand: string[]): LifecycleGitStep {
  let changed = false, cleared: BranchTracking | undefined;
  const exec: GitExec = async (command, args, options) => {
    const clearsTracking = command === "git" && args[0] === "branch" && args[1] === "--unset-upstream" && args[2] === branch.newBranch;
    const prior = clearsTracking ? await readBranchTracking(ctx.exec, branch.newBranch) : undefined;
    const result = await ctx.exec(command, args, options);
    if (prior !== undefined) cleared = prior;
    if (command === "git" && args[0] === "branch" && args[1] === "-m" && args[2] === branch.oldBranch && args[3] === branch.newBranch) changed = true;
    return result;
  };
  return { name: "local-branch-rename", retryCommand,
    run: async () => { await reconcileRenameLocalBranch({ exec }, branch); },
    rollback: async () => {
      if (!changed) return;
      await ctx.exec("git", ["branch", "-m", branch.newBranch, branch.oldBranch]);
      if (cleared !== undefined) await restoreClearedBranchTracking(ctx.exec, branch.oldBranch, cleared);
    } };
}
async function finishRename(ctx: StoreRenameContext, branch: BranchRename | undefined,
  request: { operand: string; targetSlug: string }): Promise<{ status: "complete"; remote: RenameRemoteBranchResult } | Omit<Extract<RunRenameResult, { status: "partial" }>, "report">> {
  try {
    const remote = branch === undefined ? { status: "unpublished" as const } : await reconcileRenameRemoteBranch(ctx, {
      ...branch, remote: "origin", keepOld: branch.prior.linkedAs === "adopted" });
    if (remote.status === "stale") throw new Error(`Old remote head moved from ${remote.expectedOid} to ${remote.actualOid ?? "[absent]"}.`);
    return { status: "complete", remote };
  } catch (error) { return { status: "partial", reason: error instanceof Error ? error.message : String(error),
    remedy: { text: "Finish the remaining remote branch rename.", argv: ["arc", "rename", request.operand, request.targetSlug] } }; }
}
