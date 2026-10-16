/** Verb-owned pause, resume, and ownership changes over the operational store. */
import { pauseProseProblem } from "../../store/kinds/meta/pause-section.js";
import { SlugSchema } from "../../kernel/index.js";
import { MetaPauseSchema, type MetaPause } from "../../active/meta-schema.js";
import { readWorkUnit, readLifecycleMetaFields, recordPut, batchLifecycleWrites, usesOffBranchState } from "../../store/lifecycle-write.js";
import { writeMetaPause, writeMetaOwner } from "../../store/kinds/meta/writers.js";
import { readUnsharedWork } from "./unshared-work.js";
import type { Store } from "../../store/contract.js";
import type { StoreRefusal, Remedy } from "../../store/refusal.js";
import type { UnsharedWorkContext, UnsharedWorkResult } from "./unshared-work.js";
/** Pause and handover invocation boundaries. */
export interface PauseHandoverContext extends UnsharedWorkContext { store?: Store; now?: () => Date; projectId?: () => Promise<string> }
/** Only explicitly supplied fields change on a repeated pause. */
export interface PauseParams {
  name: string; identity: string; reason?: string; waitsOn?: string | false; waitsOnNote?: string;
  resumeNotes?: string | false; open?: boolean;
}
/** Shared actionable rejections, including pre-flip unsupported verbs. */
export type CollaborationRejection = { status: "rejected"; reason: string; code?: "unsupported"; refusal?: StoreRefusal; remedy?: Remedy };
/** Pause and ownership reports keep unavailable sharing evidence explicit. */
export type PauseResult = { status: "paused"; name: string; report: UnsharedWorkResult } | CollaborationRejection;
export type ResumePausedResult = { status: "resumed"; name: string } | CollaborationRejection;
export type HandoverResult = { status: "handed-over"; name: string; previousOwner: string; owner: string; report: UnsharedWorkResult } | CollaborationRejection;
/** Pause a work unit or amend only explicitly supplied fields.
 * @param ctx - Store, identity clock, locus, and Git boundaries.
 * @param params - Work unit and requested section fields.
 * @returns Pause report or actionable refusal.
 */
export async function runPause(ctx: PauseHandoverContext, params: PauseParams): Promise<PauseResult> {
  if (ctx.store === undefined || !usesOffBranchState(ctx.store)) return { status: "rejected", code: "unsupported",
    reason: `arc pause is unsupported before the storage flip; use arc park ${params.name} --reason <text>.` };
  const read = await readWorkUnit(ctx.store, params.name);
  if (read.status === "refused") return { status: "rejected", reason: read.refusal.condition, refusal: read.refusal };
  const record = read.result, parsed = readLifecycleMetaFields(record);
  if (parsed.status === "refused") return { status: "rejected", reason: parsed.refusal.condition, refusal: parsed.refusal, remedy: parsed.refusal.remedy };
  const fields = parsed.result;
  if (record.placement?.kind === "backlog") return { status: "rejected", reason: `A stub is not in flight; use arc start ${params.name} before pausing it.`,
    remedy: { text: "Start the stub before pausing.", argv: ["arc", "start", params.name] } };
  if (record.placement?.kind !== "active" || (fields.state !== "Planning" && fields.state !== "Active")) {
    return { status: "rejected", reason: "Only Planning or Active work units can be paused." };
  }
  const prepared = preparePause(fields.pause, params, ctx.now?.() ?? new Date());
  if (prepared.status === "rejected") return prepared;
  const result = await batchLifecycleWrites(ctx.store, [recordPut(record, { content: writeMetaPause(record.content, prepared.pause) })],
    { verb: "pause", lifecycleAction: fields.pause === null ? "pause" : "update-pause" });
  if (result.status === "refused") return { status: "rejected", reason: result.refusal.condition, refusal: result.refusal };
  const report = await sharingReport(ctx, record);
  return { status: "paused", name: record.reference.owner.name, report };
}

function preparePause(prior: unknown, params: PauseParams, now: Date): { status: "ready"; pause: MetaPause } | CollaborationRejection {
  if (params.waitsOn !== undefined && params.waitsOnNote !== undefined) return { status: "rejected", reason: "Choose only one waits-on form." };
  if (prior === null && (params.reason === undefined || params.reason.trim() === "")) return { status: "rejected", reason: "A first pause requires --reason <text>." };
  if (params.reason !== undefined && params.reason.trim() === "") return { status: "rejected", reason: "Pause reason must not be empty." };
  const old = prior === null ? null : MetaPauseSchema.safeParse(prior);
  if (old !== null && !old.success) return { status: "rejected", reason: `The prior pause has malformed values; use arc resume ${params.name}, then pause again.` };
  const previous = old?.success ? old.data : null;
  const waitsOn = requestedWait(params, previous?.waitsOn ?? null);
  const pause = MetaPauseSchema.safeParse({ pausedBy: previous?.pausedBy ?? params.identity,
    since: previous?.since ?? now.toISOString(), reason: params.reason ?? previous?.reason,
    waitsOn, resumeNotes: params.resumeNotes === false ? null : params.resumeNotes ?? previous?.resumeNotes ?? null,
    open: params.open ?? previous?.open ?? false });
  if (!pause.success) return { status: "rejected", reason: `Invalid pause fields: ${pause.error.message}` };
  const problem = pauseProseProblem(pause.data);
  return problem === null ? { status: "ready", pause: pause.data } : { status: "rejected", reason: problem };
}
function requestedWait(params: PauseParams, previous: MetaPause["waitsOn"]): MetaPause["waitsOn"] | { kind: "work-unit"; slug: string } {
  if (params.waitsOn === false) return null;
  if (params.waitsOn !== undefined) return { kind: "work-unit", slug: params.waitsOn };
  return params.waitsOnNote === undefined ? previous : { kind: "note", text: params.waitsOnNote };
}

