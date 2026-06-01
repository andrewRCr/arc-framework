/**
 * Inbox reminder-flag extractor — surfaces `## Atomic` USER-INBOX entries that
 * the session-init nudge should keep in view, with their `_Created:_` aging date.
 *
 * Two managed flags opt an entry in, both written as a backtick-delimited value
 * (`` - _Remind:_ `true` `` / `` - _Hold:_ `true` ``), absent when unset:
 *
 * - `_Remind:_` — a capture-time "don't let me forget" switch (nudge-until-drained).
 * - `_Hold:_` — a drain-time retain marker (the escape-hatch): the entry is
 *   deliberately kept rather than routed, so it is excluded from the housekeep
 *   offer (see `inbox-state`) but still surfaced here so a retained capture
 *   cannot rot.
 *
 * Both pair with a tool-stamped `` - _Created:_ `<YYYY-MM-DD>` `` aging anchor
 * (re-stamped to the retain date when an entry is held). The reminder is
 * personal-`USER-INBOX`-only and `## Atomic`-only; `## Backlog` is never nudged.
 *
 * Pure core over the inbox text: it extracts the flagged entries; ageing them
 * against the threshold is the staleness sweep's job.
 *
 * @module
 */

import { parseCrossWuEntries } from "../user-sync/index.js";
import { managedFieldValue, managedFlagIsTrue } from "./managed-field.js";

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

/**
 * Extract the reminder-surfaced Atomic entries from inbox content — those
 * carrying `_Remind:_ \`true\`` (capture-time) or `_Hold:_ \`true\`` (drain-time
 * retain).
 *
 * @param options - The inbox file content.
 * @returns The flagged entries, each with its key and (possibly empty) created date.
 */
export function extractReminderEntries(options: ExtractReminderEntriesOptions): ReminderEntriesResult {
  const entries: ReminderEntry[] = [];
  for (const parse of parseCrossWuEntries(options.content, "user-inbox")) {
    if (!parse.ok || parse.entry.section !== "Atomic") continue;
    const raw = parse.entry.raw;
    if (!managedFlagIsTrue(raw, "Remind") && !managedFlagIsTrue(raw, "Hold")) continue;
    entries.push({ key: parse.entry.key, created: managedFieldValue(raw, "Created") ?? "" });
  }
  return { entries };
}
