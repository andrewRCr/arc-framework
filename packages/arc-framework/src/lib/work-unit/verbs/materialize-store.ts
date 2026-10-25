/** Give owned in-flight operational records a checkout without changing their state or pause. */
import { sameReference, type RecordReference } from "../../store/identity.js";
import { stat } from "node:fs/promises";
import { describeWorktreePreparationFailure } from "../incomplete-worktree-preparation.js";
import { localPathsEqual } from "../../local-path-identity.js";
import { ownedInFlight } from "../../locus/unbound-marker.js";
import { revalidateLifecycleRecords } from "../prepared-lifecycle-write.js";
import { boundedGitInvocation, type GitExec } from "../../git/exec.js";
import { refreshLifecycleRef, localLifecycleTip, resolveLifecycleBase } from "../../git/lifecycle-ref-refresh.js";
import { DEFAULT_NETWORK_TIMEOUT_MS } from "../../git/remote-ref-reader.js";
import { scanRegisteredWorktrees } from "../../git/worktree-roster.js";
import { selectWorkBranchLink, workBranchName } from "../../store/lifecycle-branch.js";
import { readLifecycleView } from "../../store/lifecycle-view.js";
import { requireCompleteInventory } from "../../store/lifecycle-storage.js";
import { readWorkUnit } from "../../store/lifecycle-write.js";
import { workUnitMarkerExit } from "../../locus/marker-occupancy.js";
import { readWorkUnitCheckout } from "./unshared-work.js";
import type { MaterializeContext, MaterializeParams, MaterializeResult } from "./materialize.js";
import type { Store } from "../../store/contract.js";
import type { StoreRecord } from "../../store/read.js";
import type { LifecycleEntry } from "../../store/lifecycle-index.js";
import type { ReconcileWorkUnitWorktreeOp } from "../mutators/reconcile-work-unit-worktree.js";
import type { GuardResult } from "../lifecycle-executor.js";
import { ownerHolderRequest } from "../locus-ports.js";
import type { HoldingCheckoutResult } from "../locus-ports.js";
import type { WorkUnitHolderRequest } from "../mutators/reconcile-work-unit-worktree.js";