/** Clear the whole pause without moving state, placement, or checkout.
 * @param ctx - Store invocation context.
 * @param params - Selected work unit and optional legacy here flag.
 * @returns Resumption or the materialize continuation.
 */
export async function runResumePaused(ctx: PauseHandoverContext, params: { name: string; here?: boolean }): Promise<ResumePausedResult> {
  if (ctx.store === undefined || !usesOffBranchState(ctx.store)) return { status: "rejected", code: "unsupported", reason: "Use the existing parked-work-unit arc resume path before the storage flip." };
  if (params.here) return { status: "rejected", reason: `arc resume --here is unsupported; use arc materialize ${params.name} --here.`,
    remedy: { text: "Materialize the work unit into this checkout.", argv: ["arc", "materialize", params.name, "--here"] } };
  const read = await readWorkUnit(ctx.store, params.name);
  if (read.status === "refused") return { status: "rejected", reason: read.refusal.condition, refusal: read.refusal };
  const record = read.result;
  const result = await batchLifecycleWrites(ctx.store, [recordPut(record, { content: writeMetaPause(record.content, null) })],
    { verb: "resume", lifecycleAction: "clear-pause" });
  return result.status === "refused" ? { status: "rejected", reason: result.refusal.condition, refusal: result.refusal }
    : { status: "resumed", name: record.reference.owner.name };
}

/** Write Owner alone after proving this clone has no inaccessible work.
 * @param ctx - Store, invoking identity, and sharing observations.
 * @param params - Work unit and new identity slug.
 * @returns Ownership change or exact missing sharing evidence.
 */
export async function runHandover(ctx: PauseHandoverContext & { identity: string }, params: { name: string; to: string }): Promise<HandoverResult> {
  if (ctx.store === undefined || !usesOffBranchState(ctx.store)) return { status: "rejected", code: "unsupported", reason: "arc handover is unsupported before the storage flip; edit Owner in the work unit's meta." };
  const identity = SlugSchema.safeParse(ctx.identity);
  if (!identity.success) return { status: "rejected", reason: "Handover requires a configured ARC identity; configure your identity and retry." };
  const owner = SlugSchema.safeParse(params.to);
  if (!owner.success) return { status: "rejected", reason: "--to requires an identity slug." };
  const read = await readWorkUnit(ctx.store, params.name);
  if (read.status === "refused") return { status: "rejected", reason: read.refusal.condition, refusal: read.refusal };
  const record = read.result, parsed = readLifecycleMetaFields(record);
  if (parsed.status === "refused") return { status: "rejected", reason: parsed.refusal.condition, refusal: parsed.refusal, remedy: parsed.refusal.remedy };
  const previousOwner = parsed.result.owner ?? "";
  if (previousOwner !== identity.data) return { status: "rejected", reason: previousOwner === ""
    ? `Work unit ${params.name} has no recorded Owner; resolve its ownership before retrying handover.`
    : `Only Owner ${previousOwner} can hand over ${params.name}; ask them to run arc handover ${params.name} --to ${owner.data}.` };
  const report = await sharingReport(ctx, record);
  const blocked = handoverSharingRefusal(report);
  if (blocked !== null) return blocked;
  const written = await batchLifecycleWrites(ctx.store, [recordPut(record, { content: writeMetaOwner(record.content, owner.data) })],
    { verb: "handover", lifecycleAction: "change-owner" });
  return written.status === "refused" ? { status: "rejected", reason: written.refusal.condition, refusal: written.refusal }
    : { status: "handed-over", name: record.reference.owner.name, previousOwner, owner: owner.data, report };
}
async function sharingReport(ctx: PauseHandoverContext, record: Parameters<typeof readUnsharedWork>[1]): Promise<UnsharedWorkResult> {
  try { return await readUnsharedWork({ ...ctx, ...(ctx.projectId === undefined ? {} : { repository: await ctx.projectId() }) }, record); }
  catch (error) { return { kind: "unobservable", detail: error instanceof Error ? error.message : String(error) }; }
}
function handoverSharingRefusal(report: UnsharedWorkResult): CollaborationRejection | null {
  if (report.kind === "unobservable") return { status: "rejected", reason: `Cannot observe unshared work: ${report.detail}; repair the observation and retry handover.` };
  if (report.origin === "unreachable") return { status: "rejected", reason: "origin was not refreshed; retry handover once origin is reachable." };
  if (report.changedPaths.length > 0) return { status: "rejected", reason: `Commit or discard uncommitted changes before handover: ${report.changedPaths.join(", ")}.` };
  if (report.unsharedCommits.length > 0) return { status: "rejected", reason: `Unshared commits ${report.unsharedCommits.join(", ")}; run git push -u origin ${report.branch ?? "<branch>"} before handover.`,
    remedy: { text: "Publish the work branch, then retry handover.", argv: ["git", "push", "-u", "origin", report.branch ?? "<branch>"] } };
  return null;
}
