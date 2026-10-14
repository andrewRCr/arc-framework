/** Store-capability activation and deactivation around the shared lifecycle executor. */
import { selectWorkBranchLink, workBranchName } from "../../store/lifecycle-branch.js";
import { checkAdvancingPause } from "../../store/lifecycle-pause.js";
import type { Store } from "../../store/contract.js";
import type { StoreRecord } from "../../store/read.js";
import type { LifecycleEntry } from "../../store/lifecycle-index.js";
import { computeDefaultCaptureSet } from "../../git/default-capture-set.js";
import { readLifecycleView } from "../../store/lifecycle-view.js";
import { lifecycleArtifactPath, requireCompleteInventory } from "../../store/lifecycle-storage.js";
import { mergeLifecycleLinks, readWorkUnit } from "../../store/lifecycle-write.js";
import { executeTransition } from "../lifecycle-executor.js";
import { activationCaptureReport, planActivationBranch } from "./activation-branch-plan.js";
import type { ActivateContext, ActivateParams, ActivateResult, DeactivateContext, DeactivateParams, DeactivateResult } from "./activate-deactivate.js";

/** Activate only after branch preflight, fetches and inventory refusals have all resolved. */
export async function runStoreActivate(ctx: ActivateContext, params: ActivateParams): Promise<ActivateResult> {
  if (ctx.store === undefined || ctx.exec === undefined || ctx.projectId === undefined) return { status: "rejected", reason: "Activation requires the operational store, Git boundary, and repository project ID." };
  const store = ctx.store;
  const facts = await readLifecyclePrimary(store, params.name);
  if (facts.status === "rejected") return facts;
  const { primary, entry } = facts;
  const record = entry.fields;
  const pause = await checkAdvancingPause(store, params.name);
  if (pause.status === "rejected") return pause;
  if (record.state !== "Planning" || primary.placement?.kind !== "active") return { status: "rejected", reason: `${params.name} is not a Planning work unit held in active placement.` };
  const peers = await readOtherPrimaries(store, primary);
  if (peers.status === "rejected") return peers;
  const plan = await planActivationBranch({ exec: ctx.exec, execRaw: ctx.execRaw, cwd: ctx.cwd, name: params.name,
    toBranch: params.toBranch, baseBranch: params.baseBranch, repository: await ctx.projectId(), primary, otherPrimaries: peers.records });
  if (plan.status === "refused") return { status: "rejected", reason: plan.reason };
  const metaPath = lifecycleArtifactPath(entry, "meta");
  const prepared = await ctx.currentWuReconcile.prepare({ slug: params.name, metaPath });
  if (prepared.status === "conflict") return { status: "rejected", reason: `Cannot activate ${params.name}: current-WU reconcile refused (${prepared.reason}).` };
  const reconcile = await ctx.currentWuReconcile.apply(prepared.prepared);
  if (reconcile.status === "conflict") return { status: "reconcile-failed", reason: `Activation reconcile became stale; retry arc activate ${params.name}.`, metaPath, reconcile };
  const updated = await readWorkUnit(store, params.name);
  if (updated.status === "refused") return { status: "rejected", reason: updated.refusal.condition, refusal: updated.refusal };
  const links = mergeLifecycleLinks(updated.result.links, { branches: [plan.link] },
    plan.priorRef === null ? {} : { branches: [{ repository: plan.link.repository, ref: plan.priorRef }] });
  const outcome = await executeTransition(ctx, { verb: "activate", slug: params.name, inputs: {
    storeTransition: { primary: updated.result, links, gitSteps: [plan.step] }, softFields: { nextAction: params.nextAction },
  } });
  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message,
    ...(outcome.status === "rejected" ? { refusal: outcome.refusal, remedy: outcome.remedy } : {}) };
  return { status: "activated", outcome, metaPath, reconcile, branch: plan.link.ref, report: plan.report,
    ...(plan.remoteDelete === undefined ? {} : { remoteDelete: plan.remoteDelete }) };
}

