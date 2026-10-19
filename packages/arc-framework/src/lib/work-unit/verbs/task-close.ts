/** Atomic task closure and deferral over operational records, with additive code captures. */
import { resolveProjectIdentity } from "../../store/project-identity.js";
import { ParsedMetaRecordSchema } from "../../active/meta-schema.js";
import type { GitExec, RawGitExec } from "../../git/exec.js";
import { computeCopyKeys } from "../../git/copy-key.js";
import { computeDefaultCaptureSet, resolveLinkedCheckoutBranch, type DefaultCaptureSetResult, type DefaultCaptureCommit, type LinkedCheckoutBranch } from "../../git/default-capture-set.js";
import type { Store } from "../../store/contract.js";
import { checkAdvancingPause } from "../../store/lifecycle-pause.js";
import { readLifecycleView } from "../../store/lifecycle-view.js";
import { requireCompleteInventory } from "../../store/lifecycle-storage.js";
import type { StoreRefusal } from "../../store/refusal.js";
import { GitProcessError } from "../../git/process-error.js";
import type { StoreRecord } from "../../store/read.js";
import { recordReferences } from "../../store/identity.js";
import { CommitShaSchema, type BranchLink } from "../../store/links.js";
import { workBranchName } from "../../store/lifecycle-branch.js";
import { usesOffBranchState, readWorkUnit, recordPut, batchLifecycleWrites, mergeLifecycleLinks } from "../../store/lifecycle-write.js";
import { prepareTaskTargets, refuseTask, type PreparedTaskTargets, type TaskRefusal } from "../task-targets.js";
import { planTaskCaptures, type TaskAttribution } from "../task-attribution.js";

/** Store, clone identity, and bounded Git boundaries for the work unit holding this checkout. */
export interface TaskVerbContext { store?: Store; projectId?: () => Promise<string>; cwd: string; slug: string; exec: GitExec; execRaw?: RawGitExec; baseBranch: string }
/** Explicit tasks and optional repository-local committed SHAs. */
export interface TaskCloseParams { ids?: readonly string[]; commits?: readonly string[]; refreshed?: Extract<DefaultCaptureSetResult, { status: "available" }> }
/** Captured close outcome with attribution and refresh reporting. */
export type TaskCloseResult = TaskRefusal | { status: "closed"; ids: string[]; changed: boolean; captured: string[]; attributions: TaskAttribution[]; uncapturedTasks: string[]; warnings: string[] };
/** Exact preparation shared with the release wrapper before it commits. */
export interface PreparedTaskClose { status: "prepared"; store: Store; meta: StoreRecord; tasks: StoreRecord; targets: PreparedTaskTargets; branch: BranchLink; repository: string; snapshot?: Extract<DefaultCaptureSetResult, { status: "available" }> }

/** Read and validate the work-unit task record, pause, branch, and base before any commit or write.
 * @param ctx - Checkout-owned work unit and operational boundaries
 * @param params - Requested task IDs and commit choices
 * @returns Validated exact records and refresh facts, or refusal with no write
 */
export async function prepareTaskClose(ctx: TaskVerbContext, params: TaskCloseParams, options: { precommit?: boolean } = {}): Promise<PreparedTaskClose | TaskRefusal> {
  const basis = await readTaskBasis(ctx, params.ids ?? [], "close");
  if (basis.status === "refused") return basis;
  const project = await resolveProjectIdentity(ctx.projectId);
  if (project.status === "unavailable") return { status: "refused", code: project.refusal?.code ?? "project-identity-unavailable",
    reason: project.reason, remedy: project.remedy, ...(project.refusal === undefined ? {} : { refusal: project.refusal }) };
  const repository = project.id;
  const relation = await resolveLinkedCheckoutBranch({ exec: ctx.exec, cwd: ctx.cwd, repository, branches: basis.meta.links?.branches ?? [] });
  if (relation.kind !== "linked") {
    return unlinkedTaskRefusal(basis.meta, relation, ctx.slug, repository);
  }
  if ((params.commits?.length ?? 0) > 0) return { ...basis, branch: relation.link, repository };
  const snapshot = await computeDefaultCaptureSet({ exec: ctx.exec, execRaw: ctx.execRaw, cwd: ctx.cwd, baseBranch: ctx.baseBranch,
    repository, captures: Object.values(basis.meta.links?.taskCaptures ?? {}).flat(), exclusions: relation.link.excluded,
    refresh: params.refreshed === undefined });
  if (snapshot.status === "refused") return refuseTask(snapshot.reason, snapshot.remedy, "base-unavailable");
  if (options.precommit !== true && params.refreshed === undefined && snapshot.baseRefreshed === true && snapshot.beforeRefresh.length > 0 && snapshot.commits.length === 0) {
    return refuseTask(`Base refresh found these commits already on base: ${snapshot.beforeRefresh.map((commit) => commit.sha).join(", ")}.`,
      `If the task produced no commit, rerun arc task close ${basis.targets.ids.join(" ")}.`, "base-emptied-set");
  }
  return { ...basis, branch: relation.link, repository, snapshot: params.refreshed === undefined ? snapshot
    : { ...snapshot, baseRefreshed: params.refreshed.baseRefreshed, warnings: params.refreshed.warnings } };
}

