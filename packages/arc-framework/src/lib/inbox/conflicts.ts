/** Conflict authority for selected entries and whole-document decisions. */
import { ConflictRecordSchema } from "../store/conflict.js";
import type { StoreRecord } from "../store/read.js";
import type { InboxContext, InboxOutcome } from "./types.js";
import { familyOf } from "../store/catalog.js";
import { KindIdSchema, sameReference, type RecordReference } from "../store/identity.js";
import type { ResolvedEntryList } from "./lists.js";

/** Inspect entry-specific or document-wide conflicts without hiding an unavailable conflict record.
 * @param record - Queue or inbox record holding conflict references.
 * @param id - Selected entry identity; undefined requires the whole document to be settled.
 * @param context - Store reader.
 * @param reference - Exact list coordinate used to inspect conflicts when its subject is absent.
 * @returns A reason to skip the member, or null for complete conflict-free evidence.
 */
export async function entryConflictReason(record: StoreRecord | null, id: string | undefined, context: InboxContext, reference?: RecordReference): Promise<string | null> {
  if (record === null && reference !== undefined) return absentConflictReason(reference, id, context);
  const reasons: string[] = [];
  for (const reference of record?.conflicts ?? []) {
    const named = JSON.stringify(reference);
    const saved = await context.store.read({ reference });
    if (saved.status === "refused") { reasons.push(`Conflict evidence ${named} is unavailable: ${saved.refusal.condition} ${saved.refusal.remedy.text}`); continue; }
    const reason = savedConflictReason(saved.result, id);
    if (reason !== null) reasons.push(reason);
  }
  return reasons.length === 0 ? null : reasons.join(" ");
}
/** Refuse a dependent entry decision while retaining exact conflict references and a repair route. */
export async function entryConflictRefusal(list: Pick<ResolvedEntryList, "reference" | "saved"> | null, id: string | undefined, context: InboxContext): Promise<Extract<InboxOutcome<never>, { status: "refused" }> | null> {
  if (list === null) return null;
  const reason = await entryConflictReason(list.saved, id, context, list.reference);
  return reason === null ? null : { status: "refused", refusal: { code: "entry-conflicted", condition: reason,
    remedy: { text: "Resolve the named conflicts or repair their evidence as described in the condition, then retry this entry command." } } };
}
async function absentConflictReason(reference: RecordReference, id: string | undefined, context: InboxContext): Promise<string | null> {
  const family = familyOf(reference.kind);
  const listed = await context.store.list({ family, kind: KindIdSchema.parse(`${family}/conflict-record`),
    ...(reference.kind === "project-inbox/inbox" && reference.owner.type !== "person" && reference.owner.uid === undefined ? {} : { owner: reference.owner }) });
  if (listed.status === "refused") return `${listed.refusal.condition} ${listed.refusal.remedy.text}`;
  if (listed.result.status === "absent") return null;
  if (listed.result.status === "unreadable") return `${listed.result.condition} ${listed.result.remedy.text}`;
  if (listed.result.missed || listed.result.diagnostics.length > 0) return `Conflict listing for ${JSON.stringify(reference)} is incomplete. ${listed.result.diagnostics.map((diagnostic) => `${diagnostic.key}: ${diagnostic.condition} ${diagnostic.remedy.text}`).join(" ")} Repair the listing, then retry.`;
  const reasons = listed.result.records.flatMap((saved) => {
    const reason = savedConflictReason(saved, id, reference);
    return reason === null ? [] : [reason];
  });
  return reasons.length === 0 ? null : reasons.join(" ");
}
function savedConflictReason(saved: StoreRecord, id: string | undefined, subject?: RecordReference): string | null {
  const named = JSON.stringify(saved.reference);
  let candidate: unknown;
  try { candidate = JSON.parse(saved.content); } catch { return `Conflict evidence ${named} is malformed.`; }
  const parsed = ConflictRecordSchema.safeParse(candidate);
  if (!parsed.success) return `Conflict evidence ${named} is malformed.`;
  const conflict = parsed.data;
  // The project inbox is a singleton; absence has no record from which to recover its owner generation.
  if (subject !== undefined && !(subject.kind === "project-inbox/inbox" && subject.owner.type !== "person" && subject.owner.uid === undefined
    ? conflict.record.kind === subject.kind : sameReference(conflict.record, subject))) return null;
  return id === undefined || conflict.location.kind !== "entry" || conflict.location.id === id ? `The entry has an unresolved conflict: ${named}.` : null;
}
