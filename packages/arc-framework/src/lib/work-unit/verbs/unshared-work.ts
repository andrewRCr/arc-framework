/** Shared pause report and handover admission over the checkout and published refs. */
import { boundedGitInvocation, type GitExec } from "../../git/exec.js";
import { DEFAULT_NETWORK_TIMEOUT_MS } from "../../git/remote-ref-reader.js";
import { GitProcessError } from "../../git/process-error.js";
import { readCheckoutChanges } from "../../git/worktree-removal.js";
import { scanRegisteredWorktrees } from "../../git/worktree-roster.js";
import { decodeWorktreeMarkerOwnership, readWorktreeMarker } from "../../git/worktree-marker.js";
import { selectWorkBranchLink, workBranchName } from "../../store/lifecycle-branch.js";
import type { StoreRecord } from "../../store/read.js";
import type { LocusPorts } from "../locus-ports.js";

/** Checkout and Git boundaries used by pause and handover. */
export interface UnsharedWorkContext { cwd: string; exec: GitExec; baseBranch: string; locusPorts?: LocusPorts; repository?: string }
/** Observed sharing evidence; a missing remote deliberately has no unshared count. */
export interface UnsharedWorkReport {
  kind: "observed"; checkoutPath: string | null; changedPaths: string[]; branch: string | null;
  unsharedCommits: string[]; heldOnlyCommits: string[]; origin: "none" | "refreshed" | "unreachable";
  warnings: string[];
}
/** A refusal to infer sharing from unavailable observations. */
export type UnsharedWorkResult = UnsharedWorkReport | { kind: "unobservable"; detail: string };

/** Inspect uncommitted changes and branch commits the next owner cannot reach.
 * @param ctx - Bound checkout, configured base, Git and locus ports.
 * @param record - Selected work-unit primary with its branch links.
 * @returns Sharing evidence, including offline and absent-remote distinctions.
 */
export async function readUnsharedWork(ctx: UnsharedWorkContext, record: StoreRecord): Promise<UnsharedWorkResult> {
  try {
    const checkoutPath = await findWorkUnitHoldingCheckout(ctx, record.reference.owner.name);
    const changes = checkoutPath === null ? { kind: "known" as const, paths: [] } : await readCheckoutChanges(ctx.exec, checkoutPath);
    if (changes.kind === "unobservable") return { kind: "unobservable", detail: changes.detail };
    const branch = await linkedBranch(ctx, record, checkoutPath);
    const remote = await ctx.exec("git", ["remote"], { cwd: ctx.cwd });
    const origin = remote.stdout.split(/\s+/u).includes("origin");
    const sharing = branch === null ? await branchlessSharing(ctx, origin)
      : await branchSharing(ctx, branch, origin);
    return { kind: "observed", checkoutPath, changedPaths: changes.paths, branch, ...sharing };
  } catch (error) { return { kind: "unobservable", detail: error instanceof Error ? error.message : String(error) }; }
}

/** Find the unique unhusked marker claim through locus or the registered-checkout fallback.
 * @param ctx - Checkout, bound Git, and optional locus lookup.
 * @param name - Work unit whose marker supplies current occupancy.
 * @returns Its holding checkout, or absence; inconsistent observations throw.
 */
export async function findWorkUnitHoldingCheckout(ctx: Pick<UnsharedWorkContext, "cwd" | "exec" | "locusPorts">, name: string): Promise<string | null> {
  const resolveLegacy = async (): Promise<string | null> => {
    const exec: GitExec = (command, args, options) => ctx.exec(command, args, { cwd: ctx.cwd, ...options });
    const roster = await scanRegisteredWorktrees(exec);
    if (!roster.ok) throw new Error(roster.message);
    const held: string[] = [];
    for (const registration of roster.worktrees) {
      const marker = await readWorktreeMarker(registration.path);
      if (marker.kind === "malformed") throw new Error(`${marker.path}: ${marker.message}`);
      if (marker.kind !== "present" || marker.marker.husk !== undefined) continue;
      const ownership = decodeWorktreeMarkerOwnership(marker.marker);
      if (ownership.kind === "current" && ownership.subject.kind === "work-unit" && ownership.subject.name === name) held.push(registration.path);
    }
    if (held.length > 1) throw new Error(`More than one checkout holds ${name}: ${held.join(", ")}`);
    return held[0] ?? null;
  };
  return ctx.locusPorts === undefined ? resolveLegacy() : ctx.locusPorts.findHoldingCheckout({ name, resolveLegacy });
}