/** Close tasks and capture commits without creating a commit itself.
 * @param ctx - Work-unit checkout and operational boundaries
 * @param params - Named tasks, explicit commits, or a reused base refresh
 * @returns Atomic closure outcome or actionable refusal
 */
export async function runTaskClose(ctx: TaskVerbContext, params: TaskCloseParams = {}): Promise<TaskCloseResult> {
  const prepared = await prepareTaskClose(ctx, params);
  if (prepared.status === "refused") return prepared;
  const commits = params.commits?.length ? await explicitCommits(ctx, params.commits) : prepared.snapshot?.commits ?? [];
  if (!Array.isArray(commits)) return commits;
  const plan = planTaskCaptures({ links: prepared.meta.links, branch: prepared.branch, ids: prepared.targets.ids,
    commits, explicit: (params.commits?.length ?? 0) > 0 });
  const links = mergeLifecycleLinks(prepared.meta.links, { taskCaptures: plan.taskCaptures, branches: [plan.branch] });
  const changed = prepared.targets.content !== prepared.tasks.content || JSON.stringify(links) !== JSON.stringify(prepared.meta.links);
  if (changed) {
    const result = await batchLifecycleWrites(prepared.store, [recordPut(prepared.tasks, { content: prepared.targets.content }), recordPut(prepared.meta, { links })],
      { verb: "task-close", lifecycleAction: "close" });
    if (result.status === "refused") return taskStoreRefusal(result.refusal);
  }
  return { status: "closed", ids: prepared.targets.ids, changed, captured: commits.map((commit) => commit.sha), attributions: plan.attributions,
    uncapturedTasks: plan.uncapturedTasks, warnings: prepared.snapshot?.warnings ?? [] };
}

/** Defer an open task and its open subtasks, resolving parent markers in the same batch.
 * @param ctx - Work-unit checkout and operational store
 * @param id - Exact open task identifier
 * @returns Deferral outcome or refusal without writes
 */
export async function runTaskDefer(ctx: TaskVerbContext, id: string): Promise<TaskRefusal | { status: "deferred"; ids: string[] }> {
  const basis = await readTaskBasis(ctx, [id], "defer");
  if (basis.status === "refused") return basis;
  const result = await batchLifecycleWrites(basis.store, [recordPut(basis.tasks, { content: basis.targets.content }), recordPut(basis.meta)], { verb: "task-defer", lifecycleAction: "defer" });
  return result.status === "refused" ? taskStoreRefusal(result.refusal)
    : { status: "deferred", ids: basis.targets.ids };
}

