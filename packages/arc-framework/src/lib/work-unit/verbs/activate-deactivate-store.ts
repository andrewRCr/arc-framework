/** Store-capability activation and deactivation around the shared lifecycle executor. */
import { sameReference } from "../../store/identity.js";
import { resolveProjectIdentity } from "../../store/project-identity.js";
import { selectWorkBranchLink, workBranchName } from "../../store/lifecycle-branch.js";
import { checkAdvancingPause } from "../../store/lifecycle-pause.js";
import type { Store } from "../../store/contract.js";
import type { StoreRecord } from "../../store/read.js";
import type { LifecycleEntry } from "../../store/lifecycle-index.js";
import { computeDefaultCaptureSet } from "../../git/default-capture-set.js";
import { readLifecycleView } from "../../store/lifecycle-view.js";
import { lifecycleArtifactPath, requireCompleteInventory } from "../../store/lifecycle-storage.js";
import { mergeLifecycleLinks, readOwnDraft, readWorkUnit, workUnitArtifactName } from "../../store/lifecycle-write.js";
import type { Mutation } from "../../store/write.js";
import { executeTransition } from "../lifecycle-executor.js";
import { ParsedMetaRecordSchema } from "../../active/meta-schema.js";
import { activationBlockerReport } from "./activation-blocker-report.js";
import { activationCaptureReport, planActivationBranch } from "./activation-branch-plan.js";
import type { CurrentWuReconcileResult } from "../side-effects/discharge-dep-edges.js";
import type { ActivateContext, ActivateParams, ActivateResult, DeactivateContext, DeactivateParams, DeactivateResult } from "./activate-deactivate.js";

/** Activate only after branch preflight, fetches and inventory refusals have all resolved. */
export async function runStoreActivate(ctx: ActivateContext, params: ActivateParams): Promise<ActivateResult> {
  if (ctx.store === undefined || ctx.exec === undefined || ctx.projectId === undefined) return { status: "rejected", reason: "Activation requires the operational store, Git boundary, and repository project ID." };
  const store = ctx.store;
  const facts = await readLifecyclePrimary(ctx.cwd, store, params.name);
  if (facts.status === "rejected") return facts;
  const { primary, entry } = facts;
  const record = entry.fields;
  const pause = await checkAdvancingPause(store, params.name, primary);
  if (pause.status === "rejected") return pause;
  if (record.state !== "Planning" || primary.placement?.kind !== "active") return { status: "rejected", reason: `${params.name} is not a Planning work unit held in active placement.` };
  const peers = await readOtherPrimaries(store, primary);
  if (peers.status === "rejected") return peers;
  const repository = await resolveProjectIdentity(ctx.projectId);
  if (repository.status === "unavailable") return { ...repository, status: "rejected" };
  const plan = await planActivationBranch({ exec: ctx.exec, execRaw: ctx.execRaw, cwd: ctx.cwd, name: params.name,
    toBranch: params.toBranch, baseBranch: params.baseBranch, repository: repository.id, primary, otherPrimaries: peers.records });
  if (plan.status === "refused") return { status: "rejected", reason: plan.reason };
  const retired = await supersededDraftRemoval(store, primary, record.design);
  if (retired.status === "rejected") return retired;
  const reconciled = await reconcileForActivation(ctx, store, { name: params.name, entry, primary });
  if (reconciled.status !== "ready") return reconciled;
  const { metaPath, reconcile, updated } = reconciled;
  const links = mergeLifecycleLinks(updated.links, { branches: [plan.link] },
    plan.priorRef === null ? {} : { branches: [{ repository: plan.link.repository, ref: plan.priorRef }] });
  const outcome = await executeTransition(ctx, { verb: "activate", slug: params.name, inputs: {
    storeTransition: { primary: updated, links, gitSteps: [plan.step], additionalWrites: retired.writes },
    softFields: { nextAction: params.nextAction },
  } });
  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message,
    ...(outcome.status === "rejected" ? { refusal: outcome.refusal, remedy: outcome.remedy } : {}) };
  return { status: "activated", outcome, metaPath, reconcile, branch: plan.link.ref,
    report: [...plan.report, ...activationBlockerReport(ParsedMetaRecordSchema.parse(updated.fields).blockers, reconcile.prepared.plan.dependency.discharged)],
    ...(plan.remoteDelete === undefined ? {} : { remoteDelete: plan.remoteDelete }), ...retired.result };
}

