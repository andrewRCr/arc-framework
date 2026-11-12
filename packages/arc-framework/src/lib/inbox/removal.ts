/** Version-bound removals preserve edits racing their observed source mutation. */
import { resolveEntryList, failure, withProvenance } from "./lists.js";
import { rowsInList } from "./listing.js";
import { withoutEntry } from "./entry-text.js";
import type { InboxContext, InboxOutcome } from "./types.js";
import { entryConflictRefusal } from "./conflicts.js";
/** Exact source entry's settlement. */
export interface EntryRemoval { disposition: "removed" | "retained" | "absent"; foundVersion?: string }
/** Remove only the entry bytes at the caller's observed version and read back survivors.
 * @param input - Inbox identity and entry version listed by the caller.
 * @param context - Invocation store and identity.
 * @returns Removed, retained with current version, absent, or refusal.
 */
export async function removeInboxEntry(input: { list: "personal" | "project"; id: string; expectedVersion: string }, context: InboxContext): Promise<InboxOutcome<EntryRemoval>> {
  if (!/^[0-9a-f]{8}$/u.test(input.id) || !/^v1:[0-9a-f]{16}$/u.test(input.expectedVersion)) return failure("invalid-input", "Removal requires an ID and its exact entry version.", "Read arc inbox <list>, then use --id <id> --expected-version <version>.");
  const source = await resolveEntryList(input.list, context);
  if (source.status === "refused") return source;
  const conflict = await entryConflictRefusal(source.result, input.id, context);
  if (conflict !== null) return conflict;
  const rows = rowsInList(source.result);
  if (rows.status === "refused") return rows;
  const entry = rows.result.find(row => row.id === input.id);
  if (entry === undefined) return { status: "ok", result: { disposition: "absent" } };
  if (entry.version !== input.expectedVersion) return { status: "ok", result: { disposition: "retained", foundVersion: entry.version } };
  const written = await context.store.write({ action: "put", reference: source.result.reference, expected: source.result.saved?.version ?? null,
    content: withoutEntry(source.result.saved?.content ?? "", source.result.kind, input.id), provenance: { verb: "inbox-remove", lifecycleAction: "remove" } });
  if (written.status === "refused") return { status: "refused", refusal: withProvenance(written.refusal) };
  const after = await resolveEntryList(input.list, context);
  if (after.status === "refused") return after;
  const afterConflict = await entryConflictRefusal(after.result, input.id, context);
  if (afterConflict !== null) return afterConflict;
  const current = rowsInList(after.result);
  if (current.status === "refused") return current;
  const survivor = current.result.find(row => row.id === input.id);
  return { status: "ok", result: survivor === undefined ? { disposition: "removed" } : { disposition: "retained", foundVersion: survivor.version } };
}