async function readTaskBasis(ctx: TaskVerbContext, ids: readonly string[], operation: "close" | "defer"): Promise<{
  status: "prepared"; store: Store; meta: StoreRecord; tasks: StoreRecord; targets: PreparedTaskTargets;
} | TaskRefusal> {
  const store = ctx.store;
  if (store === undefined || !usesOffBranchState(store)) return refuseTask(`arc task ${operation} is unsupported before the storage flip.`,
    `Mark tasks by hand ${operation === "close" ? "[x]" : "[~]"} until the flip.`, "unsupported");
  const meta = await readWorkUnit(store, ctx.slug);
  if (meta.status === "refused") return taskStoreRefusal(meta.refusal);
  const fields = ParsedMetaRecordSchema.safeParse(meta.result.fields);
  if (!fields.success) return refuseTask("Work-unit metadata does not read.", "Repair the work-unit metadata, then retry.");
  const pause = await checkAdvancingPause(store, ctx.slug);
  if (pause.status === "rejected") return pause.refusal === undefined ? { status: "refused", code: "paused", reason: pause.reason,
    remedy: { text: `Run arc resume ${ctx.slug}.`, argv: ["arc", "resume", ctx.slug] } }
    : taskStoreRefusal(pause.refusal);
  const inventory = await readTaskInventory(store);
  if (inventory !== undefined) return inventory;
  const tasks = await store.read({ reference: recordReferences["work-item/task-list"](meta.result.reference.owner) });
  if (tasks.status === "refused") return taskStoreRefusal(tasks.refusal);
  const targets = prepareTaskTargets(tasks.result.content, ids, operation);
  return targets.status === "refused" ? targets : { status: "prepared", store, meta: meta.result, tasks: tasks.result, targets };
}

async function explicitCommits(ctx: TaskVerbContext, requested: readonly string[]): Promise<DefaultCaptureCommit[] | TaskRefusal> {
  const commits = [...new Set(requested)];
  for (const sha of commits) {
    if (!CommitShaSchema.safeParse(sha).success) return refuseTask(`Invalid commit SHA ${sha}.`, "Name a full commit SHA reachable from HEAD.");
    try {
      const object = await ctx.exec("git", ["--no-replace-objects", "cat-file", "-t", sha], { cwd: ctx.cwd, objectAccess: "local-only" });
      if (object.stdout.trim() !== "commit") return refuseTask(`Object ${sha} is not a commit.`,
        "Name the full SHA of the underlying commit reachable from HEAD; tag, tree, and blob objects cannot be captured.");
      await ctx.exec("git", ["--no-replace-objects", "merge-base", "--is-ancestor", sha, "HEAD"], { cwd: ctx.cwd, objectAccess: "local-only" });
    } catch (error) {
      if (!(error instanceof GitProcessError && error.kind === "nonzero-exit" && (error.exitCode === 1 || error.exitCode === 128))) throw error;
      return refuseTask(`Commit ${sha} is not reachable from HEAD.`, `Name a commit HEAD holds; merge its reported tip with git merge --ff --no-edit <sha> first.`, "commit-unreachable");
    }
  }
  const keys = await computeCopyKeys({ cwd: ctx.cwd, commits, execRaw: ctx.execRaw });
  return commits.map((sha) => ({ sha, ...(keys.get(sha) ?? { authorTime: null, committerTime: null }) }));
}

function taskStoreRefusal(refusal: StoreRefusal): TaskRefusal {
  return { status: "refused", code: refusal.code, reason: refusal.condition, remedy: refusal.remedy, refusal };
}
async function readTaskInventory(store: Store): Promise<TaskRefusal | undefined> {
  const view = await readLifecycleView(store);
  if (view.status === "refused") return taskStoreRefusal(view.refusal);
  try { requireCompleteInventory(store, view.result.listing); }
  catch (error) { return refuseTask(error instanceof Error ? error.message : String(error), "Repair the named lifecycle records, then retry the task verb.", "inventory-incomplete"); }
  return undefined;
}

/** Compose the same branch condition and repair for close and its read-only commit listing.
 * @param meta - Selected work-unit record and its branch links.
 * @param relation - The checkout's unresolved relationship to those links.
 * @param slug - Work unit whose lifecycle may need repair.
 * @param repository - Current project's stable identity.
 * @returns The close's exact refusal and ordered human repair.
 */
export function unlinkedTaskRefusal(meta: StoreRecord, relation: Exclude<LinkedCheckoutBranch, { kind: "linked" }>, slug: string, repository: string): TaskRefusal {
  const fields = ParsedMetaRecordSchema.parse(meta.fields);
  const repair = relation.kind === "ambiguous" ? `Repair duplicate branch links for ${relation.branch} in this project, then retry arc task close.`
    : relation.kind === "no-link" ? fields.state === "Planning" ? "Run arc activate." : `Run arc deactivate ${slug}, then arc activate.`
      : `Run git switch ${(meta.links?.branches ?? []).filter((link) => link.repository === repository).map((link) => workBranchName(link.ref)).join(" or ")}.`;
  return refuseTask(`Task close requires a linked work branch (${relation.kind}).`, repair, "branch-unlinked");
}
