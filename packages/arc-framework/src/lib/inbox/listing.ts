/** One completeness-preserving reader for every route source and destination list. */
import { SlugSchema } from "../kernel/index.js";
import { parseEntryList } from "../store/kinds/entry-list.js";
import { maskComments } from "../store/concurrency/entries.js";
import { listInboxEntriesNamingTarget } from "../user-sync/inbox-target.js";
import { targetNamedByLine } from "../store/kinds/entry-fields.js";
import { resolveEntryList, failure, type ResolvedEntryList } from "./lists.js";
import { markSurvivors } from "./survivors.js";
import { inboundPendingFigures } from "./pending.js";
import type { InboxContext, InboxResult, InboxRow, InboxRefusal, InboxOutcome } from "./types.js";

/** List a semantic inbox or work item's entry list.
 * @param input - List selector and optional personal capture target.
 * @param context - Store and identity binding.
 * @returns Versioned rows or a repairable refusal.
 */
export async function listInbox(input: { list: string; target?: string }, context: InboxContext): Promise<InboxResult> {
  if (!context.store.capabilities.stateOffBranch) return refused(input.list, failure("unsupported", "arc inbox requires stateOffBranch capability.", "Use arc user inbox-list --target <slug> until the capability flips.").refusal);
  if (!SlugSchema.safeParse(context.identity).success) return refused(input.list, failure("identity-missing", "A valid ARC identity is required to read inbox receipts.", "Configure your ARC identity, then retry.").refusal);
  if (input.target !== undefined && !SlugSchema.safeParse(input.target).success) return refused(input.list, failure("invalid-input", "The target must be a work-unit slug.", "Use arc inbox personal --target <slug>.").refusal);
  if (input.target !== undefined && input.list !== "personal") return refused(input.list, failure("invalid-input", "Only the personal inbox carries work-unit capture targets.", "Use arc inbox personal --target <slug>.").refusal);
  const resolved = await resolveEntryList(input.list, context);
  if (resolved.status === "refused") return refused(input.list, resolved.refusal);
  const rows = rowsInList(resolved.result);
  if (rows.status === "refused") return refused(input.list, rows.refusal);
  const marked = await markSurvivors(rows.result, resolved.result, context);
  if (marked.status === "refused") return refused(input.list, marked.refusal);
  const selected = filterTarget(marked.result, resolved.result, input.target);
  if (selected.status === "refused") return refused(input.list, selected.refusal);
  return { schemaVersion: 1, mode: "inbox", state: input.target === undefined ? "listed" : selected.result.length ? "named" : "clear", list: input.list,
    ...(input.target === undefined ? {} : { target: input.target }), entries: selected.result,
    ...inboundFigures(resolved.result, rows.result, context),
  };
}

/** Parse an already resolved list, retaining its record mutation basis on every row.
 * @param list - Record and declared grammar.
 * @returns Exact entries or a malformed-list refusal.
 */
export function rowsInList(list: ResolvedEntryList): InboxOutcome<InboxRow[]> {
  if (list.saved === null) return { status: "ok", result: [] };
  const parsed = parseEntryList(list.saved.content, list.kind);
  if (!parsed.success) return failure("record-malformed", parsed.error, "Repair the entry list, then list it again.");
  const entries: InboxRow[] = [];
  for (const row of parsed.data.entries) {
    if (row.id === undefined) return failure("record-malformed", `Entry ${row.title} has no valid identity.`, "Persist the list through its store to stamp entry IDs, then list it again.");
    if (entries.some((entry) => entry.id === row.id)) return failure("record-malformed", `Duplicate entry identity ${row.id}.`, "Give each entry a unique _Id:_ before routing it.");
    entries.push({ id: row.id, title: row.title, section: row.section, raw: row.bytes, version: row.version, fields: row.fields,
      sourceVersion: list.saved.version, held: row.fields.Hold === "true" });
  }
  return { status: "ok", result: entries };
}

function filterTarget(rows: InboxRow[], list: ResolvedEntryList, target?: string): InboxOutcome<InboxRow[]> {
  if (target === undefined) return { status: "ok", result: rows };
  const listing = listInboxEntriesNamingTarget(list.saved?.content ?? "", target);
  if (listing.diagnostics.length > 0) return failure("record-malformed", listing.diagnostics.join(" "), "Repair every unreadable capture or stray target line, then retry arc inbox personal --target <slug>.");
  return { status: "ok", result: rows.filter((row) => maskComments(row.raw).split("\n").some((line) => targetNamedByLine(line) === target)) };
}

function inboundFigures(list: ResolvedEntryList, rows: InboxRow[], context: InboxContext) {
  if (list.kind !== "work-item/inbound") return {};
  const pending = inboundPendingFigures(rows, context.now());
  const backlog = list.primary?.placement?.kind === "backlog";
  return { pending, ...(backlog && rows.length ? { retriage: { text: `Re-triage ${list.selector}: ${pending.count} inbound entries, oldest ${pending.oldestDate ?? "unknown date"}.` } } : {}) };
}

function refused(list: string, refusal: InboxRefusal): InboxResult {
  return { schemaVersion: 1, mode: "inbox", state: "refused", list, code: refusal.code, reason: refusal.condition, remedy: refusal.remedy,
    ...(refusal.provenance === undefined ? {} : { provenance: refusal.provenance }) };
}
