/** Conflict inspection for queue members whose entries may otherwise be offered for execution. */
import { ConflictRecordSchema } from "../store/conflict.js";
import type { StoreRecord } from "../store/read.js";
import type { InboxContext } from "./types.js";

/** Inspect entry-specific or document-wide conflicts without hiding an unavailable conflict record.
 * @param record - Queue or inbox record holding conflict references.
 * @param id - Member's entry identity.
 * @param context - Store reader.
 * @returns A reason to skip the member, or null for complete conflict-free evidence.
 */
export async function entryConflictReason(record: StoreRecord | null, id: string, context: InboxContext): Promise<string | null> {
  for (const reference of record?.conflicts ?? []) {
    const saved = await context.store.read({ reference });
    if (saved.status === "refused") return saved.refusal.condition;
    let candidate: unknown;
    try { candidate = JSON.parse(saved.result.content); } catch { return "The entry's conflict evidence is malformed."; }
    const conflict = ConflictRecordSchema.safeParse(candidate);
    if (!conflict.success) return "The entry's conflict evidence is malformed.";
    if (conflict.data.location.kind !== "entry" || conflict.data.location.id === id) return "The queued entry has an unresolved conflict.";
  }
  return null;
}
