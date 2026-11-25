/** Project flagged personal captures into backend-specific Errand picker choices. */
import { resolveInboxEntryOperand } from "../../lib/inbox-entry-operand.js";
import { extractReminderEntries } from "../../lib/session-init/inbox-reminders.js";
import { parseEntryList } from "../../lib/store/kinds/entry-list.js";

/** A picker label and the exact operand its owning adoption handler accepts. */
export interface ErrandCapture { label: string; key: string }

/** Read title selectors before the storage flip and stable qualified IDs afterward. */
export function projectErrandCaptures(content: string, stateOffBranch: boolean): ErrandCapture[] {
  if (!stateOffBranch) return extractReminderEntries({ content }).entries.map(entry => ({ key: entry.key, label: entry.key }));
  const parsed = parseEntryList(content, "personal/inbox");
  if (!parsed.success) throw new Error(parsed.error);
  const seen = new Set<string>();
  const entries: ErrandCapture[] = [];
  for (const entry of parsed.data.entries) {
    if (entry.id === undefined) throw new Error(`Entry ${entry.title} has no valid identity. Persist the list through its store to stamp entry IDs.`);
    if (seen.has(entry.id)) throw new Error(`Duplicate entry identity ${entry.id}. Give each entry a unique _Id:_ before routing it.`);
    seen.add(entry.id);
    if (entry.section !== "Errand" || (entry.fields.Hold !== "true" && entry.fields.Remind !== "true")) continue;
    const key = `personal:${entry.id}`;
    entries.push({ key, label: `${entry.title} (${key})` });
  }
  return entries;
}

/** Classify an explicit seed without weakening the adoption handler's live checks. */
export async function resolveErrandCapture(seed: string | null, entries: ErrandCapture[], stateOffBranch: boolean): Promise<string | undefined> {
  if (seed === null) return undefined;
  if (!stateOffBranch) return entries.find(entry => entry.key === seed)?.key;
  try { return await resolveInboxEntryOperand({ literal: seed, stateOffBranch: true }); }
  catch { return undefined; }
}
