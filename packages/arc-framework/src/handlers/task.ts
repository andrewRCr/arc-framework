/** Command inputs and checkout context for the task close and defer verbs. */
import { z } from "zod";
import * as p from "../lib/terminal.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { ParentTaskIdSchema } from "../lib/task-list/scanner.js";
import { usesOffBranchState } from "../lib/store/lifecycle-write.js";
import { resolveCurrentWorkUnit } from "../lib/store/current-work-unit.js";
import { resolveVerbBase, buildExecutor, parseLifecycleCommand, refuse, type VerbBase } from "./lifecycle-shared.js";
import { runTaskClose, runTaskDefer, type TaskVerbContext, type TaskCloseResult } from "../lib/work-unit/verbs/task-close.js";

/** Registered task close input; commit is repeatable independently of task IDs. */
export const TaskCloseCommandInputSchema = z.strictObject({ ids: z.array(ParentTaskIdSchema).default([]), commit: z.array(z.string().min(1)).default([]) });
/** Registered deferral input takes one task identifier. */
export const TaskDeferCommandInputSchema = z.strictObject({ id: ParentTaskIdSchema });
/** Input registrations collected by the lifecycle group. */
export const taskCommandInputRegistrations = [
  { commandPath: "task close", schema: TaskCloseCommandInputSchema, schemaFields: { "operand.ids": "ids", "option.commit": "commit" } },
  { commandPath: "task defer", schema: TaskDeferCommandInputSchema, schemaFields: { "operand.id": "id" } },
] as const;

/** Bind the current work-unit identity and preserve the executor's operational store.
 * @param base - Resolved checkout, identity, and I/O
 * @returns Task verb context or absence after reporting a current-work-unit refusal
 */
export async function createTaskCommandContext(base: VerbBase): Promise<TaskVerbContext | null> {
  const { executor, settings } = await buildExecutor(base);
  const common = { store: executor.store, projectId: executor.projectId, cwd: base.cwd, exec: base.io.exec, baseBranch: settings["branch.base"] };
  if (!usesOffBranchState(executor.store)) return { ...common, slug: "" };
  const current = await resolveCurrentWorkUnit({ cwd: base.cwd, store: executor.store });
  if (current.status !== "resolved") { refuse(`Task commands require one current work unit (${current.status}). Run session-init to select it.`); return null; }
  return { ...common, slug: current.candidate.reference.owner.name };
}

/** Close the current checkout's tasks and render their capture outcome.
 * @param ids - Named tasks, or the cursor leaf
 * @param opts - Repeatable commit choices
 * @param interaction - Invocation-owned interaction policy
 * @returns Nothing
 */
export async function handleTaskClose(ids: string[], opts: { commit?: string[] }, interaction?: InteractionContext): Promise<void> {
  const input = parseLifecycleCommand(TaskCloseCommandInputSchema, { ids, ...opts }, ["task", "close"]);
  if (input === null) return;
  const base = await resolveVerbBase(interaction); if (base === null) return;
  const ctx = await createTaskCommandContext(base); if (ctx === null) return;
  renderTaskClose(await runTaskClose(ctx, { ids: input.ids, commits: input.commit }));
}

/** Defer one open task in the current checkout.
 * @param id - Exact task identifier
 * @param interaction - Invocation-owned interaction policy
 * @returns Nothing
 */
export async function handleTaskDefer(id: string, interaction?: InteractionContext): Promise<void> {
  const input = parseLifecycleCommand(TaskDeferCommandInputSchema, { id }, ["task", "defer"]);
  if (input === null) return;
  const base = await resolveVerbBase(interaction); if (base === null) return;
  const ctx = await createTaskCommandContext(base); if (ctx === null) return;
  renderTaskDefer(await runTaskDefer(ctx, input.id));
}

/** Render a task deferral outcome with the same recovery boundary as a close.
 * @param result - Deferred or refused task outcome
 * @returns Nothing
 */
export function renderTaskDefer(result: Awaited<ReturnType<typeof runTaskDefer>>): void {
  if (result.status === "refused") { refuse(result.reason, result.refusal, result.remedy); return; }
  p.log.success(`Deferred ${result.ids.join(", ")}.`);
}

/** Render a task close outcome, including every attribution and repair.
 * @param result - Closed or refused task outcome
 * @returns Nothing
 */
export function renderTaskClose(result: TaskCloseResult): void {
  if (result.status === "refused") { refuse(result.reason, result.refusal, result.remedy); return; }
  p.log.success(`${result.changed ? "Closed" : "Unchanged"} ${result.ids.join(", ")}.`);
  for (const warning of result.warnings) p.log.warn(warning);
  for (const item of result.attributions) p.log.info(`${item.sha} matches ${item.matched}; attributed to ${item.task ?? "the exclusions"}.`);
  if (result.uncapturedTasks.length > 0) p.log.info(`Tasks ${result.uncapturedTasks.join(", ")} received no commits. Add their work with arc task close ${result.uncapturedTasks.join(" ")} ${result.captured.map((sha) => `--commit ${sha}`).join(" ")}.`);
}
