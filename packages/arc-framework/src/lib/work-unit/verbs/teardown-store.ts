/** End-rule ref-set cleanup over version-bound operational retirement evidence. */
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { assessReapSafety, isLandedInBase } from "../../git/branch-containment.js";
import { deleteRemoteBranch } from "../mutators/reconcile-branch.js";
import { localLifecycleTip, resolveLifecycleBase } from "../../git/lifecycle-ref-refresh.js";
import { readWorktreeMarker, resolveWorktreeMarkerPath } from "../../git/worktree-marker.js";
import { scanRegisteredWorktrees, type RegisteredWorktree } from "../../git/worktree-roster.js";
import { clearMissingWorktreeRegistrations, removeWorktreeCheckout, releaseWorktreeCheckout, describeRemovalRefusal } from "../../git/worktree-removal.js";
import { reapZeroDeltaBranch } from "../../errand/abandon-runtime.js";
import { selectWorkBranchLink, workBranchName } from "../../store/lifecycle-branch.js";
import { readStoreRetirementEvidence, type StoreRetirementEvidence } from "../store-retirement-evidence.js";
import type { Remedy } from "../../store/refusal.js";
import { selectStoreRetirementHusk, type SelectedStoreRetirementHusk } from "../store-retirement-husk.js";
import { returnRetiringCheckout } from "../return-retiring-checkout.js";
import { withWorktreeOperationLock } from "../worktree-operation-lock.js";
import { nodeReconcileWorkUnitWorktreeFs, isSelfTeardown } from "../mutators/reconcile-work-unit-worktree.js";
import type { TeardownContext, TeardownParams, TeardownResult } from "./teardown.js";