/** Keep the branch and its link, reporting task work while returning the work unit to Planning. */
export async function runStoreDeactivate(ctx: DeactivateContext, params: DeactivateParams): Promise<DeactivateResult> {
  if (ctx.store === undefined) return { status: "rejected", reason: "Deactivation requires the operational store." };
  const facts = await readLifecyclePrimary(ctx.store, params.name);
  if (facts.status === "rejected") return facts;
  const { primary, entry } = facts;
  const pause = await checkAdvancingPause(ctx.store, params.name);
  if (pause.status === "rejected") return pause;
  const meta = entry.fields;
  const planningWorkflow = meta.design.length !== 0 && meta.design.every((name) => name.startsWith("spec-")) ? "generate-tasks" : "draft-design";
  const outcome = await executeTransition(ctx, { verb: "deactivate", slug: params.name, inputs: {
    storeTransition: { primary }, currentWorkflowOverride: planningWorkflow,
  } });
  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message, ...(outcome.status === "rejected" ? { refusal: outcome.refusal, remedy: outcome.remedy } : {}) };
  const report = await deactivationReport(ctx, params, primary);
  const chosen = await deactivationBranch(ctx, primary);
  if (chosen.reason !== undefined) report.push(chosen.reason);
  return { status: "deactivated", outcome, metaPath: lifecycleArtifactPath(entry, "meta"), branch: chosen.branch, report };
}

async function deactivationReport(ctx: DeactivateContext, params: DeactivateParams, primary: StoreRecord): Promise<string[]> {
  const report: string[] = [];
  try {
  if (ctx.exec !== undefined && ctx.projectId !== undefined && params.baseBranch !== undefined) {
    const inventory = await computeDefaultCaptureSet({ exec: ctx.exec, execRaw: ctx.execRaw, cwd: ctx.cwd,
      baseBranch: params.baseBranch, repository: await ctx.projectId(), captures: Object.values(primary.links?.taskCaptures ?? {}).flat(),
      exclusions: primary.links?.branches?.flatMap((branch) => branch.excluded) ?? [] });
    if (inventory.status === "refused") report.push(`${inventory.reason} ${inventory.remedy}`);
    else report.push(...inventory.warnings, ...(await activationCaptureReport(ctx.exec, ctx.cwd, inventory)).lines);
  } else report.push("The base inventory is unavailable; configure the Git and repository identity boundaries, then retry the report.");
  } catch (error) { report.push(`The default task inventory could not be observed: ${String(error)}; retry its report.`); }
  return report;
}

type Rejected = Extract<ActivateResult, { status: "rejected" }>;
async function readLifecyclePrimary(store: Store, name: string): Promise<{ status: "ready"; primary: StoreRecord; entry: LifecycleEntry } | Rejected> {
  const view = await readLifecycleView(store);
  if (view.status === "refused") return { status: "rejected", reason: view.refusal.condition, refusal: view.refusal };
  try { requireCompleteInventory(store, view.result.listing); } catch (error) { return { status: "rejected", reason: String(error) }; }
  const read = await readWorkUnit(store, name);
  if (read.status === "refused") return { status: "rejected", reason: read.refusal.condition, refusal: read.refusal };
  const primary = read.result;
  const entry = view.result.entries.find((candidate) => candidate.reference.owner.name === primary.reference.owner.name);
  return entry === undefined ? { status: "rejected", reason: `Lifecycle inventory does not contain ${name}.` } : { status: "ready", primary, entry };
}
async function readOtherPrimaries(store: Store, primary: StoreRecord): Promise<{ status: "ready"; records: StoreRecord[] } | Rejected> {
  const listing = await store.list({ family: "work-item", kind: "work-item/meta" });
  if (listing.status === "refused") return { status: "rejected", reason: listing.refusal.condition, refusal: listing.refusal };
  const result = listing.result;
  if (result.status === "unreadable") return { status: "rejected", reason: `${result.condition} ${result.remedy.text}` };
  if (result.status === "complete" && (result.missed || result.diagnostics.length !== 0)) return { status: "rejected",
    reason: result.diagnostics.map((entry) => `${entry.condition} ${entry.remedy.text}`).join("; ") || "Lifecycle inventory missed records; repair the inventory and retry activation." };
  return { status: "ready", records: result.status === "complete" ? result.records.filter((other) => other.reference.owner.name !== primary.reference.owner.name) : [] };
}

async function deactivationBranch(ctx: DeactivateContext, primary: StoreRecord): Promise<{ branch?: string; reason?: string }> {
  try {
    const repository = await ctx.projectId?.();
    const branch = ctx.exec === undefined ? undefined : (await ctx.exec("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: ctx.cwd })).stdout.trim();
    const choice = selectWorkBranchLink(primary, { repository, currentBranch: branch });
    if (choice.kind === "ambiguous") return { reason: choice.reason };
    return choice.kind === "linked" ? { branch: workBranchName(choice.link.ref) } : {};
  } catch (error) { return { reason: `The kept work branch could not be observed: ${String(error)}.` }; }
}
