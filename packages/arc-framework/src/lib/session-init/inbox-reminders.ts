/**
 * Inbox reminder-flag extractor — surfaces `_Remind:_`-flagged `## Atomic`
 * USER-INBOX entries with their `_Created:_` aging date.
 *
 * A capture opts into a reminder with a managed field whose value is a code
 * span — `` - _Remind:_ `true` `` — written only when set (its absence reads as
 * `false`), paired with a tool-stamped `` - _Created:_ `<YYYY-MM-DD>` `` aging
 * anchor. The backtick delimiting is the machine signal that the value is data,
 * not prose, so a bare `_Remind:_ true` is ignored. The reminder is personal-
 * `USER-INBOX`-only and `## Atomic`-only; `## Backlog` is never nudged.
 *
 * Pure core over the inbox text: it extracts the flagged entries; ageing them
 * against the threshold is the staleness sweep's job.
 *
 * @module
 */

import { parseCrossWuEntries } from "../user-sync/index.js";

/** A flagged Atomic capture surfaced for the reminder nudge. */
export interface ReminderEntry {
  /** The entry's H3 title — its identifying key. */
  key: string;
  /** The `_Created:_` capture date (`YYYY-MM-DD`), or `""` when absent. */
  created: string;
}

export interface ExtractReminderEntriesOptions {
  /** The `USER-INBOX` file's full text. */
  content: string;
}

export interface ReminderEntriesResult {
  /** The reminder-flagged Atomic entries. */
  entries: ReminderEntry[];
}

/** A managed field's backtick-delimited value: `_Field:_ \`value\``. */
const managedValue = (field: string): RegExp =>
  new RegExp(`_${field}:_\\s*\`([^\`]*)\``);

const REMIND_VALUE = managedValue("Remind");
const CREATED_VALUE = managedValue("Created");

/**
 * Extract the reminder-flagged Atomic entries from inbox content.
 *
 * @param options - The inbox file content.
 * @returns The flagged entries, each with its key and (possibly empty) created date.
 */
export function extractReminderEntries(options: ExtractReminderEntriesOptions): ReminderEntriesResult {
  const entries: ReminderEntry[] = [];
  for (const parse of parseCrossWuEntries(options.content, "user-inbox")) {
    if (!parse.ok || parse.entry.section !== "Atomic") continue;
    if (REMIND_VALUE.exec(parse.entry.raw)?.[1] !== "true") continue;
    entries.push({ key: parse.entry.key, created: CREATED_VALUE.exec(parse.entry.raw)?.[1] ?? "" });
  }
  return { entries };
}
