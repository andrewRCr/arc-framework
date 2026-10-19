/** Entering-work-unit projection of commits the task close's default capture would take. */
import type { Store } from "../store/contract.js";
import type { GitExec, RawGitExec } from "../git/exec.js";
import { computeDefaultCaptureSet, resolveLinkedCheckoutBranch, type DefaultCaptureCommit } from "../git/default-capture-set.js";
import type { SessionAction } from "../session-init/actions.js";
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import { resolveTaskListCursor } from "../task-list/cursor.js";
import { readWorkUnit } from "../store/lifecycle-write.js";
import { readLifecycleView } from "../store/lifecycle-view.js";
import { requireCompleteInventory } from "../store/lifecycle-storage.js";
import { recordReferences } from "../store/identity.js";
import { createProjectIdentityReader, resolveProjectIdentity } from "../store/project-identity.js";
import type { StoreRefusal } from "../store/refusal.js";
import { prepareTaskTargets, refuseTask, type TaskRefusal } from "../work-unit/task-targets.js";
import { unlinkedTaskRefusal } from "../work-unit/verbs/task-close.js";
/** One read-only listing or the close's refusal with its exact repair. */
export type UnclosedTaskCommits =
  | { status: "available"; commits: DefaultCaptureCommit[]; actions: SessionAction[]; warnings: string[] }
  | (TaskRefusal & { actions: SessionAction[] });
/** Boundaries for one selected entering work unit, never an entire checkout roster. */
export interface ComputeUnclosedTaskCommitsInput {
  store?: Store; slug: string; cwd: string; baseBranch: string; exec: GitExec; execRaw?: RawGitExec; projectId?: () => Promise<string>;
}
/** Compute once after entering work-unit selection; inactive or in-repo contexts carry no listing. */
export async function computeUnclosedTaskCommits(input: ComputeUnclosedTaskCommitsInput): Promise<UnclosedTaskCommits | null> {
  const store = input.store;
  if (!store?.capabilities.stateOffBranch) return null;
  const meta = await readWorkUnit(store, input.slug);
  if (meta.status === "refused") return projectRefusal(input, storeRefusal(meta.refusal));
  const fields = ParsedMetaRecordSchema.safeParse(meta.result.fields);
  if (!fields.success) return projectRefusal(input, refuseTask("Work-unit metadata does not read.", "Repair the work-unit metadata, then retry."));
  if (fields.data.state !== "Active" || meta.result.placement?.kind !== "active") return null;
  const tasks = await store.read({ reference: recordReferences["work-item/task-list"](meta.result.reference.owner) });
  if (tasks.status === "refused") return projectRefusal(input, storeRefusal(tasks.refusal));
  if (resolveTaskListCursor(tasks.result.content).status === "no-open-task") return null;
  const targets = prepareTaskTargets(tasks.result.content, [], "close");
  if (targets.status === "refused") return projectRefusal(input, targets);
  const inventory = await inventoryRefusal(store);
  if (inventory !== null) return projectRefusal(input, inventory);
  const project = await projectIdentity(input, store);
  if (project.status === "refused") return projectRefusal(input, project);
  const relation = await resolveLinkedCheckoutBranch({ ...input, repository: project.id, branches: meta.result.links?.branches ?? [] });
  if (relation.kind !== "linked") return projectRefusal(input, unlinkedTaskRefusal(meta.result, relation, input.slug, project.id));
  const snapshot = await computeDefaultCaptureSet({ ...input, repository: project.id, refresh: false,
    captures: Object.values(meta.result.links?.taskCaptures ?? {}).flat(), exclusions: relation.link.excluded });
  if (snapshot.status === "refused") return baseRefusal(input, snapshot.reason, snapshot.remedy);
  return { status: "available", commits: snapshot.commits, actions: closeActions(input, snapshot.commits, fields.data.pause !== null), warnings: snapshot.warnings };
}
async function inventoryRefusal(store: Store): Promise<TaskRefusal | null> {
  const view = await readLifecycleView(store);
  if (view.status === "refused") return storeRefusal(view.refusal);
  try { requireCompleteInventory(store, view.result.listing); }
  catch (error) { return refuseTask(error instanceof Error ? error.message : String(error), "Repair the named lifecycle records, then retry the task verb.", "inventory-incomplete"); }
  return null;
}
async function projectIdentity(input: ComputeUnclosedTaskCommitsInput, store: Store): Promise<{ status: "ready"; id: string } | TaskRefusal> {
  try {
    const project = await resolveProjectIdentity(input.projectId ?? createProjectIdentityReader(store));
    return project.status === "ready" ? project : { status: "refused", code: project.refusal?.code ?? "project-identity-unavailable", reason: project.reason,
      remedy: project.remedy, ...(project.refusal === undefined ? {} : { refusal: project.refusal }) };
  } catch (error) { return refuseTask(`Project identity is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    "Repair the project identity port or project identity record, then retry listing commits.", "project-identity-unavailable"); }
}
function storeRefusal(refusal: StoreRefusal): TaskRefusal {
  return { status: "refused", code: refusal.code, reason: refusal.condition, remedy: refusal.remedy, refusal };
}
function projectRefusal(input: ComputeUnclosedTaskCommitsInput, refusal: TaskRefusal): UnclosedTaskCommits {
  return { ...refusal, actions: [{ text: refusal.remedy.text, checkout: input.cwd }] };
}
async function baseRefusal(input: ComputeUnclosedTaskCommitsInput, reason: string, text: string): Promise<UnclosedTaskCommits> {
  const remote = await input.exec("git", ["remote"], { cwd: input.cwd });
  const argv = remote.stdout.split(/\s+/u).includes("origin") ? ["git", "fetch", "origin", `+refs/heads/${input.baseBranch}:refs/remotes/origin/${input.baseBranch}`] : undefined;
  const remedy = { text, ...(argv === undefined ? {} : { argv }) };
  return { status: "refused", code: "base-unavailable", reason, remedy, actions: [{ ...remedy, checkout: input.cwd }] };
}
function closeActions(input: ComputeUnclosedTaskCommitsInput, commits: readonly DefaultCaptureCommit[], paused: boolean): SessionAction[] {
  const checkout = input.cwd;
  if (paused) return [{ text: `arc resume ${input.slug}, then arc task close`, argv: ["arc", "resume", input.slug], checkout }];
  const fresh = commits.every(commit => commit.copyKey !== undefined && commit.authorTime !== null && commit.committerTime !== null && commit.authorTime === commit.committerTime);
  return fresh ? [{ text: "arc task close", argv: ["arc", "task", "close"], checkout }]
    : [{ text: `In ${JSON.stringify(checkout)}, run arc task close if the open task's work is among these commits; otherwise run arc task close <id> to re-close the original task without closing a new task.`, checkout }];
}
