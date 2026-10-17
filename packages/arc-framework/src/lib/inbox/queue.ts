/** Whole-request Errand queue ordering over list-qualified entry references. */
import { z } from "zod";
import { readQueueState, renderQueueSet } from "./queue-storage.js";
import { resolveEntryList } from "./lists.js";
import { rowsInList } from "./listing.js";
import { failure } from "./refusals.js";
import type { InboxRefusal, InboxOutcome } from "./types.js";
import type { InboxContext } from "./types.js";
/** One queue reference; identity is unique throughout the queue regardless of inbox. */
export const QueueReferenceSchema = z.strictObject({ inbox: z.enum(["personal", "project"]), id: z.string().regex(/^[0-9a-f]{8}$/u) });
/** Versioned JSON input to the whole-queue setter. */
export const ErrandQueueSetRequestSchema = z.strictObject({ schemaVersion: z.literal(1), members: z.array(QueueReferenceSchema) });
/** A displayed queue reference and its rank key. */
export const QueueMemberSchema = QueueReferenceSchema.extend({ title: z.string(), rank: z.string().min(1) });
/** Queue listing and setter share one complete result schema. */
export const ErrandQueueResultSchema = z.discriminatedUnion("state", [
  z.strictObject({ schemaVersion: z.literal(1), mode: z.literal("errand-queue"), state: z.enum(["listed", "set"]), members: z.array(QueueMemberSchema) }),
  z.strictObject({ schemaVersion: z.literal(1), mode: z.literal("errand-queue"), state: z.literal("refused"), code: z.string(), reason: z.string(), remedy: z.strictObject({ text: z.string() }) }),
]);
/** One displayed list-qualified queue member. */
export type QueueMember = z.infer<typeof QueueMemberSchema>;
/** Public queue result. */
export type ErrandQueueResult = z.infer<typeof ErrandQueueResultSchema>;
/** Replace the queue whole, retaining every rank that can stay in place.
 * @param request - Versioned members request.
 * @param context - Person's store, identity and clock.
 * @returns Set result or refusal without a partial queue write.
 */
export async function setErrandQueue(request: unknown, context: InboxContext): Promise<ErrandQueueResult> {
  if (!context.store.capabilities.stateOffBranch) return unavailable();
  const parsed = ErrandQueueSetRequestSchema.safeParse(request);
  if (!parsed.success) return refused({ code: "invalid-input", condition: parsed.error.message, remedy: { text: "Supply schemaVersion: 1 and the whole members array, each with inbox and id." } });
  const duplicate = duplicateMember(parsed.data.members);
  if (duplicate !== null) return refused(duplicate);
  const state = await readQueueState(context, "replace");
  if (state.status === "refused") return refused(state.refusal);
  const titles = await referenceTitles(context);
  if (titles.status === "refused") return refused(titles.refusal);
  const rendered = renderQueueSet(state.result, parsed.data.members, titles.result);
  const written = await context.store.write({ action: "put", reference: state.result.reference, content: rendered.content,
    expected: state.result.saved?.version ?? null, provenance: { verb: "errand-queue-set", lifecycleAction: "set" } });
  if (written.status === "refused") return refused(written.refusal);
  return { schemaVersion: 1, mode: "errand-queue", state: "set", members: rendered.members.map(publicMember) };
}
/** List the queue in rank order without changing its document.
 * @param context - Identity-bound store.
 * @returns Complete queue or refusal.
 */
export async function listErrandQueue(context: InboxContext): Promise<ErrandQueueResult> {
  if (!context.store.capabilities.stateOffBranch) return unavailable();
  const state = await readQueueState(context);
  return state.status === "refused" ? refused(state.refusal) : { schemaVersion: 1, mode: "errand-queue", state: "listed", members: state.result.members.map(publicMember) };
}

async function referenceTitles(context: InboxContext): Promise<InboxOutcome<Map<string, string>>> {
  const titles = new Map<string, string>();
  for (const selector of ["personal", "project"]) {
    const list = await resolveEntryList(selector, context);
    if (list.status === "refused") return list;
    const rows = rowsInList(list.result);
    if (rows.status === "refused") return rows;
    for (const row of rows.result) titles.set(`${selector}:${row.id}`, row.title);
  }
  return { status: "ok", result: titles };
}

function duplicateMember(members: readonly { inbox: string; id: string }[]): InboxRefusal | null {
  const seen = new Map<string, string>();
  for (const member of members) {
    const previous = seen.get(member.id);
    if (previous !== undefined) return failure("id-clash", `Queue references ${previous}:${member.id} and ${member.inbox}:${member.id} share one ID.`, `Choose only one of ${previous}:${member.id} and ${member.inbox}:${member.id}; queue members merge by ID.`).refusal;
    seen.set(member.id, member.inbox);
  }
  return null;
}
function unavailable(): ErrandQueueResult { return refused({ code: "unsupported", condition: "The queue requires stateOffBranch capability.", remedy: { text: "Use arc user inbox-mark-execute-bound until the capability flips." } }); }
function refused(refusal: InboxRefusal): ErrandQueueResult { return { schemaVersion: 1, mode: "errand-queue", state: "refused", code: refusal.code, reason: refusal.condition, remedy: refusal.remedy }; }

function publicMember(member: QueueMember): QueueMember { return { id: member.id, inbox: member.inbox, title: member.title, rank: member.rank }; }