type Bound = MaterializeContext & { cwd: string; exec: GitExec };
/** A held candidate preserves the distinction between a bound and an unbound checkout. */
export type MaterializeHeldCheckout = Exclude<HoldingCheckoutResult, { kind: "none" }>;
/** List candidates with one locus query per owned in-flight work unit. */
export async function listStoreMaterializable(ctx: Bound, identity: string, held = new Map<RecordReference, MaterializeHeldCheckout>(), checkoutPath?: string): Promise<LifecycleEntry[]> {
  if (ctx.store === undefined) throw new Error("Materialize requires its operational store");
  const view = await readLifecycleView(ctx.store);
  if (view.status === "refused") throw new Error(`${view.refusal.condition} ${view.refusal.remedy.text}`);
  requireCompleteInventory(ctx.store, view.result.listing);
  const candidates: LifecycleEntry[] = [];
  for (const entry of view.result.entries) {
    if (entry.location !== "active" || entry.fields.owner !== identity) continue;
    if (!new Set(["Planning", "Active", "Integrating"]).has(entry.phase)) continue;
    const checkout = await readWorkUnitCheckout(ctx, entry, checkoutPath);
    if (checkout.kind === "none") candidates.push(entry); else held.set(entry.reference, checkout);
  }
  return candidates;
}
/** Resolve the linked or branchless placement, keeping operational records untouched. */
export async function runStoreMaterialize(ctx: MaterializeContext, params: MaterializeParams): Promise<MaterializeResult> {
  if (ctx.store === undefined || ctx.exec === undefined || ctx.cwd === undefined) return { status: "rejected", reason: "Materialize requires its store, checkout, and Git boundaries." };
  const bound: Bound = { ...ctx, exec: ctx.exec, cwd: ctx.cwd };
  const identity = params.identity ?? params.spawningIdentity;
  if (identity === undefined) return { status: "rejected", reason: "Materialize requires the claiming identity." };
  try {
    const read = await readWorkUnit(ctx.store, params.name);
    if (read.status === "refused") return { status: "rejected", reason: read.refusal.condition, refusal: read.refusal };
    const name = read.result.reference.owner.name;
    const occupancy = await materializationOccupancy(bound, read.result, params.inPlace === true);
    if (!occupancy.ok) return { status: "rejected", reason: occupancy.message, remedy: occupancy.remedy };
    if (!ownedInFlight(read.result, identity)) {
      return { status: "rejected", reason: `${name} is not owned in-flight work; refresh its ownership and lifecycle state, then retry materialize.` };
    }
    const held = new Map<RecordReference, MaterializeHeldCheckout>();
    const candidates = await listStoreMaterializable(bound, identity, held, params.inPlace ? bound.cwd : undefined);
    const entry = candidates.find((item) => sameReference(item.reference, read.result.reference));
    if (entry === undefined) return { status: "rejected", reason: heldCandidateReason(read.result, identity, candidates, held) };
    const chosen = selectWorkBranchLink(read.result, { repository: await ctx.projectId?.() });
    if (chosen.kind === "ambiguous") return { status: "rejected", reason: chosen.reason };
    const branch = chosen.kind === "none" ? null : workBranchName(chosen.link.ref);
    const placement = await placementOperation(bound, { ...params, name }, branch, identity, ownerHolderRequest(read.result));
    const operation = placement.inPlace && occupancy.bind !== undefined ? { ...placement, bind: occupancy.bind } : placement;
    return await claimMaterialization({ ...bound, store: ctx.store }, { primary: read.result, operation, branch, inPlace: params.inPlace === true });
  } catch (error) { return { status: "rejected", reason: describeWorktreePreparationFailure(error,
    ["arc", "materialize", params.name, ...(params.inPlace ? ["--here"] : [])]) }; }
}
function heldCandidateReason(record: StoreRecord, identity: string, candidates: readonly LifecycleEntry[], held: ReadonlyMap<RecordReference, MaterializeHeldCheckout>): string {
  const holder = [...held].find(([reference]) => sameReference(reference, record.reference))?.[1];
  if (holder?.kind === "unbound") return holder.reason;
  return holder === undefined ? `${record.reference.owner.name} is not an owned in-flight materialize candidate. Candidates: ${candidates.map(item => item.reference.owner.name).join(", ") || "[none]"}.`
    : workUnitMarkerExit(holder.path, record.reference.owner.name, record, identity);
}
async function placementOperation(ctx: Bound, params: MaterializeParams, branch: string | null, identity: string,
  holder: WorkUnitHolderRequest): Promise<Extract<ReconcileWorkUnitWorktreeOp, { mutation: "spawn" }>> {
  if (params.inPlace && branch === null) return { mutation: "spawn", inPlace: true, preserveHead: true, wuName: params.name, holder, spawningIdentity: identity };
  const baseBranch = params.baseBranch;
  if (baseBranch === undefined) throw new Error("Materialize requires the configured base branch.");
  const base = await resolveLifecycleBase(ctx.exec, ctx.cwd, baseBranch);
  if (branch !== null) {
    await refuseUnmarkedHolder(ctx, params, branch);
    const work = await refreshLifecycleRef(ctx.exec, ctx.cwd, branch);
    const local = await localLifecycleTip(ctx.exec, ctx.cwd, `refs/heads/${branch}`), remote = await localLifecycleTip(ctx.exec, ctx.cwd, `refs/remotes/origin/${branch}`);
    if (local === null && remote === null) throw new Error(await missingBranchRemedy(ctx, branch, work));
    const common = { mutation: "spawn" as const, branch, createBranch: local === null, wuName: params.name, holder, spawningIdentity: identity };
    return params.inPlace ? { ...common, inPlace: true, ...(local === null ? { startPoint: remote ?? undefined } : {}) }
      : { ...common, base: remote ?? local ?? branch, ...spawnPlacement(params) };
  }
  if (base === null) throw new Error(`No base ref resolves. Fetch origin +refs/heads/${baseBranch}:refs/remotes/origin/${baseBranch}, or run git branch ${baseBranch} <commit>, then retry arc materialize ${params.name}.`);
  if (params.inPlace) throw new Error("Branchless in-place placement should have been marker-only");
  return { mutation: "spawn", detached: true, base, wuName: params.name, holder, spawningIdentity: identity, ...spawnPlacement(params) };
}
function spawnPlacement(params: Exclude<MaterializeParams, { inPlace: true }>) {
  return { locationTemplate: params.locationTemplate, repo: params.repo, primaryWorktreePath: params.primaryWorktreePath,
    postCreateScript: params.postCreateScript, registeredHarnessDirs: params.registeredHarnessDirs };
}
async function missingBranchRemedy(ctx: Bound, branch: string, refreshed: boolean): Promise<string> {
  const presence = refreshed ? undefined : await boundedGitInvocation(ctx.exec, ["ls-remote", "--exit-code", "origin", `refs/heads/${branch}`], DEFAULT_NETWORK_TIMEOUT_MS, { cwd: ctx.cwd });
  if (presence?.outcome === "error" && presence.error instanceof Error && "exitCode" in presence.error && presence.error.exitCode === 2) return `origin lacks ${branch}; run git push -u origin ${branch} from the clone holding it, then retry materialize.`;
  return `The clone has neither ${branch} nor its remote-tracking ref. Once origin is reachable, run git fetch origin +refs/heads/${branch}:refs/remotes/origin/${branch}, then retry materialize.`;
}
async function refuseUnmarkedHolder(ctx: Bound, params: MaterializeParams, branch: string): Promise<void> {
  const roster = await scanRegisteredWorktrees(ctx.exec);
  if (!roster.ok) throw new Error(roster.message);
  for (const item of roster.worktrees) {
    if (item.branch !== branch) continue;
    const present = await stat(item.path).then(() => true, (error: unknown) => {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false; throw error;
    });
    if (present && params.inPlace && await localPathsEqual(item.path, ctx.cwd)) continue;
    if (present) throw new Error(`Checkout ${item.path} already has ${branch} out; run arc materialize ${params.name} --here from that checkout.`);
  }
}