/** A draft the design no longer names rides the activation batch as its removal; one it still names is the design. */
async function supersededDraftRemoval(store: Store, primary: StoreRecord, design: readonly string[]):
  Promise<{ status: "ready"; writes: Mutation[]; result: { removedDraft?: string } } | Rejected> {
  const name = workUnitArtifactName(primary.reference.owner.name, "draft");
  const draft = design.includes(name) ? undefined : await readOwnDraft(store, primary);
  if (draft === undefined) return { status: "ready", writes: [], result: {} };
  if (draft.status === "refused") return { status: "rejected", reason: draft.refusal.condition, refusal: draft.refusal };
  return { status: "ready", writes: [{ action: "remove", reference: draft.result.reference, expected: draft.result.version }],
    result: { removedDraft: name } };
}

/** Reconcile the current work unit onto the activating one, then re-read the primary the reconcile may have touched. */
async function reconcileForActivation(ctx: ActivateContext, store: Store, { name, entry, primary }: { name: string; entry: LifecycleEntry; primary: StoreRecord }):
  Promise<{ status: "ready"; metaPath: string; reconcile: CurrentWuReconcileResult; updated: StoreRecord } | Exclude<ActivateResult, { status: "activated" }>> {
  const metaPath = await lifecycleArtifactPath(ctx.cwd, entry, "meta");
  const prepared = await ctx.currentWuReconcile.prepare({ slug: name, metaPath, reference: primary.reference });
  if (prepared.status === "conflict") return { status: "rejected", reason: `Cannot activate ${name}: current-WU reconcile refused (${prepared.reason}).` };
  const reconcile = await ctx.currentWuReconcile.apply(prepared.prepared);
  if (reconcile.status === "conflict") return { status: "reconcile-failed", reason: `Activation reconcile became stale; retry arc activate ${name}.`, metaPath, reconcile };
  const updated = await store.read({ reference: primary.reference });
  if (updated.status === "refused") return { status: "rejected", reason: updated.refusal.condition, refusal: updated.refusal };
  return { status: "ready", metaPath, reconcile, updated: updated.result };
}

/** Keep the branch and its link, reporting task work while returning the work unit to Planning. */
export async function runStoreDeactivate(ctx: DeactivateContext, params: DeactivateParams): Promise<DeactivateResult> {
  if (ctx.store === undefined) return { status: "rejected", reason: "Deactivation requires the operational store." };
  const facts = await readLifecyclePrimary(ctx.cwd, ctx.store, params.name);
  if (facts.status === "rejected") return facts;
  const { primary, entry } = facts;
  const pause = await checkAdvancingPause(ctx.store, params.name, primary);
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
  return { status: "deactivated", outcome, metaPath: await lifecycleArtifactPath(ctx.cwd, entry, "meta"), branch: chosen.branch, report };
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
async function readLifecyclePrimary(checkoutRoot: string, store: Store, name: string): Promise<{ status: "ready"; primary: StoreRecord; entry: LifecycleEntry } | Rejected> {
  const view = await readLifecycleView(checkoutRoot, store);
  if (view.status === "refused") return { status: "rejected", reason: view.refusal.condition, refusal: view.refusal };
  try { requireCompleteInventory(store, view.result.listing); } catch (error) { return { status: "rejected", reason: String(error) }; }
  const read = await readWorkUnit(store, name);
  if (read.status === "refused") return { status: "rejected", reason: read.refusal.condition, refusal: read.refusal };
  const primary = read.result;
  const entry = view.result.entries.find((candidate) => sameReference(candidate.reference, primary.reference));
  return entry === undefined ? { status: "rejected", reason: `Lifecycle inventory does not contain ${name}.` } : { status: "ready", primary, entry };
}
async function readOtherPrimaries(store: Store, primary: StoreRecord): Promise<{ status: "ready"; records: StoreRecord[] } | Rejected> {
  const records: StoreRecord[] = [];
  for (const kind of ["work-item/meta", "work-item/record"] as const) {
    const listing = await store.list({ family: "work-item", kind });
    if (listing.status === "refused") return { status: "rejected", reason: listing.refusal.condition, refusal: listing.refusal };
    const result = listing.result;
    if (result.status === "unreadable") return { status: "rejected", reason: `${result.condition} ${result.remedy.text}` };
    if (result.status === "complete" && (result.missed || result.diagnostics.length !== 0)) return { status: "rejected",
      reason: result.diagnostics.map((entry) => `${entry.condition} ${entry.remedy.text}`).join("; ") || "Lifecycle inventory missed records; repair the inventory and retry activation." };
    if (result.status === "complete") records.push(...result.records.filter((other) => !sameReference(other.reference, primary.reference)));
  }
  return { status: "ready", records };
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
