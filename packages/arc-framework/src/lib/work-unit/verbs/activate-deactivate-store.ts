/** Store-capability activation and deactivation around the shared lifecycle executor. */
import { recordReferences, sameReference } from "../../store/identity.js";
import { resolveProjectIdentity } from "../../store/project-identity.js";
import { selectWorkBranchLink, workBranchName } from "../../store/lifecycle-branch.js";
import { checkAdvancingPause } from "../../store/lifecycle-pause.js";
import type { Store } from "../../store/contract.js";
import type { StoreRecord } from "../../store/read.js";
import type { LifecycleEntry } from "../../store/lifecycle-index.js";
import { computeDefaultCaptureSet } from "../../git/default-capture-set.js";
import { readLifecycleView } from "../../store/lifecycle-view.js";
import { lifecycleArtifactPath, requireCompleteInventory } from "../../store/lifecycle-storage.js";
import { parseLifecycleMetaContent } from "../../store/lifecycle-meta-content.js";
import { mergeLifecycleLinks, readWorkUnit, workUnitArtifactName } from "../../store/lifecycle-write.js";
import { observeRecords } from "../../store/record-observations.js";
import type { Mutation, RecordObservation } from "../../store/write.js";
import { executeTransition, type TransitionOutcome } from "../lifecycle-executor.js";
import { activationBlockerReport } from "./activation-blocker-report.js";
import { activationCaptureReport, planActivationBranch } from "./activation-branch-plan.js";
import { hasPendingReconcileFindings, type CurrentWuReconcileResult } from "../side-effects/discharge-dep-edges.js";
import type { StoreTransitionInputs } from "../store-transition-types.js";
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
  const prepared = await prepareActivationRecords(ctx, store, entry);
  if (prepared.status === "rejected") return prepared;
  const { metaPath, reconcile, transition, blockers, retired } = prepared;
  const links = mergeLifecycleLinks(transition.primary.links, { branches: [plan.link] },
    plan.priorRef === null ? {} : { branches: [{ repository: plan.link.repository, ref: plan.priorRef }] });
  const outcome = await executeTransition(ctx, { verb: "activate", slug: params.name, inputs: {
    storeTransition: { ...transition, links, gitSteps: [plan.step] },
    softFields: { nextAction: params.nextAction },
  } });
  if (outcome.status !== "ok") return rejectActivationTransition(outcome, params.name);
  return { status: "activated", outcome, metaPath, reconcile, branch: plan.link.ref,
    report: [...plan.report, ...activationBlockerReport(blockers, reconcile.prepared.plan.dependency.discharged)],
    ...(plan.remoteDelete === undefined ? {} : { remoteDelete: plan.remoteDelete }), ...retired };
}

function rejectActivationTransition(outcome: Exclude<TransitionOutcome, { status: "ok" }>, name: string): Rejected {
  const rejected: Rejected = { status: "rejected", reason: outcome.message };
  if (outcome.status !== "rejected") return rejected;
  const { refusal, remedy } = outcome;
  if (refusal?.code === "version-conflict" && outcome.recovery === undefined) return { ...rejected,
    refusal: { ...refusal, remedy: { text: `Rerun arc activate ${name} with the original options to use the current records.` } } };
  return { ...rejected, refusal, remedy };
}

interface DraftRetirement {
  status: "ready";
  writes: Mutation[];
  observations: RecordObservation[];
  retired: { removedDraft?: string };
}

/** Bind reconciliation and draft retirement to the primary version used by the activation batch. */
async function prepareActivationRecords(ctx: ActivateContext, store: Store, entry: LifecycleEntry): Promise<Rejected | {
  status: "ready"; metaPath: string; reconcile: CurrentWuReconcileResult; blockers: string | null;
  transition: StoreTransitionInputs & { primary: StoreRecord }; retired: DraftRetirement["retired"];
}> {
  const name = entry.reference.owner.name;
  const metaPath = await lifecycleArtifactPath(ctx.cwd, entry, "meta");
  const inspected = await ctx.currentWuReconcile.prepare({ slug: name, metaPath, reference: entry.reference });
  if (inspected.status === "conflict") return { status: "rejected", reason: `Cannot activate ${name}: current-WU reconcile refused (${inspected.reason}).` };
  const { prepared } = inspected;
  const plan = prepared.storePlan;
  const primary = plan?.records.find(record => sameReference(record.reference, entry.reference));
  if (plan === undefined || primary === undefined) return { status: "rejected",
    reason: `Reconcile did not acquire the stored metadata for ${name}. Rerun arc activate ${name} through the operational store.` };
  const primaryWrite = plan.writes.find(write => sameReference(write.reference, primary.reference));
  const content = primaryWrite?.action === "put" ? primaryWrite.content : primary.content;
  const fields = parseLifecycleMetaContent(content);
  if (!fields.success) return { status: "rejected",
    reason: `Reconciled metadata for ${name} is invalid: ${fields.error} Repair the metadata and rerun arc activate ${name}.` };
  const { design, blockers } = fields.data;
  const draftName = workUnitArtifactName(name, "draft");
  const draft = recordReferences["work-item/draft"](primary.reference.owner);
  const retireDraft = !design.includes(draftName);
  const retirement = retireDraft ? await readDraftRetirement(store, draft, draftName)
    : { status: "ready" as const, writes: [], observations: [], retired: {} };
  if (retirement.status === "rejected") return retirement;
  const keepsRecord = (record: { reference: StoreRecord["reference"] }) => !retireDraft || !sameReference(record.reference, draft);
  const reconciledCompanions = plan.writes.filter(write => keepsRecord(write) && !sameReference(write.reference, primary.reference));
  const reconcile = primaryWrite !== undefined || reconciledCompanions.length > 0
    ? { status: "applied" as const, prepared, stagedPaths: [] }
    : { status: hasPendingReconcileFindings(prepared.plan) ? "pending" as const : "clean" as const, prepared };
  return { status: "ready", metaPath, reconcile, blockers, retired: retirement.retired, transition: {
    primary, content, additionalWrites: [...reconciledCompanions, ...retirement.writes],
    observations: [...observeRecords(plan.records.filter(keepsRecord)), ...retirement.observations],
  } };
}

/** A superseded draft is removed only at its read version, or observed absent in the same batch. */
async function readDraftRetirement(store: Store, reference: StoreRecord["reference"], name: string): Promise<DraftRetirement | Rejected> {
  const draft = await store.read({ reference });
  if (draft.status === "ok") return { status: "ready", observations: [],
    writes: [{ action: "remove", reference: draft.result.reference, expected: draft.result.version }], retired: { removedDraft: name } };
  if (draft.refusal.code === "not-found") return { status: "ready", writes: [], observations: [{ reference, expected: null }], retired: {} };
  return { status: "rejected", reason: draft.refusal.condition, refusal: draft.refusal };
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
