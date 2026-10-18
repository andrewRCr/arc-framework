/** Resolve version-bound or pre-flip digest-bound partial captures exactly once. */
import { resolveEntryList } from "./lists.js";
import { rowsInList } from "./listing.js";
import { removeInboxEntry, type EntryRemoval } from "./removal.js";
import type { InboxContext, InboxOutcome } from "./types.js";
import { entryConflictRefusal } from "./conflicts.js";
/** Remove a partial origin using its original source basis, retaining unmatched legacy captures.
 * @param binding - Exact authority origin; legacy digest comes from the selected marker.
 * @param context - Current identity and store.
 * @returns Exact settlement disposition.
 */
export async function removePartialOrigin(binding: { originEntry: string | null; originEntryVersion?: string; originEntrySourceDigest?: string }, context: InboxContext, legacyDigest?: (content: string, title: string, expectedDigest?: string) => string): Promise<InboxOutcome<EntryRemoval>> {
  if (binding.originEntry === null) return { status: "ok", result: { disposition: "absent" } };
  const qualified = /^(personal|project):([0-9a-f]{8})$/u.exec(binding.originEntry);
  if (qualified !== null && binding.originEntryVersion !== undefined) return removeInboxEntry({ list: qualified[1] as "personal" | "project", id: qualified[2] ?? "", expectedVersion: binding.originEntryVersion }, context);
  const inbox = await resolveEntryList("personal", context);
  if (inbox.status === "refused") return inbox;
  const rows = rowsInList(inbox.result);
  if (rows.status === "refused") return rows;
  const row = rows.result.find(entry => entry.title === binding.originEntry);
  const conflict = await entryConflictRefusal(inbox.result, row?.id, context);
  if (conflict !== null) return conflict;
  if (row === undefined) return { status: "ok", result: { disposition: "absent" } };
  let matches = false;
  try { matches = legacyDigest?.(inbox.result.saved?.content ?? "", binding.originEntry, binding.originEntrySourceDigest) === binding.originEntrySourceDigest; } catch { /* An unresolvable legacy binding retains its capture. */ }
  return matches ? removeInboxEntry({ list: "personal", id: row.id, expectedVersion: row.version }, context)
    : { status: "ok", result: { disposition: "retained", foundVersion: row.version } };
}
