/** Queue offers are read-only selections with separate left-out and conflict reports. */
import { z } from "zod";
import { readQueueState } from "./queue-storage.js";
import { resolveEntryList } from "./lists.js";
import { rowsInList } from "./listing.js";
import { listCoordinate } from "./receipts.js";
import { openErrandHolding } from "./errand-home.js";
import { entryConflictReason } from "./conflicts.js";
import type { StoreRecord } from "../store/read.js";
import type { QueueReference } from "./queue-ranks.js";
import type { InboxContext, InboxOutcome } from "./types.js";
/** One queue member which cannot currently start. */
export const QueueOfferProblemSchema = z.strictObject({ inbox: z.enum(["personal", "project"]), id: z.string(), reason: z.string(), remedy: z.strictObject({ text: z.string() }) });
/** A typed queue problem shared by startup and close contracts. */
export type QueueOfferProblem = z.infer<typeof QueueOfferProblemSchema>;
/** Selected entry and every member rejected before it. */
export interface QueueExecutionOffer {
  nextOffer: { kind: "errand"; key: string; parentCheckoutPath: string | null } | null;
  leftOut: QueueOfferProblem[];
  skipped: QueueOfferProblem[];
}
/** Find the first queue member a start would accept, without changing queue state.
 * @param context - Store and identity.
 * @param parentCheckoutPath - Warm parent checkout for a continuation.
 * @returns First offer and individual reports, or unreadable queue evidence.
 */
export async function resolveQueueExecutionOffer(context: InboxContext, parentCheckoutPath: string | null = null): Promise<InboxOutcome<QueueExecutionOffer>> {
  const queue = await readQueueState(context);
  if (queue.status === "refused") return queue;
  const result: QueueExecutionOffer = { nextOffer: null, leftOut: [], skipped: [] };
  for (const member of queue.result.members) {
    const inspected = await inspectMember(member, queue.result.saved, context);
    if (inspected.kind === "ready") {
      result.nextOffer = { kind: "errand", key: `${member.inbox}:${member.id}`, parentCheckoutPath };
      break;
    }
    result[inspected.kind === "skipped" ? "skipped" : "leftOut"].push({ inbox: member.inbox, id: member.id, reason: inspected.reason, remedy: { text: "Repair or reorder this member with arc errand queue set." } });
  }
  return { status: "ok", result };
}

type MemberInspection = { kind: "ready" } | { kind: "skipped" | "left-out"; reason: string };
async function inspectMember(member: QueueReference, queue: StoreRecord | null, context: InboxContext): Promise<MemberInspection> {
  const queueConflict = await entryConflictReason(queue, member.id, context);
  if (queueConflict !== null) return { kind: "skipped", reason: queueConflict };
  const source = await resolveEntryList(member.inbox, context);
  if (source.status === "refused") return { kind: "left-out", reason: source.refusal.condition };
  const conflict = await entryConflictReason(source.result.saved, member.id, context);
  if (conflict !== null) return { kind: "skipped", reason: conflict };
  const rows = rowsInList(source.result);
  if (rows.status === "refused") return { kind: "left-out", reason: rows.refusal.condition };
  const home = await openErrandHolding(member.id, listCoordinate(source.result), context);
  if (home.status === "refused") return { kind: "left-out", reason: home.refusal.condition };
  if (home.result.held !== null) return { kind: "left-out", reason: `Open Errand ${home.result.held.slug} holds this entry; resume it in its checkout.` };
  return rows.result.some((row) => row.id === member.id) ? { kind: "ready" } : { kind: "left-out", reason: "The queued entry is gone from its inbox; inspect arc inbox before starting it." };
}