async function linkedBranch(ctx: UnsharedWorkContext, record: StoreRecord, checkout: string | null): Promise<string | null> {
  let currentBranch: string | undefined;
  if (checkout !== null && (record.links?.branches?.length ?? 0) > 0) {
    try { currentBranch = (await ctx.exec("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: checkout })).stdout.trim(); }
    // Detached HEAD supplies no branch identity; select from the recorded links.
    catch (error) { if (!(error instanceof GitProcessError && error.exitCode === 1)) throw error; }
  }
  const holderLinked = record.links?.branches?.some((link) => (ctx.repository === undefined || link.repository === ctx.repository)
    && workBranchName(link.ref) === currentBranch) === true;
  const selected = selectWorkBranchLink(record, { repository: ctx.repository, currentBranch: holderLinked ? currentBranch : undefined });
  if (selected.kind === "ambiguous") throw new Error(selected.reason);
  return selected.kind === "none" ? null : workBranchName(selected.link.ref);
}

async function branchlessSharing(ctx: UnsharedWorkContext, origin: boolean): Promise<Pick<UnsharedWorkReport,
  "origin" | "unsharedCommits" | "heldOnlyCommits" | "warnings">> {
  if (!origin) return { origin: "none", unsharedCommits: [], heldOnlyCommits: [], warnings: [] };
  const refresh = await boundedGitInvocation(ctx.exec, ["fetch", "origin", `+refs/heads/${ctx.baseBranch}:refs/remotes/origin/${ctx.baseBranch}`],
    DEFAULT_NETWORK_TIMEOUT_MS, { cwd: ctx.cwd });
  return { origin: refresh.outcome === "ok" ? "refreshed" : "unreachable", unsharedCommits: [], heldOnlyCommits: [],
    warnings: refresh.outcome === "ok" ? [] : ["origin was not refreshed; this report uses the refs the clone holds."] };
}

async function branchSharing(ctx: UnsharedWorkContext, branch: string, origin: boolean): Promise<
  Pick<UnsharedWorkReport, "origin" | "unsharedCommits" | "heldOnlyCommits" | "warnings">
> {
  const branchRef = `refs/heads/${branch}`, remoteBranch = `refs/remotes/origin/${branch}`, remoteBase = `refs/remotes/origin/${ctx.baseBranch}`;
  if (!origin) {
    const bases = await existingRefs(ctx, [`refs/heads/${ctx.baseBranch}`, remoteBase]);
    const heldOnlyCommits = bases.length === 0 ? [] : await walk(ctx, branchRef, bases);
    return { origin: "none", unsharedCommits: [], heldOnlyCommits,
      warnings: ["No origin is configured; branch commits beyond base are held only in this clone.", ...(bases.length === 0 ? ["No base ref resolves, so held-only commits cannot be listed."] : [])] };
  }
  const refreshed = await refreshSharingRefs(ctx, branch);
  const refs = await existingRefs(ctx, [...(refreshed.branchAbsent ? [] : [remoteBranch]), remoteBase]);
  return { origin: refreshed.reachable ? "refreshed" : "unreachable", unsharedCommits: await walk(ctx, branchRef, refs), heldOnlyCommits: [],
    warnings: refreshed.reachable ? [] : ["origin was not refreshed; this report uses the refs the clone holds."] };
}

async function refreshSharingRefs(ctx: UnsharedWorkContext, branch: string): Promise<{ reachable: boolean; branchAbsent: boolean }> {
  const base = await boundedGitInvocation(ctx.exec, ["fetch", "origin", `+refs/heads/${ctx.baseBranch}:refs/remotes/origin/${ctx.baseBranch}`], DEFAULT_NETWORK_TIMEOUT_MS, { cwd: ctx.cwd });
  const work = await boundedGitInvocation(ctx.exec, ["fetch", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`], DEFAULT_NETWORK_TIMEOUT_MS, { cwd: ctx.cwd });
  if (work.outcome === "ok") return { reachable: base.outcome === "ok", branchAbsent: false };
  const presence = await boundedGitInvocation(ctx.exec, ["ls-remote", "--exit-code", "origin", `refs/heads/${branch}`], DEFAULT_NETWORK_TIMEOUT_MS, { cwd: ctx.cwd });
  const branchAbsent = presence.outcome === "error" && presence.error instanceof GitProcessError && presence.error.exitCode === 2;
  return { reachable: base.outcome === "ok" && branchAbsent, branchAbsent };
}
async function existingRefs(ctx: UnsharedWorkContext, refs: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const ref of refs) {
    try { await ctx.exec("git", ["--no-replace-objects", "rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd: ctx.cwd, objectAccess: "local-only" }); found.push(ref); }
    catch (error) { if (!(error instanceof GitProcessError && error.exitCode === 1)) throw error; }
  }
  return found;
}
async function walk(ctx: UnsharedWorkContext, branch: string, excluded: string[]): Promise<string[]> {
  if ((await existingRefs(ctx, [branch])).length === 0) return [];
  const result = await ctx.exec("git", ["--no-replace-objects", "rev-list", branch, "--not", ...excluded], { cwd: ctx.cwd, objectAccess: "local-only" });
  return result.stdout.trim().split(/\s+/u).filter(Boolean);
}
