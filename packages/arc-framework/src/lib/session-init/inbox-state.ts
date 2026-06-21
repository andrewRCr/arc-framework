/**
 * Inbox-state probe — a session-init signal that counts the routable entries in
 * a developer's `USER-INBOX` and derives whether housekeeping is due.
 *
 * The pure core counts well-formed (`parse.ok`) entries across the inbox's
 * `## Errand` and `## Work Unit` sections, so session-init can offer housekeep
 * from a machine-resolved count rather than an agent re-scan. "Routable" means
 * a well-formed entry that still needs routing: malformed blocks are skipped
 * (mirroring the staleness sweep skipping entries it cannot age), and so are
 * entries deliberately retained at a drain (`_Hold:_ \`true\``) — a held entry
 * is triaged, not pending, so it must not re-trigger the housekeep offer (the
 * reminder sweep surfaces it instead; see `inbox-reminders`).
 *
 * The caller (the session-init probe) owns identity-gating and the file read;
 * this module carries no file or identity coupling of its own.
 *
 * @module
 */

import { parseCrossWuEntries } from "../user-sync/index.js";
import { managedFlagIsTrue } from "./managed-field.js";

export interface InboxStateResult {
  /** Count of well-formed (`parse.ok`) entries across `## Errand` + `## Work Unit`. */
  routableCount: number;
  /** Whether housekeeping is due — true when at least one entry is routable. */
  housekeepNeeded: boolean;
}

export interface RunInboxStateOptions {
  /** The `USER-INBOX` file's full text. */
  content: string;
}

/**
 * Count routable `USER-INBOX` entries and derive the housekeep-needed flag.
 *
 * @param options - The inbox file content.
 * @returns The routable-entry count and the housekeep-needed flag.
 */
export function runInboxState(options: RunInboxStateOptions): InboxStateResult {
  const routableCount = parseCrossWuEntries(options.content, "user-inbox").filter(
    (parse) => parse.ok && !managedFlagIsTrue(parse.entry.raw, "Hold"),
  ).length;
  return { routableCount, housekeepNeeded: routableCount > 0 };
}
