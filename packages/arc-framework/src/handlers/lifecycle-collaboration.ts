/** Command bindings for store-backed pause, resume, and ownership changes. */
import { z } from "zod";
import * as p from "../lib/terminal.js";
import { SlugSchema } from "../lib/kernel/index.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { resolveCurrentWorkUnit } from "../lib/store/current-work-unit.js";
import { runPause, runResumePaused, runHandover, type PauseHandoverContext, type CollaborationRejection } from "../lib/work-unit/verbs/pause-handover.js";
import type { UnsharedWorkResult } from "../lib/work-unit/verbs/unshared-work.js";
import { resolveVerbBase, buildExecutor, parseLifecycleCommand, refuse, type VerbBase } from "./lifecycle-shared.js";

/** Pause updates distinguish omitted fields from explicit clearing flags. */
export const PauseCommandInputSchema = z.strictObject({
  slug: SlugSchema.optional(), reason: z.string().min(1).optional(),
  waitsOn: z.union([SlugSchema, z.literal(false)]).optional(), waitsOnNote: z.string().min(1).optional(),
  resumeNotes: z.union([z.string().min(1), z.literal(false)]).optional(), open: z.boolean().optional(),
}).refine((value) => value.waitsOn === undefined || value.waitsOnNote === undefined, { message: "Choose only one waits-on form." });
/** Handover requires the receiving identity. */
export const HandoverCommandInputSchema = z.strictObject({ slug: SlugSchema.optional(), to: SlugSchema });
/** Command-owned registrations for the CLI inventory. */
export const collaborationCommandInputRegistrations = [
  { commandPath: "pause", schema: PauseCommandInputSchema, schemaFields: {
    "operand.slug": "slug", "option.reason": "reason", "option.waits-on": "waitsOn", "option.waits-on-note": "waitsOnNote", "option.no-waits-on": "waitsOn",
    "option.resume-notes": "resumeNotes", "option.no-resume-notes": "resumeNotes", "option.open": "open", "option.no-open": "open",
  } },
  { commandPath: "handover", schema: HandoverCommandInputSchema, schemaFields: { "operand.slug": "slug", "option.to": "to" } },
] as const;
/** Public pause options preserve Commander clearing values. */
export type PauseCommandOptions = Omit<z.input<typeof PauseCommandInputSchema>, "slug">;
type BoundExecutor = Awaited<ReturnType<typeof buildExecutor>>["executor"];

function collaborationContext(base: VerbBase, executor: BoundExecutor, baseBranch: string): PauseHandoverContext & { identity: string } {
  return { cwd: base.cwd, identity: base.identity, store: executor.store, exec: base.io.exec, baseBranch,
    locusPorts: executor.locusPorts, projectId: executor.projectId };
}
async function target(base: VerbBase, executor: BoundExecutor, slug?: string): Promise<string | null> {
  if (slug !== undefined) return slug;
  const current = await resolveCurrentWorkUnit({ cwd: base.cwd, store: executor.store });
  if (current.status === "resolved") return current.candidate.reference.owner.name;
  refuse(`Supply a work-unit slug; this checkout's current work unit is ${current.status}.`); return null;
}
function rejected(result: CollaborationRejection): void {
  if (result.refusal !== undefined) { refuse(result.reason, result.refusal); return; }
  const remedy = result.remedy;
  refuse(`${result.code === undefined ? "" : `${result.code}: `}${result.reason}${remedy === undefined ? "" : `\n${remedy.text}${remedy.argv === undefined ? "" : `\n${remedy.argv.join(" ")}`}`}`);
}
function reportSharing(report: UnsharedWorkResult): void {
  if (report.kind === "unobservable") { p.log.warn(`Unshared work could not be observed: ${report.detail}`); return; }
  for (const warning of report.warnings) p.log.warn(warning);
  if (report.changedPaths.length > 0) p.log.warn(`Uncommitted changes: ${report.changedPaths.join(", ")}`);
  if (report.heldOnlyCommits.length > 0) p.log.info(`Held only in this clone: ${report.heldOnlyCommits.join(", ")}`);
  if (report.unsharedCommits.length > 0) p.log.warn(`Unshared commits: ${report.unsharedCommits.join(", ")}. Run git push -u origin ${report.branch ?? "<branch>"}.`);
}
/** Pause the named or current work unit and report sharing observations.
 * @param slug - Optional explicit work-unit slug.
 * @param opts - Pause fields and clearing flags.
 * @param interaction - Invocation-owned interaction policy.
 * @returns Nothing.
 */
export async function handlePause(slug: string | undefined, opts: PauseCommandOptions, interaction?: InteractionContext): Promise<void> {
  const input = parseLifecycleCommand(PauseCommandInputSchema, { slug, ...opts }, ["pause"]); if (input === null) return;
  const base = await resolveVerbBase(interaction); if (base === null) return;
  const { executor, settings } = await buildExecutor(base);
  const name = await target(base, executor, input.slug); if (name === null) return;
  const result = await runPause(collaborationContext(base, executor, settings["branch.base"]), { ...input, name, identity: base.identity });
  if (result.status === "rejected") { rejected(result); return; }
  p.log.success(`Paused ${result.name}.`); reportSharing(result.report);
}
/** Hand over the named or current work unit after checking sharing evidence.
 * @param slug - Optional explicit work-unit slug.
 * @param opts - Receiving identity.
 * @param interaction - Invocation-owned interaction policy.
 * @returns Nothing.
 */
export async function handleHandover(slug: string | undefined, opts: { to?: string }, interaction?: InteractionContext): Promise<void> {
  const input = parseLifecycleCommand(HandoverCommandInputSchema, { slug, ...opts }, ["handover"]); if (input === null) return;
  const base = await resolveVerbBase(interaction); if (base === null) return;
  const { executor, settings } = await buildExecutor(base);
  const name = await target(base, executor, input.slug); if (name === null) return;
  const result = await runHandover(collaborationContext(base, executor, settings["branch.base"]), { name, to: input.to });
  if (result.status === "rejected") { rejected(result); return; }
  p.log.success(`Handed ${result.name} from ${result.previousOwner} to ${result.owner}.`); reportSharing(result.report);
}
/** Route the off-branch resume arm before parked-state expansion.
 * @param base - Already resolved invocation context.
 * @param executor - Same bound operational store used by the handler.
 * @param baseBranch - Configured base branch.
 * @param slug - Optional explicit work-unit slug.
 * @param opts - Legacy here flag, rejected with a materialize continuation.
 * @returns Nothing.
 */
export async function handleStoreResume(base: VerbBase, executor: BoundExecutor, baseBranch: string, slug?: string, opts: { here?: boolean } = {}): Promise<void> {
  const name = await target(base, executor, slug); if (name === null) return;
  const result = await runResumePaused(collaborationContext(base, executor, baseBranch), { name, ...opts });
  if (result.status === "rejected") { rejected(result); return; }
  p.log.success(`Resumed ${result.name}.`);
}
