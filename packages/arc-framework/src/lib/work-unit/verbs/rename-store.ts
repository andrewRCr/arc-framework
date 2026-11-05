/** Record-based work-unit rename with recoverable physical identity steps. */
import { readStoreRenameSubject, prepareStoreRename, type StoreRenameSubject } from "../../store/lifecycle-rename.js";
import { usesOffBranchState, batchLifecycleWrites, recordPut, mergeLifecycleLinks } from "../../store/lifecycle-write.js";
import { observeRecords } from "../../store/record-observations.js";
import { pullHistoryForRetry } from "../../store/pull-consumption.js";
import { selectWorkBranchLink, workBranchName } from "../../store/lifecycle-branch.js";
import { applyPreparedLifecycleWrite } from "../prepared-lifecycle-write.js";
import { readBranchTracking, restoreClearedBranchTracking, type BranchTracking } from "../rename-branch-tracking.js";
import { sequenceLifecycleWrite, type LifecycleWriteSequence } from "../sequence-lifecycle-write.js";
import { readWorkUnitCheckout } from "./unshared-work.js";
import { reconcileRenameLocalBranch, reconcileRenameRemoteBranch, readRemoteBranchOid, type RenameRemoteBranchResult } from "../rename-identity.js";
import { SlugSchema } from "../../kernel/index.js";
import type { BranchLink } from "../../store/links.js";
import type { LifecycleGitStep } from "../store-transition-types.js";
import type { Store } from "../../store/contract.js";
import type { GitExec } from "../../git/exec.js";
import type { LocusPorts } from "../locus-ports.js";
import { resolveSubjectOperand } from "../../store/subject-operand.js";
import { RecordReferenceSchema, sameOwner } from "../../store/identity.js";
import type { StoreRecord } from "../../store/read.js";
import type { HistoryRef, StoreResult, Remedy } from "../../store/refusal.js";
import type { LookupResult } from "../../store/lookup.js";
import { observeRenameFormerName } from "../../store/rename-reference-resolution.js";
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
interface BranchRename {
  prior: BranchLink; next: BranchLink; oldBranch: string; newBranch: string; oldRemoteOid: string | null;
  local: boolean; catchUp: boolean; kept?: RenameKeptBranch; remotePolicy: { keepOld: boolean; kept?: RenameKeptBranch };
}
type BranchCoordinates = Pick<BranchRename, "prior" | "next" | "oldBranch" | "newBranch" | "catchUp">;
/** Rename one logical owner while respecting record and checkout authority.
 * @param ctx - Operational store and physical adapters.
 * @param params - Subject operand and proposed current name.
 * @returns A complete rename, latest refusal, or exact physical continuation.
 */
