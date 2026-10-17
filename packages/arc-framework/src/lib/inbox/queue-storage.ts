/** Exact queue-record reads and minimal byte-preserving whole-queue writes. */
import { OwnerIdentitySchema, recordReferences, type RecordReference } from "../store/identity.js";
import { generateRankBetween } from "../store/concurrency/rank.js";
import { parseEntryList } from "../store/kinds/entry-list.js";
import { writeEntryFields } from "../store/kinds/entry-fields.js";
import { rejoinEntryList, splitEntryList, type ListEntry, type OutsideEntry } from "../store/concurrency/entries.js";
import { ENTRY_CONFIGS } from "../store/kinds/entry-configs.js";
import type { StoreRecord } from "../store/read.js";
import { appendEntry } from "./entry-text.js";
import { failure, withProvenance } from "./refusals.js";
import { queueRankAssignments, type QueueReference } from "./queue-ranks.js";
import type { InboxContext, InboxOutcome } from "./types.js";
import type { QueueMember } from "./queue.js";

/** A queue member's original raw bytes are reused unless its reference/rank changes. */
export interface StoredQueueMember extends QueueMember { raw: string }
/** Queue document and all exact mutation evidence. */
export interface QueueState { reference: RecordReference; saved: StoreRecord | null; members: StoredQueueMember[] }
/** Read and validate every member, including its list qualifier and fractional rank.
 * @param context - Store bound to the person whose queue is read.
 * @param mode - Whole-queue replacement may discard malformed members at the observed version.
 * @returns Complete rank-ordered queue or refusal.
 */
export async function readQueueState(context: InboxContext, mode: "list" | "replace" = "list"): Promise<InboxOutcome<QueueState>> {
  const owner = OwnerIdentitySchema.safeParse({ type: "person", name: context.identity });
  if (!owner.success) return failure("identity-missing", "The queue requires an ARC identity.", "Configure your ARC identity, then retry.");
  const reference = recordReferences["personal/errand-queue"](owner.data);
  const read = await context.store.read({ reference });
  if (read.status === "refused") return read.refusal.code === "not-found" ? { status: "ok", result: { reference, saved: null, members: [] } } : { status: "refused", refusal: withProvenance(read.refusal) };
  const members = parseQueueMembers(read.result.content);
  if (members.status === "refused" && mode === "list") return members;
  return { status: "ok", result: { reference: read.result.reference, saved: read.result, members: members.status === "ok" ? members.result : [] } };
}

function parseQueueMembers(content: string): InboxOutcome<StoredQueueMember[]> {
  const parsed = parseEntryList(content, "personal/errand-queue");
  if (!parsed.success) return failure("record-malformed", parsed.error, "Repair the queue through arc errand queue set.");
  const members: StoredQueueMember[] = [];
  for (const entry of parsed.data.entries) {
    const { Inbox: inbox, Rank: rank } = entry.fields;
    if (entry.id === undefined || (inbox !== "personal" && inbox !== "project") || rank === undefined || !validRank(rank) || members.some((member) => member.id === entry.id)) {
      return failure("record-malformed", `Malformed or duplicate queue reference ${entry.title}.`, "Use arc errand queue set with unique IDs, each qualified by personal or project.");
    }
    members.push({ id: entry.id, inbox, title: entry.title, rank, raw: entry.bytes });
  }
  return { status: "ok", result: members.sort(compareQueueMembers) };
}

/** Reassign minimal ranks and render the requested set while retaining unmodified entry bytes.
 * @param state - Existing queue at its observed record version.
 * @param desired - Requested whole-queue order.
 * @param titles - Current reference titles, keyed by qualified inbox ID.
 * @returns New document text and its rank-ordered member result.
 */
export function renderQueueSet(state: QueueState, desired: readonly QueueReference[], titles: ReadonlyMap<string, string>): { content: string; members: StoredQueueMember[] } {
  const assignments = new Map(queueRankAssignments(state.members, desired).map((assignment) => [assignment.uid, assignment.rank]));
  const previous = new Map(state.members.map((member) => [member.id, member]));
  const members = desired.map((reference) => {
    const prior = previous.get(reference.id);
    const rank = assignments.get(reference.id) ?? prior?.rank;
    if (rank === undefined) throw new Error("Queue rank assignment omitted a new member");
    if (prior !== undefined && prior.inbox === reference.inbox && prior.rank === rank) return prior;
    const title = titles.get(`${reference.inbox}:${reference.id}`) ?? prior?.title ?? reference.id;
    const raw = writeEntryFields(prior?.raw.replace(/^###.*$/mu, () => `### **${title}**`) ?? `### **${title}**`, { Id: reference.id, Inbox: reference.inbox, Rank: rank });
    return { ...reference, rank, title, raw };
  });
  const byId = new Map(members.map((member) => [member.id, member]));
  const split = splitEntryList(state.saved?.content ?? "", ENTRY_CONFIGS["personal/errand-queue"]);
  let content = rejoinEntryList({ parts: split.parts.flatMap<ListEntry | OutsideEntry>((part) => {
    if (part.kind !== "entry") return [part];
    const selected = part.id === undefined || !previous.has(part.id) ? undefined : byId.get(part.id);
    return selected === undefined ? [] : [{ ...part, bytes: selected.raw }];
  }) });
  for (const member of members) if (!previous.has(member.id)) content = appendEntry(content, "Queue", member.raw);
  return { content, members: members.sort(compareQueueMembers) };
}

function validRank(rank: string): boolean { try { generateRankBetween(rank, null); return true; } catch { return false; } }
function compareQueueMembers(a: QueueMember, b: QueueMember): number {
  return a.rank === b.rank ? a.id < b.id ? -1 : a.id === b.id ? 0 : 1 : a.rank < b.rank ? -1 : 1;
}