type Bound = TeardownContext & { evidence: StoreRetirementEvidence; baseOid: string; baseBranch: string; worktrees: RegisteredWorktree[]; primaryPath: string; notices: string[]; selectedHusk?: string };
/** Teardown reads the selected end's rule; force flags never grant discard authority. */
export async function runStoreTeardown(ctx: TeardownContext, params: TeardownParams): Promise<TeardownResult> {
  if (ctx.store === undefined) return { status: "rejected", reason: "Teardown requires its operational store." };
  let cleanupStarted = false;
  try {
    const baseOid = await resolveLifecycleBase(ctx.exec, ctx.cwd, params.base);
    if (baseOid === null) throw new Error(`No base ref resolves; run git branch ${params.base} <commit> or fetch the configured base, then retry teardown.`);
    const evidence = await readStoreRetirementEvidence(ctx.store, params.name, baseOid);
    const roster = await (ctx.scanWorktrees ?? scanRegisteredWorktrees)(ctx.exec);
    if (!roster.ok) throw new Error(roster.message);
    const primaryPath = roster.worktrees.find((item) => item.primary)?.path;
    if (primaryPath === undefined) throw new Error("The primary checkout could not be resolved for retirement.");
    const exec: TeardownContext["exec"] = (command, args, options) => ctx.exec(command, args, { cwd: primaryPath, ...options });
    const bound: Bound = { ...ctx, exec, cwd: primaryPath, evidence, baseOid, baseBranch: params.base, worktrees: roster.worktrees, primaryPath, notices: [], selectedHusk: params.huskPath };
    const { links, retiring, head } = await selectRetiringLinks(bound);
    const selected = params.huskPath === undefined ? undefined : await selectStoreRetirementHusk({ ctx: bound, evidence, baseOid, path: params.huskPath }, bound.worktrees);
    cleanupStarted = true;
    let worktreeRemoved = selected === undefined ? await retireHolder(bound, ctx.cwd) : null;
    const { branchDeleted, remoteBranchDeleted } = await reapRetirementLinks(bound, links, retiring, head);
    if (selected !== undefined) worktreeRemoved = await retireHolder(bound, ctx.cwd, selected);
    return { status: "torn-down", mode: evidence.rule === "discard" ? "abandoned" : "shipped", branch: retiring,
      branchDeleted, remoteBranchDeleted, worktreeRemoved, husk: null, pruned: true, notices: bound.notices, suggestion: params.suggestion ?? null };
  } catch (error) { return { status: "rejected", reason: error instanceof Error ? error.message : String(error), ...(cleanupStarted ? { remedy: teardownRetryRemedy(params) } : {}) }; }
}
async function locked<T>(ctx: Bound, operation: () => Promise<T>): Promise<T> {
  const action = async () => { await ctx.evidence.revalidate(); return operation(); };
  return ctx.withWorkItemLock === undefined ? withWorktreeOperationLock({ exec: ctx.exec, cwd: ctx.cwd, operation: action }) : ctx.withWorkItemLock(action);
}
async function holdingCheckout(ctx: Bound): Promise<string | null> {
  const resolveLegacy = async () => {
    const paths: string[] = [];
    for (const item of ctx.worktrees) {
      const marker = await (ctx.readMarker ?? readWorktreeMarker)(item.path);
      if (marker.kind === "malformed") throw new Error(`${marker.path}: ${marker.message}`);
      if (marker.kind === "present" && marker.marker.husk === undefined && (marker.marker.createdFor?.kind === "work-unit" ? marker.marker.createdFor.name : marker.marker.wuName) === ctx.evidence.name) paths.push(item.path);
    }
    if (paths.length > 1) throw new Error(`More than one checkout holds ${ctx.evidence.name}: ${paths.join(", ")}`);
    return paths[0] ?? null;
  };
  return ctx.locusPorts === undefined ? resolveLegacy() : ctx.locusPorts.findHoldingCheckout({ name: ctx.evidence.name, resolveLegacy });
}
async function retireHolder(ctx: Bound, invokingPath: string, selected?: SelectedStoreRetirementHusk): Promise<string | null> {
  const path = selected?.path ?? await holdingCheckout(ctx);
  if (path === null) return null;
  const marker = await (ctx.readMarker ?? readWorktreeMarker)(path);
  if (marker.kind !== "present") throw new Error("The selected checkout claim changed before retirement.");
  const fs = ctx.worktreeFs ?? nodeReconcileWorkUnitWorktreeFs;
  const revalidate = async () => { await ctx.evidence.revalidate(); await selected?.revalidate(); };
  const operation = async () => {
    if (!marker.marker.spawnedByArc || resolve(path) === resolve(ctx.primaryPath)) {
      const released = await releaseWorktreeCheckout({ exec: ctx.exec, checkoutPath: path, primaryWorktreePath: ctx.primaryPath, slots: ctx.projectionRemovalSlots });
      if (released.kind !== "released") throw new Error(describeRemovalRefusal(released.check));
      if (fs.removeFile === undefined) await rm(resolveWorktreeMarkerPath(path), { force: true });
      else await fs.removeFile(resolveWorktreeMarkerPath(path));
      ctx.notices.push(`Released checkout ${path}; its files were retained.`);
      return null;
    }
    if (await isSelfTeardown(path, invokingPath)) ctx.chdir(ctx.primaryPath);
    const removed = await removeWorktreeCheckout({ exec: ctx.exec, checkoutPath: path, primaryWorktreePath: ctx.primaryPath, slots: ctx.projectionRemovalSlots, folderExists: (target) => fs.directoryExists(target) });
    if (removed.kind === "refused") throw new Error(describeRemovalRefusal(removed.check));
    if (removed.kind === "failed") throw new Error(`Checkout removal failed at ${removed.step}: ${removed.detail}`);
    return path;
  };
  if (ctx.readTeardownSelection !== undefined && ctx.teardownWorktree !== undefined) {
    const chosen = await ctx.readTeardownSelection({ checkoutPath: path, subject: { kind: "work-unit", name: ctx.evidence.name } });
    if (chosen.kind !== "clear") throw new Error(chosen.message);
    let removed: string | null = null;
    await ctx.teardownWorktree.retire({ expectedSelection: chosen, revalidateLocal: revalidate,
      retireProjection: async () => { removed = await operation(); } });
    return removed;
  }
  return locked(ctx, async () => { await selected?.revalidate(); return operation(); });
}
function reportAdopted(ctx: Bound, branch: string): void {
  const holder = ctx.worktrees.find((item) => item.branch === branch);
  ctx.notices.push(`Kept ${branch}: it was adopted from its owner.`);
  if (holder !== undefined) ctx.notices.push(`Owner cleanup: git switch ${ctx.baseBranch} (from ${holder.path}, or detach where base is occupied).`);
  ctx.notices.push(`Owner cleanup: git branch -D ${branch}`);
}
async function prepareCreatedBranch(ctx: Bound, branch: string): Promise<boolean> {
  const fs = ctx.worktreeFs ?? nodeReconcileWorkUnitWorktreeFs;
  if (ctx.selectedHusk === undefined) {
    const cleared = await clearMissingWorktreeRegistrations({ exec: ctx.exec, primaryWorktreePath: ctx.primaryPath, branch, folderExists: (path) => fs.directoryExists(path), slots: ctx.projectionRemovalSlots });
    if (cleared.kind === "refused") throw new Error(cleared.reason);
  }
  const scan = await (ctx.scanWorktrees ?? scanRegisteredWorktrees)(ctx.exec);
  if (!scan.ok) throw new Error(scan.message);
  for (const holder of scan.worktrees.filter((item) => item.branch === branch)) {
    if (ctx.selectedHusk !== undefined) { ctx.notices.push(`Kept ${branch}: another checkout holds it at ${holder.path}; its registration was retained.`); return false; }
    const result = await returnRetiringCheckout({ exec: ctx.exec, checkoutPath: holder.path, branch, baseBranch: ctx.baseBranch,
      baseOid: ctx.baseOid, worktrees: scan.worktrees, folderExists: (path) => fs.directoryExists(path) });
    ctx.notices.push(result.notice);
    if (result.kind === "kept") return false;
  }
  return true;
}
async function reapRetiringBranch(ctx: Bound, branch: string): Promise<{ local: boolean; remote: boolean }> {
  return locked(ctx, async () => {
    const local = await localLifecycleTip(ctx.exec, ctx.cwd, `refs/heads/${branch}`), tracking = await localLifecycleTip(ctx.exec, ctx.cwd, `refs/remotes/origin/${branch}`);
    const landed = tracking === null || await isLandedInBase(ctx.exec, tracking, ctx.baseOid);
    if (ctx.evidence.rule === "landed" && local !== null) {
      const safety = await assessReapSafety(ctx.exec, { branch, base: ctx.baseOid });
      if (!safety.safe) { ctx.notices.push(`Kept ${branch}: ${safety.reason}`); return { local: false, remote: false }; }
    }
    if (!await prepareCreatedBranch(ctx, branch)) return { local: false, remote: false };
    const remote = await reapRetiringRemote(ctx, branch, landed);
    await ctx.evidence.revalidate();
    if (local !== null) await ctx.exec("git", ["update-ref", "-d", `refs/heads/${branch}`, local], { cwd: ctx.cwd });
    // A successful remote deletion may already prune its tracking ref; any surviving generation still uses the observed OID.
    if (tracking !== null && (ctx.evidence.rule === "discard" || landed) && await localLifecycleTip(ctx.exec, ctx.cwd, `refs/remotes/origin/${branch}`) !== null) {
      await ctx.exec("git", ["update-ref", "-d", `refs/remotes/origin/${branch}`, tracking], { cwd: ctx.cwd });
    }
    return { local: local !== null, remote };
  });
}
async function reapAdditionalBranch(ctx: Bound, branch: string, retiringHead: string | null): Promise<void> {
  if (ctx.execInput === undefined) throw new Error("Ref-set cleanup requires stdin-capable Git I/O; bind it and retry teardown.");
  const localHead = await localLifecycleTip(ctx.exec, ctx.cwd, `refs/heads/${branch}`), remoteTrackingHead = await localLifecycleTip(ctx.exec, ctx.cwd, `refs/remotes/origin/${branch}`);
  if (localHead === null && remoteTrackingHead === null) return;
  const containers: { ref: string; oid: string }[] = [];
  for (const ref of [`refs/heads/${ctx.baseBranch}`, `refs/remotes/origin/${ctx.baseBranch}`]) { const oid = await localLifecycleTip(ctx.exec, ctx.cwd, ref); if (oid !== null) containers.push({ ref, oid }); }
  const result = await reapZeroDeltaBranch(ctx.exec, ctx.execInput, ctx.baseBranch, { branch, localHead, remoteTrackingHead, containers, retiringHead,
    withWorkItemLock: (operation) => locked(ctx, operation) }, localHead ?? remoteTrackingHead, ctx.primaryPath);
  if (result.kind === "preserved") ctx.notices.push(`Kept ${branch}: ${result.reason}`);
  if (result.releaseError !== undefined) throw new Error(result.releaseError);
}
async function advertisedTip(ctx: Bound, branch: string): Promise<string | null> {
  const remotes = await ctx.exec("git", ["remote"], { cwd: ctx.cwd });
  if (!remotes.stdout.split(/\s+/u).includes("origin")) return null;
  const advertised = await ctx.exec("git", ["ls-remote", "origin", `refs/heads/${branch}`], { cwd: ctx.cwd });
  return advertised.stdout.trim().split(/\s+/u)[0] || null;
}