export async function runStoreRename(ctx: StoreRenameContext, params: { operand: string; targetSlug: string }): Promise<RunRenameResult> {
  try {
    const pulled = new Set<HistoryRef>();
    let result = await rename(ctx, params);
    while (result.status === "rejected" && result.recovery === undefined && result.refusal?.code === "state-unresolvable") {
      const refs = result.refusal.historyRefs;
      if (refs.every(reference => pulled.has(reference))) return result;
      for (const reference of refs) pulled.add(reference);
      if (!await pullHistoryForRetry(ctx.store, refs, ctx.writeNotice)) return result;
      result = await rename(ctx, params);
    }
    return result;
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
  const checkout = passive ? { kind: "none" as const } : await readWorkUnitCheckout(ctx, subject.primary);
  if (checkout.kind === "unbound") return { status: "rejected", reason: checkout.reason, unbound: checkout, reference: subject.primary.reference };
  const holder = checkout.kind === "held" ? checkout.path : null;
  const branch = passive ? undefined : await branchRename(ctx, subject, target, holder);
  const state: RenameRuntime = { cwd: ctx.cwd };
  const exec: GitExec = (command, args, options) => ctx.exec(command, args, { cwd: state.cwd, ...options });
  const persisted = await persistRename({ ...ctx, exec }, subject, target, holder, branch, state);
  if (persisted !== undefined) return persisted;
  const former = await observeRenameFormerName(ctx.store, subject.originName);
  const report = { ...(state.report ?? emptyRenameReport()), formerSlugTies: former.ties,
    keptBranches: retainedBranchReport(subject.primary, branch).keptBranches };
  const post = await finishRename({ ...ctx, exec, cwd: state.cwd }, branch, params);
  const reference = RecordReferenceSchema.parse({ ...subject.primary.reference, owner: { ...subject.primary.reference.owner, name: target } });
  if (post.status === "partial") return { ...post, reason: [post.reason, ...former.advisories].join("\n"), reference, report };
  const shape: RenameSubjectShape = subject.primary.placement?.kind === "backlog" ? "stub"
    : subject.primary.placement?.kind === "completed" ? "archived" : state.checkout?.shape ?? (holder === null ? "in-place" : "spawned");
  return { status: "renamed", reference, shape, recordBatch: state.recordBatch ?? "existing", pendingIntegration: false,
    advisories: [...subject.advisories, ...former.advisories], remote: post.remote,
    report,
    ...(state.checkout === undefined ? {} : state.checkout.report) };
}
function retainedBranchReport(primary: StoreRecord, branch: BranchRename | undefined): RenameReport {
  const keptBranches: RenameKeptBranch[] = (primary.links?.branches ?? []).filter((link) => branch === undefined
    || link.repository !== branch.prior.repository || (link.ref !== branch.prior.ref && link.ref !== branch.next.ref))
    .map((link) => ({ branch: link.ref, reason: "other-link" }));
  if (branch?.kept !== undefined) keptBranches.push(branch.kept);
  if (branch?.local && branch.oldRemoteOid !== null && branch.remotePolicy.kept !== undefined) keptBranches.push(branch.remotePolicy.kept);
  return { ...emptyRenameReport(), keptBranches };
}
interface RenameRuntime { cwd: string; checkout?: StoreRenameCheckoutReceipt; report?: RenameReport; recordBatch?: "applied" }
async function persistRename(ctx: StoreRenameContext, subject: StoreRenameSubject, target: string, holder: string | null,
  branch: BranchRename | undefined, state: RenameRuntime): Promise<Extract<RunRenameResult, { status: "rejected" }> | undefined> {
  if (subject.resuming) return branch?.catchUp ? persistCatchUp(ctx, subject, branch, state) : undefined;
  const prepared = await prepareStoreRename(ctx.store, subject, target, branch?.local ? branch : undefined);
  if (prepared.status === "refused") return { status: "rejected", reason: prepared.refusal.condition, refusal: prepared.refusal };
  const steps = renameSteps(ctx, subject, target, holder, branch, (receipt) => {
    state.checkout = receipt; state.cwd = receipt.repositoryCwd ?? state.cwd;
  }, () => { state.cwd = ctx.cwd; });
  const written = await sequenceLifecycleWrite({ side: "before", steps,
    write: () => applyPreparedLifecycleWrite(ctx.store, prepared.result, { verb: "rename", lifecycleAction: "rename" }) });
  const failure = persistenceFailure(written);
  if (failure !== undefined) return failure;
  state.recordBatch = "applied";
  state.report = prepared.result.report;
  return undefined;
}
async function persistCatchUp(ctx: StoreRenameContext, subject: StoreRenameSubject, branch: BranchRename,
  state: RenameRuntime): Promise<Extract<RunRenameResult, { status: "rejected" }> | undefined> {
  const primary = subject.primary, links = mergeLifecycleLinks(primary.links, { branches: [branch.next] }, { branches: [branch.prior] });
  const written = await sequenceLifecycleWrite({ side: "before",
    steps: [localBranchStep(ctx, branch, ["arc", "rename", subject.operand, primary.reference.owner.name])],
    write: () => batchLifecycleWrites(ctx.store, [recordPut(primary, { links })], { verb: "rename", lifecycleAction: "rename" }, observeRecords([primary])) });
  const failure = persistenceFailure(written);
  if (failure !== undefined) return failure;
  state.recordBatch = "applied";
  return undefined;
}
function persistenceFailure(written: LifecycleWriteSequence): Extract<RunRenameResult, { status: "rejected" }> | undefined {
  if (written.status === "failed") return { status: "rejected", reason: written.reason, ...(written.recovery === undefined ? {} : { recovery: written.recovery }) };
  if (written.status === "refused") return { status: "rejected", reason: `${written.refusal.condition}${written.rollbackFailure === undefined ? "" : `; rollback failed: ${written.rollbackFailure}`}`, refusal: written.refusal, ...(written.recovery === undefined ? {} : { recovery: written.recovery }) };
  return undefined;
}
async function branchRename(ctx: StoreRenameContext, subject: StoreRenameSubject, target: string, holder: string | null): Promise<BranchRename | undefined> {
  if ((subject.primary.links?.branches?.length ?? 0) === 0) return undefined;
  const repository = await ctx.projectId?.();
  const coordinates = await selectBranchCoordinates(ctx, subject, target, holder, repository);
  if (coordinates === undefined) return undefined;
  const { prior, oldBranch } = coordinates;
  const ownership = subject.resuming ? undefined : await ctx.store.lookup({ kind: "ref", repository: prior.repository, ref: prior.ref });
  const local = ownership === undefined || ownership.status === "ok" && sameOwner(ownership.result.reference.owner, subject.primary.reference.owner)
    || await holderBranch(ctx, holder) === oldBranch;
  const kept = local ? undefined : keptLocalBranch(subject, prior, ownership, target);
  const remote = await ctx.exec("git", ["remote"], { cwd: ctx.cwd });
  const oldRemoteOid = remote.stdout.split(/\s+/u).includes("origin") ? await readRemoteBranchOid(ctx.exec, "origin", oldBranch) : null;
  const remotePolicy = await branchRemotePolicy(ctx.store, subject, prior, ownership, oldBranch);
  return { ...coordinates, oldRemoteOid, local, remotePolicy, kept };
}
async function selectBranchCoordinates(ctx: StoreRenameContext, subject: StoreRenameSubject, target: string, holder: string | null,
  repository: string | undefined): Promise<BranchCoordinates | undefined> {
  const catchUp = subject.resuming ? await catchUpCoordinates(ctx, subject, target, holder, repository) : undefined;
  if (catchUp !== undefined) return catchUp;
  const selected = selectWorkBranchLink(subject.primary, { repository });
  if (selected.kind === "ambiguous") throw new Error(selected.reason);
  if (selected.kind === "none") return undefined;
  return ordinaryBranchCoordinates(subject, selected.link, target);
}
function ordinaryBranchCoordinates(subject: StoreRenameSubject, link: BranchLink, target: string): BranchCoordinates | undefined {
  const name = subject.resuming ? target : subject.originName, actual = workBranchName(link.ref);
  if (!new RegExp(`^[^/]+/${name}$`, "u").test(actual)) return undefined;
  const oldBranch = `${actual.slice(0, actual.lastIndexOf("/") + 1)}${subject.originName}`;
  const newBranch = `${oldBranch.slice(0, oldBranch.lastIndexOf("/") + 1)}${target}`;
  const prior = subject.resuming ? { ...link, ref: link.ref.replace(new RegExp(`${target}$`, "u"), subject.originName) } : link;
  const next = { ...link, ref: prior.ref.replace(new RegExp(`${subject.originName}$`, "u"), target) };
  return { prior, next, oldBranch, newBranch, catchUp: false };
}
async function catchUpCoordinates(ctx: StoreRenameContext, subject: StoreRenameSubject, target: string, holder: string | null,
  repository: string | undefined): Promise<BranchCoordinates | undefined> {
  const current = await holderBranch(ctx, holder);
  if (current === null) return undefined;
  const match = /^([^/]+)\/([^/]+)$/u.exec(current), prefix = match?.[1], alias = match?.[2];
  if (prefix === undefined || alias === undefined || alias === target || !subject.primary.aliases?.some(name => name === alias)) return undefined;
  if (!subject.primary.links?.branches?.some(link => (repository === undefined || link.repository === repository) && workBranchName(link.ref) === current)) return undefined;
  const selected = selectWorkBranchLink(subject.primary, { repository, currentBranch: current });
  if (selected.kind === "ambiguous") throw new Error(selected.reason);
  if (selected.kind === "none") return undefined;
  return { prior: selected.link, next: { ...selected.link, ref: `${selected.link.ref.slice(0, selected.link.ref.lastIndexOf("/") + 1)}${target}` },
    oldBranch: current, newBranch: `${prefix}/${target}`, catchUp: true };
}
async function branchRemotePolicy(store: Store, subject: StoreRenameSubject, prior: BranchLink,
  ownership: StoreResult<LookupResult> | undefined, oldBranch: string): Promise<BranchRename["remotePolicy"]> {
  if (subject.resuming) return { keepOld: true, kept: { branch: oldBranch, reason: "continuation" } };
  const own = ownership?.status === "ok" && sameOwner(ownership.result.reference.owner, subject.primary.reference.owner);
  if (prior.linkedAs === "adopted") return { keepOld: true, kept: { branch: oldBranch, reason: "adopted",
    ...(own ? { manualDelete: { text: "Owner decision: delete it only if no longer needed.",
      argv: ["git", "push", "origin", "--delete", oldBranch] } } : {}),
  } };
  if (await mayDeleteCreatedRemote(store, ownership, own)) return { keepOld: false };
  return { keepOld: true, kept: { branch: oldBranch, reason: branchOwnershipReason(ownership) } };
}
async function mayDeleteCreatedRemote(store: Store, ownership: StoreResult<LookupResult> | undefined, own: boolean): Promise<boolean> {
  if (ownership === undefined) return false;
  if (own) return true;
  if (ownership.status === "refused") return ownership.refusal.code === "not-found";
  const holder = await store.read({ reference: ownership.result.reference });
  return holder.status === "ok" && holder.result.placement?.kind === "completed";
}
async function holderBranch(ctx: StoreRenameContext, holder: string | null): Promise<string | null> {
  if (holder === null) return null;
  try { return (await ctx.exec("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: holder })).stdout.trim(); }
  catch (error) { if (error instanceof Error && "exitCode" in error && error.exitCode === 1) return null; throw error; }
}
function keptLocalBranch(subject: StoreRenameSubject, link: BranchLink, ownership: StoreResult<LookupResult> | undefined, target: string): RenameKeptBranch {
  const owner = subject.primary.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("A branch catch-up requires the selected work-unit UID.");
  return { branch: link.ref, reason: branchOwnershipReason(ownership), catchUp: {
    text: "Run the rename again on the machine holding this work unit's checkout to move its branch.",
    argv: ["arc", "rename", owner.uid, target],
  } };
}
function branchOwnershipReason(ownership: StoreResult<LookupResult> | undefined): RenameKeptBranch["reason"] {
  return ownership?.status === "ok" || ownership?.status === "refused" && ownership.refusal.code === "ambiguous-match"
    ? "another-holder" : "other-link";
}
function renameSteps(ctx: StoreRenameContext, subject: StoreRenameSubject, target: string, holder: string | null,
  branch: BranchRename | undefined, remember: (receipt: StoreRenameCheckoutReceipt) => void, reset: () => void): LifecycleGitStep[] {
  const retryCommand = ["arc", "rename", subject.operand, target];
  const steps: LifecycleGitStep[] = [];
  if (branch?.local) steps.push(localBranchStep(ctx, branch, retryCommand));
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
    const remote = branch === undefined ? { status: "unpublished" as const } : !branch.local ? retainedRemote(branch)
      : await reconcileRenameRemoteBranch(ctx, { ...branch, remote: "origin", keepOld: branch.remotePolicy.keepOld,
        preservationRemedy: storePreservationRemedy(branch) });
    if (remote.status === "stale") throw new Error(`Old remote head moved from ${remote.expectedOid} to ${remote.actualOid ?? "[absent]"}.`);
    return { status: "complete", remote };
  } catch (error) { return { status: "partial", reason: error instanceof Error ? error.message : String(error),
    remedy: branch?.catchUp ? catchUpPushRemedy(ctx.cwd, branch)
      : { text: "Finish the remaining remote branch rename.", argv: ["arc", "rename", request.operand, request.targetSlug] } }; }
}
function catchUpPushRemedy(cwd: string, branch: BranchRename): Remedy {
  return { text: "Finish publishing the renamed branch in this repository; keep the old remote branch.",
    argv: ["git", "-C", cwd, "push", "-u", "origin", branch.newBranch] };
}
function storePreservationRemedy(branch: BranchRename): string {
  return `If these commits belong to this work unit, run git fetch origin +refs/heads/${branch.oldBranch}:refs/remotes/origin/${branch.oldBranch}, `
    + `merge refs/remotes/origin/${branch.oldBranch} into ${branch.newBranch}, then delete ${branch.oldBranch} after preserving them. `
    + "If the branch belongs to another holder, leave it in place. Retry the rename to finish while keeping the old remote branch.";
}
function retainedRemote(branch: BranchRename): RenameRemoteBranchResult {
  return branch.oldRemoteOid === null ? { status: "unpublished" }
    : { status: "retained", oldBranch: branch.oldBranch, newBranch: branch.newBranch, oldOid: branch.oldRemoteOid };
}
