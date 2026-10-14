/** Handler-only catch-up of detached Planning checkouts after local base synchronization. */
import type { Store } from "../lib/store/contract.js";
import type { GitExec } from "../lib/git/exec.js";
import { syncLocalBase, type BaseSyncResult } from "../lib/git/base-sync.js";
import { usesOffBranchState } from "../lib/store/lifecycle-write.js";
import { resolveCurrentWorkUnit } from "../lib/store/current-work-unit.js";
import { localLifecycleTip } from "../lib/git/lifecycle-ref-refresh.js";
import type { Remedy } from "../lib/store/refusal.js";
/** Handler-specific refusal leaves the shared base synchronizer's contract unchanged. */
export type PlanningBaseSyncResult = BaseSyncResult | { status: "refused"; reason: "detached-planning-commits" | "detached-planning-unobservable"; base: string; commits?: string[]; remedy: Remedy };
/** Bound inputs, with a sync injection for handler orchestration tests. */
export interface PlanningBaseSyncContext { cwd: string; store: Store; exec: GitExec; baseBranch: string; sync?: () => Promise<BaseSyncResult> }
/** Synchronize base and catch up a clean detached Planning checkout. */
export async function runPlanningBaseSync(ctx: PlanningBaseSyncContext): Promise<PlanningBaseSyncResult> {
  const synchronize = () => ctx.sync?.() ?? syncLocalBase({ exec: ctx.exec, baseBranch: ctx.baseBranch });
  if (!usesOffBranchState(ctx.store)) return synchronize();
  try {
    if (await currentBranch(ctx) !== null) return await synchronize();
    const current = await resolveCurrentWorkUnit({ cwd: ctx.cwd, store: ctx.store });
    if (current.warnings.length !== 0 || current.status === "ambiguous") throw new Error(current.warnings.join("; ") || "Current work unit is ambiguous");
    if (current.status !== "resolved" || current.candidate.record?.state !== "Planning") return await synchronize();
    const head = (await ctx.exec("git", ["rev-parse", "HEAD"], { cwd: ctx.cwd })).stdout.trim();
    const bases = await Promise.all([`refs/heads/${ctx.baseBranch}`, `refs/remotes/origin/${ctx.baseBranch}`].map((ref) => localLifecycleTip(ctx.exec, ctx.cwd, ref)));
    const known = bases.filter((tip): tip is string => tip !== null);
    if (known.length === 0) throw new Error(`No base ref resolves; fetch the base or run git branch ${ctx.baseBranch} <commit>`);
    const walk = await ctx.exec("git", ["rev-list", "HEAD", "--not", ...known], { cwd: ctx.cwd, objectAccess: "local-only" });
    const commits = walk.stdout.trim().split(/\s+/u).filter(Boolean);
    if (commits.length !== 0) return { status: "refused", base: ctx.baseBranch, reason: "detached-planning-commits", commits,
      remedy: { text: `Detached Planning checkout holds commits not on base: ${commits.join(", ")}. Run git switch -c <name> to preserve them, then retry arc base sync.` } };
    const result = await synchronize();
    if (result.status !== "updated" && result.status !== "unchanged") return result;
    const latestHead = (await ctx.exec("git", ["rev-parse", "HEAD"], { cwd: ctx.cwd })).stdout.trim();
    if (await currentBranch(ctx) !== null || latestHead !== head) throw new Error("Base synchronized, but the Planning checkout changed concurrently; preserve its current HEAD and retry");
    await ctx.exec("git", ["switch", "--detach", result.status === "updated" ? result.to : result.at], { cwd: ctx.cwd });
    return result;
  } catch (error) { return { status: "refused", base: ctx.baseBranch, reason: "detached-planning-unobservable", remedy: { text: `${String(error)}; inspect the checkout and retry arc base sync.` } }; }
}
async function currentBranch(ctx: PlanningBaseSyncContext): Promise<string | null> {
  try { return (await ctx.exec("git", ["symbolic-ref", "--quiet", "HEAD"], { cwd: ctx.cwd })).stdout.trim(); }
  catch (error) { if (error instanceof Error && "exitCode" in error && error.exitCode === 1) return null; throw error; }
}