async function selectRetiringLinks(ctx: Bound) {
    const repository = await ctx.projectId?.();
    const links = ctx.evidence.branches.filter((link) => repository === undefined || link.repository === repository);
    if (repository === undefined && new Set(links.map((link) => link.repository)).size > 1) throw new Error("Teardown requires repository identity for a retirement spanning repositories.");
    for (const link of ctx.evidence.branches.filter((item) => !links.includes(item))) ctx.notices.push(`Kept ${link.ref}: reap its link in repository ${link.repository}.`);
    const selected = selectWorkBranchLink({ links: { branches: links } }, { repository });
    if (selected.kind === "ambiguous") throw new Error(selected.reason);
    const retiring = selected.kind === "none" ? null : workBranchName(selected.link.ref);
    const head = retiring === null ? null : await localLifecycleTip(ctx.exec, ctx.primaryPath, `refs/heads/${retiring}`)
      ?? await localLifecycleTip(ctx.exec, ctx.primaryPath, `refs/remotes/origin/${retiring}`);
    return { links, retiring, head };
}

async function reapRetiringRemote(ctx: Bound, branch: string, landed: boolean): Promise<boolean> {
    let remote = false;
    if (ctx.evidence.rule === "discard" || landed) {
      const advertised = await advertisedTip(ctx, branch);
      if (advertised !== null) {
        const safeRemote = ctx.evidence.rule === "discard" || await isLandedInBase(ctx.exec, advertised, ctx.baseOid);
        if (safeRemote) { const result = await deleteRemoteBranch(ctx.exec, "origin", branch, advertised); if (result === "stale") throw new Error(`Remote ${branch} moved; retry teardown.`); remote = result === "deleted"; }
        else ctx.notices.push(`Kept origin/${branch}: its commits have not landed in base.`);
      }
    } else ctx.notices.push(`Kept origin/${branch}: its commits have not landed in base.`);
    return remote;
}

function teardownRetryRemedy(params: TeardownParams): Remedy {
  return { text: "Complete the named repair or restore the physical boundary, then retry teardown.",
    argv: ["arc", "teardown", params.name, ...(params.huskPath === undefined ? [] : ["--husk", params.huskPath])] };
}

async function reapRetirementLinks(ctx: Bound, links: StoreRetirementEvidence["branches"], retiring: string | null, head: string | null) {
  let branchDeleted = false, remoteBranchDeleted = false;
  for (const link of links) {
      const branch = workBranchName(link.ref);
      if (link.linkedAs === "adopted") { reportAdopted(ctx, branch); continue; }
      if (branch === retiring) {
        const reaped = await reapRetiringBranch(ctx, branch);
        branchDeleted = reaped.local; remoteBranchDeleted = reaped.remote;
      } else await reapAdditionalBranch(ctx, branch, head);
    }
  return { branchDeleted, remoteBranchDeleted };
}