async function claimMaterialization(ctx: Bound & { store: Store }, request: {
  primary: StoreRecord; operation: ReconcileWorkUnitWorktreeOp; branch: string | null; inPlace: boolean;
}): Promise<MaterializeResult> {
  const { primary, operation, branch, inPlace } = request;
  const allowed = await materializationOccupancy(ctx, primary, inPlace, operation);
  if (!allowed.ok) return { status: "rejected", reason: allowed.message, remedy: allowed.remedy };
  const valid = await revalidateLifecycleRecords(ctx.store, [primary]);
  if (valid.status === "refused") return { status: "rejected", reason: valid.refusal.condition, refusal: valid.refusal };
  const result = await ctx.reconcileWorkUnitWorktree(operation);
  if (result.mutation !== "spawn") throw new Error("Materialize returned no checkout placement");
  return { status: "materialized", branch, inPlace, worktreePath: result.worktreePath,
    advisories: result.postCreateNotice === undefined ? [] : [result.postCreateNotice] };
}

async function materializationOccupancy(ctx: Bound, primary: StoreRecord, inPlace: boolean,
  operation?: ReconcileWorkUnitWorktreeOp): Promise<GuardResult> {
  const occupancy = ctx.guardValidators?.["worktree-occupancy"];
  if (occupancy === undefined) return { ok: false, message: "guard `worktree-occupancy` is not wired." };
  return occupancy({ index: new Map(), slug: primary.reference.owner.name, primary, admitUnbound: true, position: null,
    inputs: { ...(operation === undefined ? {} : { worktreeOp: operation }), materializesCurrentCheckout: inPlace }, store: ctx.store });
}
