/** Give owned in-flight operational records a checkout without changing their state or pause. */
import { stat } from "node:fs/promises";
import { describeWorktreePreparationFailure } from "../incomplete-worktree-preparation.js";
import { localPathsEqual } from "../../local-path-identity.js";
import { ParsedMetaRecordSchema } from "../../active/meta-schema.js";
import { revalidateLifecycleRecords } from "../prepared-lifecycle-write.js";
import { boundedGitInvocation, type GitExec } from "../../git/exec.js";
import { refreshLifecycleRef, localLifecycleTip, resolveLifecycleBase } from "../../git/lifecycle-ref-refresh.js";
import { DEFAULT_NETWORK_TIMEOUT_MS } from "../../git/remote-ref-reader.js";
import { scanRegisteredWorktrees } from "../../git/worktree-roster.js";
import { selectWorkBranchLink, workBranchName } from "../../store/lifecycle-branch.js";
import { readLifecycleView } from "../../store/lifecycle-view.js";
import { requireCompleteInventory } from "../../store/lifecycle-storage.js";
import { readWorkUnit } from "../../store/lifecycle-write.js";
import { findWorkUnitHoldingCheckout } from "./unshared-work.js";
import type { MaterializeContext, MaterializeParams, MaterializeResult } from "./materialize.js";
import type { Store } from "../../store/contract.js";
import type { StoreRecord } from "../../store/read.js";
import type { LifecycleEntry } from "../../store/lifecycle-index.js";
import type { ReconcileWorkUnitWorktreeOp } from "../mutators/reconcile-work-unit-worktree.js";

type Bound = MaterializeContext & { cwd: string; exec: GitExec };
/** List candidates with one locus query per owned in-flight work unit. */
export async function listStoreMaterializable(ctx: Bound, identity: string, held = new Map<string, string>()): Promise<LifecycleEntry[]> {
  if (ctx.store === undefined) throw new Error("Materialize requires its operational store");
  const view = await readLifecycleView(ctx.store);
  if (view.status === "refused") throw new Error(`${view.refusal.condition} ${view.refusal.remedy.text}`);
  requireCompleteInventory(ctx.store, view.result.listing);
  const candidates: LifecycleEntry[] = [];
  for (const entry of view.result.entries) {
    if (entry.location !== "active" || entry.fields.owner !== identity) continue;
    if (!new Set(["Planning", "Active", "Integrating"]).has(entry.phase)) continue;
    const checkout = await findWorkUnitHoldingCheckout(ctx, entry.reference.owner.name);
    if (checkout === null) candidates.push(entry); else held.set(entry.reference.owner.name, checkout);
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
    const held = new Map<string, string>();
    const candidates = await listStoreMaterializable(bound, identity, held);
    const read = await readWorkUnit(ctx.store, params.name);
    if (read.status === "refused") return { status: "rejected", reason: read.refusal.condition, refusal: read.refusal };
    const name = read.result.reference.owner.name;
    if (!ownedInFlight(read.result, identity)) {
      return { status: "rejected", reason: `${name} is not owned in-flight work; refresh its ownership and lifecycle state, then retry materialize.` };
    }
    const entry = candidates.find((item) => item.reference.owner.name === name);
    if (entry === undefined) {
      const holder = held.get(name) ?? null;
      return { status: "rejected", reason: holder === null ? `${params.name} is not an owned in-flight materialize candidate. Candidates: ${candidates.map((item) => item.reference.owner.name).join(", ") || "[none]"}.` : `${params.name} is already held in checkout ${holder}; work there or release its claim.` };
    }
    const chosen = selectWorkBranchLink(read.result, { repository: await ctx.projectId?.() });
    if (chosen.kind === "ambiguous") return { status: "rejected", reason: chosen.reason };
    const branch = chosen.kind === "none" ? null : workBranchName(chosen.link.ref);
    const operation = await placementOperation(bound, { ...params, name }, branch, identity);
    return await claimMaterialization({ ...bound, store: ctx.store }, { primary: read.result, operation, branch, inPlace: params.inPlace === true });
  } catch (error) { return { status: "rejected", reason: describeWorktreePreparationFailure(error,
    ["arc", "materialize", params.name, ...(params.inPlace ? ["--here"] : [])]) }; }
}
async function placementOperation(ctx: Bound, params: MaterializeParams, branch: string | null, identity: string): Promise<ReconcileWorkUnitWorktreeOp> {
  if (params.inPlace && branch === null) return { mutation: "spawn", inPlace: true, preserveHead: true, wuName: params.name, spawningIdentity: identity };
  const baseBranch = params.baseBranch;
  if (baseBranch === undefined) throw new Error("Materialize requires the configured base branch.");
  const base = await resolveLifecycleBase(ctx.exec, ctx.cwd, baseBranch);
  if (branch !== null) {
    await refuseUnmarkedHolder(ctx, params, branch);
    const work = await refreshLifecycleRef(ctx.exec, ctx.cwd, branch);
    const local = await localLifecycleTip(ctx.exec, ctx.cwd, `refs/heads/${branch}`), remote = await localLifecycleTip(ctx.exec, ctx.cwd, `refs/remotes/origin/${branch}`);
    if (local === null && remote === null) throw new Error(await missingBranchRemedy(ctx, branch, work));
    const common = { mutation: "spawn" as const, branch, createBranch: local === null, wuName: params.name, spawningIdentity: identity };
    return params.inPlace ? { ...common, inPlace: true, ...(local === null ? { startPoint: remote ?? undefined } : {}) }
      : { ...common, base: remote ?? local ?? branch, ...spawnPlacement(params) };
  }
  if (base === null) throw new Error(`No base ref resolves. Fetch origin +refs/heads/${baseBranch}:refs/remotes/origin/${baseBranch}, or run git branch ${baseBranch} <commit>, then retry arc materialize ${params.name}.`);
  if (params.inPlace) throw new Error("Branchless in-place placement should have been marker-only");
  return { mutation: "spawn", detached: true, base, wuName: params.name, spawningIdentity: identity, ...spawnPlacement(params) };
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

function ownedInFlight(record: StoreRecord, identity: string): boolean {
  const fields = ParsedMetaRecordSchema.parse(record.fields);
  return record.placement?.kind === "active" && fields.owner === identity
    && new Set(["Planning", "Active", "Integrating"]).has(fields.state ?? "");
}

async function claimMaterialization(ctx: Bound & { store: Store }, request: {
  primary: StoreRecord; operation: ReconcileWorkUnitWorktreeOp; branch: string | null; inPlace: boolean;
}): Promise<MaterializeResult> {
  const { primary, operation, branch, inPlace } = request;
  const occupancy = ctx.guardValidators?.["worktree-occupancy"];
  if (occupancy === undefined) return { status: "rejected", reason: "guard `worktree-occupancy` is not wired." };
  const allowed = await occupancy({ index: new Map(), slug: primary.reference.owner.name, position: null,
    inputs: { worktreeOp: operation, materializesCurrentCheckout: inPlace }, store: ctx.store });
  if (!allowed.ok) return { status: "rejected", reason: allowed.message, remedy: allowed.remedy };
  const valid = await revalidateLifecycleRecords(ctx.store, [primary]);
  if (valid.status === "refused") return { status: "rejected", reason: valid.refusal.condition, refusal: valid.refusal };
  const result = await ctx.reconcileWorkUnitWorktree(operation);
  if (result.mutation !== "spawn") throw new Error("Materialize returned no checkout placement");
  return { status: "materialized", branch, inPlace, worktreePath: result.worktreePath,
    advisories: result.postCreateNotice === undefined ? [] : [result.postCreateNotice] };
}
